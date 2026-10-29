import { useEffect, useState } from 'react';
import { Database, LayoutDashboard, Camera } from 'lucide-react';
import '../styles.css';

export function App() {
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((res) => {
      if (res?.ok) {
        setAuthorized(Boolean(res.authorization?.tosAcknowledged));
        setCount(res.stats?.carrierRecords ?? 0);
        setReady(true);
      }
    });
  }, []);

  async function openSidePanel() {
    // sidePanel.open() must run in the same user-gesture turn as the click.
    // Routing through the service worker drops that gesture and fails silently.
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId != null) {
        await chrome.sidePanel.setOptions({
          path: 'sidepanel.html',
          enabled: true,
        });
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close();
        return;
      }
    } catch (err) {
      console.warn('Side panel open failed, falling back to tab', err);
    }

    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') });
      window.close();
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'Could not open dashboard. Try chrome://extensions → extension details → side panel.'
      );
    }
  }

  async function capture() {
    if (!authorized) {
      setMessage('Open the dashboard and complete authorization first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await chrome.runtime.sendMessage({
      type: 'CAPTURE_CURRENT',
      payload: { includeProfiles: false },
    });
    setBusy(false);
    if (!res?.ok) {
      setMessage(res?.error ?? 'Capture failed');
      return;
    }
    setCount(res.stats?.carrierRecords ?? count);
    setMessage(res.job?.statusDetail ?? 'Captured.');
  }

  return (
    <div className="w-[320px] bg-gradient-to-b from-slate-50 to-slate-100 p-4 text-slate-900">
      <div className="mb-3 flex items-center gap-2 text-brand-700">
        <Database className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
          CarrierSource
        </span>
      </div>
      <h1 className="text-lg font-bold leading-tight">Free Data Collector</h1>
      <p className="mt-1 text-xs text-slate-600">
        DOM-only local research tool. {ready ? `${count} records stored.` : 'Loading…'}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          className="cs-btn-primary w-full"
          disabled={busy || !authorized}
          onClick={() => void capture()}
        >
          <Camera className="h-4 w-4" />
          Capture Current Page
        </button>
        <button type="button" className="cs-btn-secondary w-full" onClick={() => void openSidePanel()}>
          <LayoutDashboard className="h-4 w-4" />
          Open Dashboard
        </button>
      </div>

      {message && (
        <p className="mt-3 text-xs text-slate-600">{message}</p>
      )}
      {!authorized && ready && (
        <p className="mt-3 text-xs text-amber-700">
          Authorization required — open the dashboard to acknowledge permissions.
        </p>
      )}
    </div>
  );
}
