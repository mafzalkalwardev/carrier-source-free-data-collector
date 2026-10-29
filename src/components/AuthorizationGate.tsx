import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AuthorizationState } from '../types/job';

interface Props {
  auth: AuthorizationState;
  onChange: (auth: AuthorizationState) => void;
}

export function AuthorizationGate({ auth, onChange }: Props) {
  const now = () => new Date().toISOString();

  return (
    <section className="cs-card p-4">
      <div className="mb-3 flex items-start gap-3">
        {auth.tosAcknowledged ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 text-green-600" />
        ) : (
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
        )}
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Authorization & compliance</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            CarrierSource requires express written permission for scraping, including manual
            extraction. This extension only reads freely visible DOM content and never bypasses
            access controls, CAPTCHAs, or paid gates. You are responsible for obtaining permission
            that covers your intended use.
          </p>
        </div>
      </div>

      <label className="mb-2 flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={auth.tosAcknowledged}
          onChange={(e) =>
            onChange({
              ...auth,
              tosAcknowledged: e.target.checked,
              tosAcknowledgedAt: e.target.checked ? now() : null,
            })
          }
        />
        <span>
          I acknowledge CarrierSource&apos;s Terms of Service and confirm I have (or will obtain)
          appropriate permission for collecting freely visible data for my authorized use.
        </span>
      </label>

      <label className="mb-2 flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1"
          disabled={!auth.tosAcknowledged}
          checked={auth.automatedTraversalAuthorized}
          onChange={(e) =>
            onChange({
              ...auth,
              automatedTraversalAuthorized: e.target.checked,
              automatedTraversalAuthorizedAt: e.target.checked ? now() : null,
            })
          }
        />
        <span>
          My written authorization covers <strong>automated traversal</strong> of result pages via
          the site&apos;s visible Next / Load More controls (Collect All Result Pages).
        </span>
      </label>

      <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1"
          disabled={!auth.tosAcknowledged}
          checked={auth.profileEnrichmentAuthorized}
          onChange={(e) =>
            onChange({
              ...auth,
              profileEnrichmentAuthorized: e.target.checked,
              profileEnrichmentAuthorizedAt: e.target.checked ? now() : null,
            })
          }
        />
        <span>
          My written authorization covers visiting <strong>freely accessible</strong> carrier
          profile pages to enrich records (no paid/locked fields, no contact actions).
        </span>
      </label>

      <label className="cs-label">Authorization notes (optional)</label>
      <textarea
        className="cs-input min-h-[64px]"
        placeholder="Reference number, email confirmation date, scope notes…"
        value={auth.authorizationNotes}
        onChange={(e) => onChange({ ...auth, authorizationNotes: e.target.value })}
      />
    </section>
  );
}
