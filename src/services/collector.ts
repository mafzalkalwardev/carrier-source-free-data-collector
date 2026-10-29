import type { CarrierRecord } from '../types/carrier';
import type {
  CollectionJob,
  ExtractCardsResult,
  PartialCarrierCard,
  SearchContext,
} from '../types/job';
import { DuplicateManager, mergeCarrier, createCarrierFromCard } from './duplicateManager';
import {
  getAllCarriers,
  upsertCarriers,
  saveCapturedPage,
  hasPageFingerprint,
  saveJob,
  logError,
} from '../storage/repositories';
import { isCarrierSourceUrl } from '../utils/urlValidation';

const CONTENT_SCRIPT_FILE = 'content/contentScript.js';

function isNoReceiverError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /receiving end does not exist/i.test(msg) ||
    /could not establish connection/i.test(msg) ||
    /message channel is closed/i.test(msg) ||
    /message port closed/i.test(msg) ||
    /back\/forward cache/i.test(msg) ||
    /bfcache/i.test(msg)
  );
}

async function pingTab(tabId: number): Promise<boolean> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, { type: 'PING' })) as {
      ok?: boolean;
    };
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

/** Inject content script when the tab was open before extension reload. */
export async function ensureContentScript(tabId: number): Promise<void> {
  if (await pingTab(tabId)) return;

  const tab = await chrome.tabs.get(tabId);
  if (!isCarrierSourceUrl(tab.url)) {
    throw new Error(
      'Active tab is not a CarrierSource page. Open https://www.carriersource.io/ and try again.'
    );
  }

  // Wait until the document is ready enough to accept injection
  if (tab.status !== 'complete') {
    await waitForTabComplete(tabId, 15000);
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch (err) {
    throw new Error(
      `Could not attach to CarrierSource tab. Refresh the page and try again. (${
        err instanceof Error ? err.message : String(err)
      })`
    );
  }

  // Brief settle for listener registration
  for (let attempt = 0; attempt < 8; attempt++) {
    await sleep(150);
    if (await pingTab(tabId)) return;
  }

  throw new Error(
    'Content script did not respond after injection. Refresh the CarrierSource tab, then try again.'
  );
}

export async function sendToTab<T = unknown>(
  tabId: number,
  type: string,
  payload?: Record<string, unknown>
): Promise<T> {
  await ensureContentScript(tabId);

  try {
    return (await chrome.tabs.sendMessage(tabId, { type, payload })) as T;
  } catch (err) {
    if (!isNoReceiverError(err)) throw err;

    // One more inject + retry (SPA navigation can drop the script frame)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
    await sleep(200);
    return (await chrome.tabs.sendMessage(tabId, { type, payload })) as T;
  }
}

export async function findCarrierSourceTab(): Promise<chrome.tabs.Tab | null> {
  const patterns = [
    'https://www.carriersource.io/*',
    'https://carriersource.io/*',
  ];

  // Prefer the focused window's active CarrierSource tab
  const focused = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    url: patterns,
  });
  if (focused[0]?.id != null) return focused[0];

  const activeAny = await chrome.tabs.query({ active: true, url: patterns });
  if (activeAny[0]?.id != null) return activeAny[0];

  const tabs = await chrome.tabs.query({ url: patterns });
  return tabs.find((t) => t.id != null) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearInterval(timer);
      resolve();
    };

    const onUpdated = (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    const timer = setInterval(async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete' || Date.now() - started > timeoutMs) {
          done();
        }
      } catch {
        done();
      }
    }, 250);
  });
}

export type PaginationWaitResult = {
  ready: boolean;
  challengeTimedOut: boolean;
  detail: string;
  fingerprint?: string;
};

/**
 * After clicking Next, CarrierSource often does a full navigation (and may show
 * an automatic Cloudflare check). The content-script port closes — so we wait
 * at the tab level, re-inject, wait out challenges (never bypass), then confirm cards.
 */
export async function waitAfterPaginationNavigation(
  tabId: number,
  previousFingerprint: string,
  onStatus?: (detail: string) => Promise<void> | void
): Promise<PaginationWaitResult> {
  await sleep(400);
  await waitForTabComplete(tabId, 30000);

  // Re-attach after navigation / bfcache eviction
  try {
    await ensureContentScript(tabId);
  } catch {
    await sleep(800);
    await ensureContentScript(tabId);
  }

  const challengeDeadline = Date.now() + 90000;
  let sawChallenge = false;

  while (Date.now() < challengeDeadline) {
    try {
      const state = await sendToTab<{
        ok: boolean;
        challenge?: boolean;
        carrierLinkCount?: number;
        title?: string;
      }>(tabId, 'GET_PAGE_READY_STATE');

      if (state.challenge) {
        sawChallenge = true;
        await onStatus?.(
          'Browser verification / Cloudflare check detected. Waiting for it to finish (not bypassing). Complete it in the tab if prompted…'
        );
        await sleep(1200);
        continue;
      }

      // Challenge cleared (or never shown) — wait for result cards
      const extracted = await sendToTab<ExtractCardsResult & { timedOut?: boolean }>(
        tabId,
        'EXTRACT_CARDS_WHEN_READY',
        { timeoutMs: 12000, minCards: 1 }
      );

      if (
        extracted.ok &&
        extracted.carriers.length > 0 &&
        extracted.pageFingerprint !== previousFingerprint
      ) {
        return {
          ready: true,
          challengeTimedOut: false,
          detail: sawChallenge
            ? 'Verification finished; new result page ready.'
            : 'Next result page ready.',
          fingerprint: extracted.pageFingerprint,
        };
      }

      if (extracted.ok && extracted.carriers.length > 0) {
        // Same fingerprint — may still be previous page; keep waiting briefly
        await sleep(800);
        continue;
      }

      await onStatus?.('Waiting for next page results to finish rendering…');
      await sleep(800);
    } catch (err) {
      if (isNoReceiverError(err)) {
        await onStatus?.('Page navigated — reattaching to CarrierSource tab…');
        await waitForTabComplete(tabId, 15000);
        try {
          await ensureContentScript(tabId);
        } catch {
          await sleep(500);
        }
        continue;
      }
      throw err;
    }
  }

  return {
    ready: false,
    challengeTimedOut: sawChallenge,
    detail: sawChallenge
      ? 'Timed out waiting for browser verification to clear. Complete the check in the CarrierSource tab, then Resume or run Collect again.'
      : 'Timed out waiting for the next results page after clicking Next.',
  };
}

export async function captureCurrentPage(
  tabId: number,
  job: CollectionJob
): Promise<{ job: CollectionJob; saved: number; total: number }> {
  const response = await sendToTab<ExtractCardsResult>(tabId, 'EXTRACT_CARDS');
  if (!response?.ok) {
    job.status = 'error';
    job.errorMessage = response?.error ?? 'Failed to extract cards from page.';
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
    await logError('captureCurrentPage', job.errorMessage);
    return { job, saved: 0, total: 0 };
  }

  if (!response.carriers.length) {
    job.status = 'partially_completed';
    job.statusDetail =
      'No genuine carrier cards found on this page. Confirm filters and that results are visible.';
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
    return { job, saved: 0, total: 0 };
  }

  // Skip if identical page already captured in this session fingerprint store
  const already = await hasPageFingerprint(response.pageFingerprint);
  if (already) {
    job.duplicatesSkipped += response.carriers.length;
    job.statusDetail = 'Page fingerprint already captured — skipped duplicate result set.';
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
    return { job, saved: 0, total: response.carriers.length };
  }

  const result = await persistCards(response.carriers, response.searchContext, job);
  await saveCapturedPage({
    id: `page_${Date.now()}`,
    url: response.searchContext.url,
    pageFingerprint: response.pageFingerprint,
    carrierCount: response.carriers.length,
    capturedAt: new Date().toISOString(),
    jobId: job.id,
  });

  job.pagesCaptured += 1;
  job.carriersFound += response.carriers.length;
  job.carriersSaved += result.saved;
  job.duplicatesSkipped += result.duplicates;
  job.lastPageFingerprint = response.pageFingerprint;
  job.lastUrl = response.searchContext.url;
  job.searchContext = response.searchContext;
  job.status = 'completed';
  job.statusDetail = `Captured ${result.saved} new/updated records from ${response.carriers.length} cards.`;
  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
  await saveJob(job);

  return { job, saved: result.saved, total: response.carriers.length };
}

export async function persistCards(
  cards: PartialCarrierCard[],
  searchContext: SearchContext,
  job: CollectionJob
): Promise<{ saved: number; duplicates: number }> {
  const existing = await getAllCarriers();
  const manager = new DuplicateManager();
  manager.load(existing);

  const equipment =
    searchContext.equipmentTypes[0] ??
    job.searchContext?.equipmentTypes[0] ??
    null;
  const searchState = searchContext.searchState;
  const searchCity = searchContext.searchCity;

  let saved = 0;
  let duplicates = 0;
  const batch: CarrierRecord[] = [];

  for (const card of cards) {
    // Optional filter: carriers only
    if (job.searchContext?.carriersOnly && card.isBroker) {
      duplicates += 1;
      continue;
    }
    // Optional filter: active authority only (when status is visible)
    if (
      job.searchContext?.activeAuthorityOnly &&
      card.authorityStatus &&
      !/active/i.test(card.authorityStatus)
    ) {
      duplicates += 1;
      continue;
    }

    const merge = manager.ingest(card, equipment, searchState, searchCity);
    if (merge.skippedAsDuplicate) duplicates += 1;
    else saved += 1;
    batch.push(merge.record);
  }

  // Batch write
  const uniqueById = new Map(batch.map((r) => [r.id, r]));
  await upsertCarriers([...uniqueById.values()]);
  return { saved, duplicates };
}

export async function enrichFromProfile(
  tabId: number,
  carrierId: string
): Promise<CarrierRecord | null> {
  const response = await sendToTab<{
    ok: boolean;
    profile?: Partial<CarrierRecord>;
    error?: string;
  }>(tabId, 'EXTRACT_PROFILE');

  const carriers = await getAllCarriers();
  const existing = carriers.find((c) => c.id === carrierId);
  if (!existing) return null;

  if (!response.ok || !response.profile) {
    existing.profileStatus = 'unavailable';
    await upsertCarriers([existing]);
    return existing;
  }

  const incoming = createCarrierFromCard(
    {
      companyName: response.profile.companyName ?? existing.companyName,
      usdot: response.profile.usdot ?? existing.usdot,
      mcNumbers: response.profile.mcNumbers ?? existing.mcNumbers,
      ffNumbers: response.profile.ffNumbers ?? [],
      profileUrl: response.profile.profileUrl ?? existing.profileUrl,
      websiteUrl: response.profile.websiteUrl ?? null,
      city: response.profile.city ?? null,
      businessState: response.profile.businessState ?? null,
      zipCode: response.profile.zipCode ?? null,
      businessAddress: response.profile.businessAddress ?? null,
      classification: response.profile.classification ?? null,
      operationType: response.profile.operationType ?? null,
      truckTypes: response.profile.truckTypes ?? [],
      freightCategories: response.profile.freightCategories ?? [],
      shipmentTypes: response.profile.shipmentTypes ?? [],
      specializedServices: response.profile.specializedServices ?? [],
      powerUnits: response.profile.powerUnits ?? null,
      authorityStatus: response.profile.authorityStatus ?? null,
      authorityStartDate: response.profile.authorityStartDate ?? null,
      safetyRating: response.profile.safetyRating ?? null,
      insuranceLimit: null,
      overallRating: response.profile.overallRating ?? null,
      reviewCount: response.profile.reviewCount ?? null,
      isSponsored: false,
      isBroker: false,
      sourceUrl: response.profile.profileUrl ?? existing.profileUrl ?? '',
      pageIdentifier: 'profile',
    },
    null,
    null,
    null
  );

  // Overlay rich profile fields
  incoming.description = response.profile.description ?? null;
  incoming.fleet = response.profile.fleet ?? {};
  incoming.mcs150Mileage = response.profile.mcs150Mileage ?? null;
  incoming.mcs150Year = response.profile.mcs150Year ?? null;
  incoming.freightForwarderStatus = response.profile.freightForwarderStatus ?? null;
  incoming.cargoAuthorization = response.profile.cargoAuthorization ?? [];
  incoming.insurance = response.profile.insurance ?? [];
  incoming.inspectionSummary = response.profile.inspectionSummary ?? null;
  incoming.violationSummaries = response.profile.violationSummaries ?? [];
  incoming.ratingCategories = response.profile.ratingCategories ?? {};
  incoming.profileStatus = 'completed';

  const merged = mergeCarrier(existing, incoming).record;
  merged.profileStatus = 'completed';
  await upsertCarriers([merged]);
  return merged;
}

export function assertCarrierSourceTab(tab: chrome.tabs.Tab | null): asserts tab is chrome.tabs.Tab {
  if (!tab?.id || !isCarrierSourceUrl(tab.url)) {
    throw new Error(
      'No CarrierSource tab open. Navigate to https://www.carriersource.io/ and try again.'
    );
  }
}
