import { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import { AuthorizationGate } from '../components/AuthorizationGate';
import { SearchSetup } from '../components/SearchSetup';
import { CollectionControls } from '../components/CollectionControls';
import { StatsPanel } from '../components/StatsPanel';
import { ResultsTable } from '../components/ResultsTable';
import { ExportPanel } from '../components/ExportPanel';
import type { CarrierRecord } from '../types/carrier';
import type {
  AuthorizationState,
  CollectionJob,
  CollectionStats,
  SearchQueueItem,
  TabInfo,
} from '../types/job';
import { DEFAULT_AUTHORIZATION, createIdleJob } from '../types/job';
import {
  buildCompleteCsv,
  buildMcOnlyCsv,
  buildXlsxBlob,
} from '../services/exportService';
import { downloadBlobFile, downloadTextFile } from '../utils/download';

interface AppState {
  authorization: AuthorizationState;
  searchQueue: SearchQueueItem[];
  job: CollectionJob;
  stats: CollectionStats;
  carriers: CarrierRecord[];
  tab: TabInfo;
}

const emptyStats: CollectionStats = {
  searchPagesCaptured: 0,
  carrierRecords: 0,
  uniqueMcNumbers: 0,
  uniqueUsdotNumbers: 0,
  duplicatesSkipped: 0,
  profilesEnriched: 0,
  missingInformationCount: 0,
};

async function bg<T = unknown>(
  type: string,
  payload?: Record<string, unknown>
): Promise<T & { ok: boolean; error?: string }> {
  return chrome.runtime.sendMessage({ type, payload });
}

export function Dashboard() {
  const [auth, setAuth] = useState<AuthorizationState>({ ...DEFAULT_AUTHORIZATION });
  const [queue, setQueue] = useState<SearchQueueItem[]>([]);
  const [job, setJob] = useState<CollectionJob>(createIdleJob());
  const [stats, setStats] = useState<CollectionStats>(emptyStats);
  const [carriers, setCarriers] = useState<CarrierRecord[]>([]);
  const [tab, setTab] = useState<TabInfo>({
    tabId: null,
    url: null,
    title: null,
    isCarrierSource: false,
    isResultsPage: false,
    isProfilePage: false,
  });
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [searchStates, setSearchStates] = useState<string[]>([]);
  const [carriersOnly, setCarriersOnly] = useState(true);
  const [activeAuthorityOnly, setActiveAuthorityOnly] = useState(false);
  const [includeProfiles, setIncludeProfiles] = useState(false);
  const [detectedFilters, setDetectedFilters] = useState<string[]>([]);
  const [filteredIds, setFilteredIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await bg<AppState>('GET_STATE');
    if (!res.ok) {
      setError(res.error ?? 'Failed to load state');
      return;
    }
    setAuth(res.authorization);
    setQueue(res.searchQueue);
    setJob(res.job);
    setStats(res.stats);
    setCarriers(res.carriers);
    setTab(res.tab);
    if (res.job.searchContext) {
      setDetectedFilters(res.job.searchContext.detectedFilters ?? []);
      if (res.job.searchContext.equipmentTypes?.length) {
        setEquipmentTypes(res.job.searchContext.equipmentTypes);
      }
    }
    setError(null);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 2500);
    return () => clearInterval(id);
  }, [refresh]);

  async function saveAuth(next: AuthorizationState) {
    setAuth(next);
    await bg('SAVE_AUTHORIZATION', next as unknown as Record<string, unknown>);
  }

  async function saveQueue(next: SearchQueueItem[]) {
    setQueue(next);
    await bg('SAVE_QUEUE', { queue: next });
  }

  async function syncOptions() {
    await bg('UPDATE_JOB_OPTIONS', {
      includeProfiles,
      searchContext: {
        url: tab.url ?? '',
        equipmentTypes,
        searchState: searchStates[0] ?? null,
        searchCity: null,
        carriersOnly,
        activeAuthorityOnly,
        detectedFilters,
        pageTitle: tab.title,
      },
    });
  }

  async function run(type: string) {
    setBusy(true);
    setError(null);
    try {
      await syncOptions();
      const res = await bg(type, { includeProfiles });
      if (!res.ok) throw new Error(res.error ?? 'Operation failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function carriersForExport(filtered: boolean): CarrierRecord[] {
    if (!filtered) return carriers;
    const idSet = new Set(filteredIds);
    return carriers.filter((c) => idSet.has(c.id));
  }

  async function exportData(
    type: 'EXPORT_MC_CSV' | 'EXPORT_COMPLETE_CSV' | 'EXPORT_XLSX',
    filtered: boolean
  ) {
    const rows = carriersForExport(filtered);
    if (rows.length === 0) {
      setError('No carrier records to export yet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      if (type === 'EXPORT_MC_CSV') {
        await downloadTextFile(
          buildMcOnlyCsv(rows),
          `carriersource-mc-numbers-${stamp}.csv`
        );
      } else if (type === 'EXPORT_COMPLETE_CSV') {
        await downloadTextFile(
          buildCompleteCsv(rows),
          `carriersource-carriers-${stamp}.csv`
        );
      } else {
        await downloadBlobFile(
          buildXlsxBlob(rows),
          `carriersource-carriers-${stamp}.xlsx`
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-brand-700">
            <Database className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">
              CarrierSource
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900">
            Free Data Collector
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Local DOM extraction of freely visible carrier cards. No API access, no contact data,
            no bypass of site restrictions.
          </p>
        </div>
        <button type="button" className="cs-btn-secondary" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <AuthorizationGate auth={auth} onChange={(a) => void saveAuth(a)} />

      <SearchSetup
        tab={tab}
        detectedFilters={detectedFilters}
        equipmentTypes={equipmentTypes}
        searchStates={searchStates}
        carriersOnly={carriersOnly}
        activeAuthorityOnly={activeAuthorityOnly}
        includeProfiles={includeProfiles}
        queue={queue}
        onEquipmentChange={setEquipmentTypes}
        onStatesChange={setSearchStates}
        onCarriersOnly={setCarriersOnly}
        onActiveAuthorityOnly={setActiveAuthorityOnly}
        onIncludeProfiles={setIncludeProfiles}
        onQueueChange={(q) => void saveQueue(q)}
      />

      <CollectionControls
        auth={auth}
        job={job}
        busy={busy}
        includeProfiles={includeProfiles}
        onCaptureCurrent={() => void run('CAPTURE_CURRENT')}
        onStartBrowse={() => void run('START_BROWSE')}
        onCollectAll={() => void run('COLLECT_ALL_PAGES')}
        onPause={() => void run('PAUSE')}
        onResume={() => void run('RESUME')}
        onStop={() => void run('STOP')}
        onReset={() => void run('RESET_JOB')}
      />

      <StatsPanel stats={stats} />

      {carriers.length > 0 && (
        <div className="cs-card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-brand-200 bg-brand-50/95 p-3 backdrop-blur">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{carriers.length}</span> records ready to
            download
            {job.status !== 'running' && job.statusDetail ? (
              <span className="mt-0.5 block text-xs text-slate-500">{job.statusDetail}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="cs-btn-primary"
              disabled={busy}
              onClick={() => void exportData('EXPORT_COMPLETE_CSV', false)}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="cs-btn-secondary"
              disabled={busy}
              onClick={() => void exportData('EXPORT_MC_CSV', false)}
            >
              MC only
            </button>
            <button
              type="button"
              className="cs-btn-secondary"
              disabled={busy}
              onClick={() => void exportData('EXPORT_XLSX', false)}
            >
              Excel
            </button>
          </div>
        </div>
      )}

      <ResultsTable carriers={carriers} onFilteredIdsChange={setFilteredIds} />

      <ExportPanel
        filteredCount={filteredIds.length}
        totalCount={carriers.length}
        busy={busy}
        onExportMc={(f) => void exportData('EXPORT_MC_CSV', f)}
        onExportCsv={(f) => void exportData('EXPORT_COMPLETE_CSV', f)}
        onExportXlsx={(f) => void exportData('EXPORT_XLSX', f)}
        onClearData={() => {
          if (confirm('Delete all locally stored carrier records and jobs?')) {
            void run('CLEAR_DATA');
          }
        }}
      />

      <footer className="pb-4 text-center text-[11px] text-slate-500">
        Data stays in this browser (IndexedDB). Progress resumes after worker suspension; a closed
        browser pauses running jobs instead of pretending they are still active.
      </footer>
    </div>
  );
}
