import type { CollectionJob, AuthorizationState } from '../types/job';
import { createIdleJob } from '../types/job';
import {
  saveJob,
  getActiveJob,
  getSettings,
  getAllCarriers,
  hasPageFingerprint,
  saveCapturedPage,
  logError,
} from '../storage/repositories';
import {
  captureCurrentPage,
  findCarrierSourceTab,
  assertCarrierSourceTab,
  sendToTab,
  persistCards,
  enrichFromProfile,
  waitAfterPaginationNavigation,
} from './collector';
import type { ExtractCardsResult, PaginationInfo } from '../types/job';

let paginationAbort = false;
let paginationPaused = false;

export async function getOrCreateJob(): Promise<CollectionJob> {
  const active = await getActiveJob();
  if (active) return active;
  const job = createIdleJob();
  await saveJob(job);
  return job;
}

export async function updateJobOptions(
  patch: Partial<CollectionJob>
): Promise<CollectionJob> {
  const job = await getOrCreateJob();
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  await saveJob(job);
  return job;
}

export async function requireAuthorization(
  kind: 'basic' | 'automated' | 'profiles'
): Promise<AuthorizationState> {
  const settings = await getSettings();
  const auth = settings.authorization;
  if (!auth.tosAcknowledged) {
    throw new Error(
      'Acknowledge CarrierSource Terms of Service and confirm you have appropriate permission before collecting data.'
    );
  }
  if (kind === 'automated' && !auth.automatedTraversalAuthorized) {
    throw new Error(
      'Automated page traversal is disabled until you confirm written authorization covering that operation.'
    );
  }
  if (kind === 'profiles' && !auth.profileEnrichmentAuthorized) {
    throw new Error(
      'Profile enrichment is disabled until you confirm written authorization covering free profile visits.'
    );
  }
  return auth;
}

export async function runCaptureCurrent(includeProfiles: boolean): Promise<CollectionJob> {
  await requireAuthorization('basic');
  const tab = await findCarrierSourceTab();
  assertCarrierSourceTab(tab);

  let job = await getOrCreateJob();
  job = {
    ...job,
    mode: 'capture_current',
    status: 'running',
    includeProfiles,
    startedAt: job.startedAt ?? new Date().toISOString(),
    finishedAt: null,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  };
  await saveJob(job);

  const result = await captureCurrentPage(tab.id!, job);
  job = result.job;

  if (includeProfiles && job.status === 'completed') {
    await requireAuthorization('profiles');
    job = await enrichVisibleProfiles(job, tab.id!);
  }

  return job;
}

export async function startBrowseCapture(includeProfiles: boolean): Promise<CollectionJob> {
  await requireAuthorization('basic');
  const tab = await findCarrierSourceTab();
  assertCarrierSourceTab(tab);

  let job = await getOrCreateJob();
  job.mode = 'capture_as_browse';
  job.status = 'running';
  job.includeProfiles = includeProfiles;
  job.startedAt = job.startedAt ?? new Date().toISOString();
  job.finishedAt = null;
  job.statusDetail = 'Capture As I Browse is active. Navigate results pages manually.';
  job.updatedAt = new Date().toISOString();
  await saveJob(job);

  const start = await sendToTab<{
    ok: boolean;
    initial?: ExtractCardsResult;
  }>(tab.id!, 'START_BROWSE_OBSERVER');

  if (start.initial?.ok && start.initial.carriers.length) {
    const already = await hasPageFingerprint(start.initial.pageFingerprint);
    if (!already) {
      const persisted = await persistCards(
        start.initial.carriers,
        start.initial.searchContext,
        job
      );
      await saveCapturedPage({
        id: `page_${Date.now()}`,
        url: start.initial.searchContext.url,
        pageFingerprint: start.initial.pageFingerprint,
        carrierCount: start.initial.carriers.length,
        capturedAt: new Date().toISOString(),
        jobId: job.id,
      });
      job.pagesCaptured += 1;
      job.carriersFound += start.initial.carriers.length;
      job.carriersSaved += persisted.saved;
      job.duplicatesSkipped += persisted.duplicates;
      job.lastPageFingerprint = start.initial.pageFingerprint;
      job.lastUrl = start.initial.searchContext.url;
      await saveJob(job);
    }
  }

  return job;
}

export async function stopBrowseCapture(): Promise<CollectionJob> {
  const tab = await findCarrierSourceTab();
  if (tab?.id) {
    await sendToTab(tab.id, 'STOP_BROWSE_OBSERVER').catch(() => undefined);
  }
  const job = await getOrCreateJob();
  job.status = 'stopped';
  job.statusDetail = 'Browse capture stopped by user.';
  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
  await saveJob(job);
  return job;
}

export async function handleBrowsePageReady(payload: {
  url: string;
  carriers: ExtractCardsResult['carriers'];
  pageFingerprint: string;
  searchContext: ExtractCardsResult['searchContext'];
}): Promise<void> {
  const job = await getActiveJob();
  if (!job || job.mode !== 'capture_as_browse' || job.status !== 'running') {
    return;
  }

  const already = await hasPageFingerprint(payload.pageFingerprint);
  if (already) {
    job.duplicatesSkipped += payload.carriers.length;
    job.statusDetail = 'Skipped repeated result set while browsing.';
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
    return;
  }

  const persisted = await persistCards(payload.carriers, payload.searchContext, job);
  await saveCapturedPage({
    id: `page_${Date.now()}`,
    url: payload.url,
    pageFingerprint: payload.pageFingerprint,
    carrierCount: payload.carriers.length,
    capturedAt: new Date().toISOString(),
    jobId: job.id,
  });

  job.pagesCaptured += 1;
  job.carriersFound += payload.carriers.length;
  job.carriersSaved += persisted.saved;
  job.duplicatesSkipped += persisted.duplicates;
  job.lastPageFingerprint = payload.pageFingerprint;
  job.lastUrl = payload.url;
  job.statusDetail = `Browse capture: ${job.carriersSaved} records saved across ${job.pagesCaptured} pages.`;
  job.updatedAt = new Date().toISOString();
  await saveJob(job);
}

/**
 * Mode C — Collect All Result Pages.
 * Only runs when automated traversal authorization is confirmed.
 * Uses visible Next / Load More controls; never invents page URLs.
 */
export async function runCollectAllPages(includeProfiles: boolean): Promise<CollectionJob> {
  await requireAuthorization('automated');
  paginationAbort = false;
  paginationPaused = false;

  const tab = await findCarrierSourceTab();
  assertCarrierSourceTab(tab);

  let job = await getOrCreateJob();
  job.mode = 'collect_all_pages';
  job.status = 'running';
  job.includeProfiles = includeProfiles;
  job.startedAt = job.startedAt ?? new Date().toISOString();
  job.finishedAt = null;
  job.errorMessage = null;
  job.statusDetail = 'Collecting via visible pagination controls…';
  job.updatedAt = new Date().toISOString();
  await saveJob(job);

  const seenFingerprints = new Set<string>();
  let consecutiveSame = 0;
  const maxPages = 500; // hard safety cap

  try {
    for (let page = 0; page < maxPages; page++) {
      if (paginationAbort) {
        job.status = 'stopped';
        job.statusDetail = 'Stopped by user during pagination.';
        break;
      }
      while (paginationPaused && !paginationAbort) {
        job.status = 'paused';
        job.statusDetail = 'Paused. Click Resume to continue.';
        job.updatedAt = new Date().toISOString();
        await saveJob(job);
        await sleep(500);
      }
      if (paginationAbort) break;

      job.status = 'running';
      // After Next clicks, results often render asynchronously — wait for cards.
      const extracted = await sendToTab<ExtractCardsResult & { timedOut?: boolean }>(
        tab.id!,
        page === 0 ? 'EXTRACT_CARDS' : 'EXTRACT_CARDS_WHEN_READY',
        page === 0 ? undefined : { timeoutMs: 12000, minCards: 1 }
      );
      if (!extracted.ok) {
        job.status = 'error';
        job.errorMessage = extracted.error ?? 'Extraction failed during pagination.';
        break;
      }

      if (!extracted.carriers.length) {
        // First page empty = real problem. Later empty after retries = end/blocked.
        if (page === 0) {
          job.status = 'partially_completed';
          job.statusDetail =
            'No accessible carrier cards on this page. Confirm results are visible, then try Capture Current Page.';
        } else {
          job.status = 'completed';
          job.statusDetail =
            `Finished after ${job.pagesCaptured} page(s). Next page had no accessible cards (end of results or layout change). Your ${job.carriersSaved} saved records can still be downloaded.`;
        }
        break;
      }

      if (seenFingerprints.has(extracted.pageFingerprint)) {
        consecutiveSame += 1;
        if (consecutiveSame >= 2) {
          job.status = 'completed';
          job.statusDetail =
            'Repeated page fingerprint detected — pagination appears finished or stuck.';
          break;
        }
      } else {
        consecutiveSame = 0;
        seenFingerprints.add(extracted.pageFingerprint);

        if (!(await hasPageFingerprint(extracted.pageFingerprint))) {
          const persisted = await persistCards(
            extracted.carriers,
            extracted.searchContext,
            job
          );
          await saveCapturedPage({
            id: `page_${Date.now()}_${page}`,
            url: extracted.searchContext.url,
            pageFingerprint: extracted.pageFingerprint,
            carrierCount: extracted.carriers.length,
            capturedAt: new Date().toISOString(),
            jobId: job.id,
          });
          job.pagesCaptured += 1;
          job.carriersFound += extracted.carriers.length;
          job.carriersSaved += persisted.saved;
          job.duplicatesSkipped += persisted.duplicates;
        } else {
          job.duplicatesSkipped += extracted.carriers.length;
        }
      }

      job.lastPageFingerprint = extracted.pageFingerprint;
      job.lastUrl = extracted.searchContext.url;
      job.checkpoint = {
        lastUrl: extracted.searchContext.url,
        lastPageFingerprint: extracted.pageFingerprint,
        processedProfileUrls: [],
        queueIndex: 0,
        savedAt: new Date().toISOString(),
      };
      job.statusDetail = `Processed ${job.pagesCaptured} pages · ${job.carriersSaved} records saved.`;
      job.updatedAt = new Date().toISOString();
      await saveJob(job);

      const pagination = await sendToTab<{ ok: boolean; pagination: PaginationInfo }>(
        tab.id!,
        'DETECT_PAGINATION'
      );

      if (!pagination.ok || !pagination.pagination.hasNext) {
        job.status = 'completed';
        job.statusDetail = `Reached end of accessible results. ${pagination.pagination?.detail ?? ''}`.trim();
        break;
      }

      if (pagination.pagination.strategy === 'infinite_scroll') {
        job.status = 'blocked';
        job.statusDetail =
          'Infinite scroll detected. Automated scrolling is not started until you confirm live behavior. Use Capture As I Browse or Capture Current Page instead.';
        break;
      }

      job.statusDetail = `Scrolling to bottom pagination and clicking Next (>)… (${job.pagesCaptured} pages done)`;
      job.updatedAt = new Date().toISOString();
      await saveJob(job);

      let clicked: { ok: boolean; clicked: boolean; detail: string };
      try {
        clicked = await sendToTab<{ ok: boolean; clicked: boolean; detail: string }>(
          tab.id!,
          'CLICK_NEXT_PAGE'
        );
      } catch (err) {
        job.status = 'partially_completed';
        job.statusDetail = `Could not click Next: ${
          err instanceof Error ? err.message : String(err)
        }`;
        break;
      }

      if (!clicked.clicked) {
        job.status = 'partially_completed';
        job.statusDetail = `Could not advance pagination: ${clicked.detail}`;
        break;
      }

      // Full navigations close the content-script port (bfcache). Wait at tab level.
      const wait = await waitAfterPaginationNavigation(
        tab.id!,
        extracted.pageFingerprint,
        async (detail) => {
          job.statusDetail = detail;
          job.updatedAt = new Date().toISOString();
          await saveJob(job);
        }
      );

      if (!wait.ready) {
        job.status = wait.challengeTimedOut ? 'blocked' : 'partially_completed';
        job.statusDetail = wait.detail;
        break;
      }
    }

    if (job.status === 'running') {
      job.status = 'completed';
      job.statusDetail = `Finished safety-capped pagination run (${job.pagesCaptured} pages).`;
    }
  } catch (err) {
    job.status = 'error';
    job.errorMessage = err instanceof Error ? err.message : String(err);
    await logError('runCollectAllPages', job.errorMessage);
  }

  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
  await saveJob(job);

  if (includeProfiles && (job.status === 'completed' || job.status === 'partially_completed')) {
    try {
      await requireAuthorization('profiles');
      job = await enrichVisibleProfiles(job, tab.id!);
    } catch (err) {
      job.statusDetail = `${job.statusDetail ?? ''} Profile enrichment skipped: ${
        err instanceof Error ? err.message : String(err)
      }`;
      await saveJob(job);
    }
  }

  return job;
}

export function pausePagination(): void {
  paginationPaused = true;
}

export function resumePagination(): void {
  paginationPaused = false;
}

export function stopPagination(): void {
  paginationAbort = true;
  paginationPaused = false;
}

export async function resetCollection(): Promise<CollectionJob> {
  stopPagination();
  const tab = await findCarrierSourceTab();
  if (tab?.id) {
    await sendToTab(tab.id, 'STOP_BROWSE_OBSERVER').catch(() => undefined);
  }
  const job = createIdleJob();
  await saveJob(job);
  return job;
}

async function enrichVisibleProfiles(
  job: CollectionJob,
  tabId: number
): Promise<CollectionJob> {
  const carriers = await getAllCarriers();
  const pending = carriers.filter(
    (c) => c.profileUrl && c.profileStatus === 'not_visited'
  );

  job.mode = 'enrich_profiles';
  job.statusDetail = `Enriching ${pending.length} free profiles…`;
  await saveJob(job);

  let enriched = 0;
  for (const carrier of pending) {
    if (paginationAbort) break;
    if (!carrier.profileUrl) continue;

    try {
      await chrome.tabs.update(tabId, { url: carrier.profileUrl });
      await waitForTabLoad(tabId);
      await sleep(600);
      const updated = await enrichFromProfile(tabId, carrier.id);
      if (updated?.profileStatus === 'completed') enriched += 1;
      job.profilesEnriched = enriched;
      job.statusDetail = `Enriched ${enriched}/${pending.length} profiles.`;
      job.updatedAt = new Date().toISOString();
      await saveJob(job);
    } catch (err) {
      await logError(
        'enrichVisibleProfiles',
        err instanceof Error ? err.message : String(err),
        carrier.profileUrl
      );
    }
  }

  job.status = paginationAbort ? 'stopped' : 'completed';
  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
  await saveJob(job);
  return job;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 20000);

    function listener(
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}
