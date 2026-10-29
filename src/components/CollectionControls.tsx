import {
  Camera,
  Eye,
  Layers,
  Pause,
  Play,
  Square,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import type { AuthorizationState, CollectionJob } from '../types/job';

interface Props {
  auth: AuthorizationState;
  job: CollectionJob;
  busy: boolean;
  includeProfiles: boolean;
  onCaptureCurrent: () => void;
  onStartBrowse: () => void;
  onCollectAll: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function CollectionControls({
  auth,
  job,
  busy,
  includeProfiles,
  onCaptureCurrent,
  onStartBrowse,
  onCollectAll,
  onPause,
  onResume,
  onStop,
  onReset,
}: Props) {
  const canBasic = auth.tosAcknowledged;
  const canAuto = canBasic && auth.automatedTraversalAuthorized;
  const running = job.status === 'running';
  const paused = job.status === 'paused';

  return (
    <section className="cs-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Collection controls</h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          className="cs-btn-primary"
          disabled={!canBasic || busy}
          onClick={onCaptureCurrent}
          title="Mode A — extract visible cards on the current results page"
        >
          {busy && job.mode === 'capture_current' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          Capture Current Page
        </button>

        <button
          type="button"
          className="cs-btn-secondary"
          disabled={!canBasic || busy}
          onClick={onStartBrowse}
          title="Mode B — detect new results as you navigate"
        >
          <Eye className="h-4 w-4" />
          Capture As I Browse
        </button>

        <button
          type="button"
          className="cs-btn-secondary"
          disabled={!canAuto || busy}
          onClick={onCollectAll}
          title={
            canAuto
              ? 'Mode C — walk visible Next/Load More controls'
              : 'Requires automated traversal authorization'
          }
        >
          <Layers className="h-4 w-4" />
          Collect All Result Pages
        </button>
      </div>

      {!canAuto && (
        <p className="mt-2 text-[11px] text-amber-700">
          Collect All Result Pages stays disabled until automated traversal authorization is
          confirmed above.
        </p>
      )}

      {includeProfiles && !auth.profileEnrichmentAuthorized && (
        <p className="mt-1 text-[11px] text-amber-700">
          Profile enrichment checkbox is on, but profile authorization is not confirmed — enrichment
          will be skipped.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="cs-btn-secondary"
          disabled={!running}
          onClick={onPause}
        >
          <Pause className="h-4 w-4" /> Pause
        </button>
        <button
          type="button"
          className="cs-btn-secondary"
          disabled={!paused}
          onClick={onResume}
        >
          <Play className="h-4 w-4" /> Resume
        </button>
        <button type="button" className="cs-btn-danger" onClick={onStop}>
          <Square className="h-4 w-4" /> Stop
        </button>
        <button type="button" className="cs-btn-secondary" onClick={onReset}>
          <RotateCcw className="h-4 w-4" /> Reset job
        </button>
      </div>

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <div>
          Status:{' '}
          <span className="font-semibold capitalize text-slate-900">
            {job.status.replace(/_/g, ' ')}
          </span>
          {job.mode ? ` · ${job.mode.replace(/_/g, ' ')}` : ''}
        </div>
        {job.statusDetail && <div className="mt-1">{job.statusDetail}</div>}
        {job.errorMessage && (
          <div className="mt-1 text-red-600">{job.errorMessage}</div>
        )}
      </div>
    </section>
  );
}
