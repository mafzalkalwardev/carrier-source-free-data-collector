import {
  handleBrowsePageReady,
  runCaptureCurrent,
  startBrowseCapture,
  stopBrowseCapture,
  runCollectAllPages,
  pausePagination,
  resumePagination,
  stopPagination,
  resetCollection,
  getOrCreateJob,
  updateJobOptions,
} from '../services/jobManager';
import {
  getSettings,
  saveAuthorization,
  saveSearchQueue,
  computeStats,
  getAllCarriers,
  clearAllData,
  getActiveJob,
} from '../storage/repositories';
import {
  buildMcOnlyCsv,
  buildCompleteCsv,
  buildXlsxBlob,
  downloadTextFile,
  downloadBlob,
} from '../services/exportService';
import { findCarrierSourceTab } from '../services/collector';
import { isCarrierSourceUrl, isResultsPage, isProfilePage } from '../utils/urlValidation';
import type { AuthorizationState, SearchQueueItem } from '../types/job';
import type { CarrierRecord } from '../types/carrier';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => undefined);
  chrome.sidePanel
    .setOptions({ path: 'sidepanel.html', enabled: true })
    .catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel
    .setOptions({ path: 'sidepanel.html', enabled: true })
    .catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err: unknown) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  return true;
});

async function handleMessage(message: {
  type: string;
  payload?: Record<string, unknown>;
}): Promise<unknown> {
  switch (message.type) {
    case 'CONTENT_READY':
      return { ok: true };

    case 'BROWSE_PAGE_READY':
      await handleBrowsePageReady(
        message.payload as {
          url: string;
          carriers: never[];
          pageFingerprint: string;
          searchContext: never;
        }
      );
      return { ok: true };

    case 'GET_STATE': {
      const [settings, job, stats, carriers, tab] = await Promise.all([
        getSettings(),
        getOrCreateJob(),
        computeStats(),
        getAllCarriers(),
        findCarrierSourceTab(),
      ]);
      return {
        ok: true,
        authorization: settings.authorization,
        searchQueue: settings.searchQueue,
        job,
        stats,
        carriers,
        tab: tab
          ? {
              tabId: tab.id ?? null,
              url: tab.url ?? null,
              title: tab.title ?? null,
              isCarrierSource: isCarrierSourceUrl(tab.url),
              isResultsPage: isResultsPage(tab.url),
              isProfilePage: isProfilePage(tab.url),
            }
          : {
              tabId: null,
              url: null,
              title: null,
              isCarrierSource: false,
              isResultsPage: false,
              isProfilePage: false,
            },
      };
    }

    case 'SAVE_AUTHORIZATION': {
      const auth = message.payload as unknown as AuthorizationState;
      await saveAuthorization(auth);
      return { ok: true, authorization: auth };
    }

    case 'SAVE_QUEUE': {
      const queue = message.payload?.queue as SearchQueueItem[];
      await saveSearchQueue(queue ?? []);
      return { ok: true };
    }

    case 'UPDATE_JOB_OPTIONS': {
      const job = await updateJobOptions(message.payload as Partial<Awaited<ReturnType<typeof getOrCreateJob>>>);
      return { ok: true, job };
    }

    case 'CAPTURE_CURRENT': {
      const includeProfiles = Boolean(message.payload?.includeProfiles);
      const job = await runCaptureCurrent(includeProfiles);
      const stats = await computeStats();
      const carriers = await getAllCarriers();
      return { ok: true, job, stats, carriers };
    }

    case 'START_BROWSE': {
      const includeProfiles = Boolean(message.payload?.includeProfiles);
      const job = await startBrowseCapture(includeProfiles);
      return { ok: true, job };
    }

    case 'STOP_BROWSE': {
      const job = await stopBrowseCapture();
      return { ok: true, job };
    }

    case 'COLLECT_ALL_PAGES': {
      const includeProfiles = Boolean(message.payload?.includeProfiles);
      const job = await runCollectAllPages(includeProfiles);
      const stats = await computeStats();
      const carriers = await getAllCarriers();
      return { ok: true, job, stats, carriers };
    }

    case 'PAUSE': {
      pausePagination();
      const job = await updateJobOptions({
        status: 'paused',
        statusDetail: 'Paused by user.',
      });
      return { ok: true, job };
    }

    case 'RESUME': {
      resumePagination();
      const active = await getActiveJob();
      if (active?.mode === 'collect_all_pages') {
        // Resume flag only — ongoing loop picks it up
        const job = await updateJobOptions({
          status: 'running',
          statusDetail: 'Resumed.',
        });
        return { ok: true, job };
      }
      return { ok: true, job: active };
    }

    case 'STOP': {
      stopPagination();
      await stopBrowseCapture().catch(() => undefined);
      const job = await updateJobOptions({
        status: 'stopped',
        statusDetail: 'Stopped by user.',
        finishedAt: new Date().toISOString(),
      });
      return { ok: true, job };
    }

    case 'RESET_JOB': {
      const job = await resetCollection();
      return { ok: true, job };
    }

    case 'CLEAR_DATA': {
      await clearAllData();
      const job = await resetCollection();
      const stats = await computeStats();
      return { ok: true, job, stats, carriers: [] };
    }

    case 'EXPORT_MC_CSV': {
      const carriers = await filterCarriers(message.payload);
      await downloadTextFile(
        buildMcOnlyCsv(carriers),
        `carriersource-mc-numbers-${dateStamp()}.csv`
      );
      return { ok: true, count: carriers.length };
    }

    case 'EXPORT_COMPLETE_CSV': {
      const carriers = await filterCarriers(message.payload);
      await downloadTextFile(
        buildCompleteCsv(carriers),
        `carriersource-carriers-${dateStamp()}.csv`
      );
      return { ok: true, count: carriers.length };
    }

    case 'EXPORT_XLSX': {
      const carriers = await filterCarriers(message.payload);
      await downloadBlob(
        buildXlsxBlob(carriers),
        `carriersource-carriers-${dateStamp()}.xlsx`
      );
      return { ok: true, count: carriers.length };
    }

    case 'OPEN_SIDEPANEL': {
      const win = await chrome.windows.getCurrent();
      if (win.id != null) {
        await chrome.sidePanel.open({ windowId: win.id });
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown message: ${message.type}` };
  }
}

async function filterCarriers(payload?: Record<string, unknown>): Promise<CarrierRecord[]> {
  let carriers = await getAllCarriers();
  const query = String(payload?.query ?? '')
    .trim()
    .toLowerCase();
  const filteredIds = payload?.ids as string[] | undefined;

  if (filteredIds?.length) {
    const set = new Set(filteredIds);
    carriers = carriers.filter((c) => set.has(c.id));
  }

  if (query) {
    carriers = carriers.filter((c) => {
      const hay = [
        c.companyName,
        c.usdot,
        ...c.mcNumbers,
        c.businessState,
        ...c.truckTypes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(query);
    });
  }
  return carriers;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
