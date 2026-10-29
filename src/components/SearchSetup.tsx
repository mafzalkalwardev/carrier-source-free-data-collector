import { useMemo, useState } from 'react';
import { MapPin, Truck, Filter } from 'lucide-react';
import { TRUCK_TYPES, US_STATES } from '../types/carrier';
import type { SearchQueueItem, TabInfo } from '../types/job';

interface Props {
  tab: TabInfo;
  detectedFilters: string[];
  equipmentTypes: string[];
  searchStates: string[];
  carriersOnly: boolean;
  activeAuthorityOnly: boolean;
  includeProfiles: boolean;
  queue: SearchQueueItem[];
  onEquipmentChange: (types: string[]) => void;
  onStatesChange: (states: string[]) => void;
  onCarriersOnly: (v: boolean) => void;
  onActiveAuthorityOnly: (v: boolean) => void;
  onIncludeProfiles: (v: boolean) => void;
  onQueueChange: (queue: SearchQueueItem[]) => void;
}

export function SearchSetup(props: Props) {
  const [equipQuery, setEquipQuery] = useState('');
  const [stateQuery, setStateQuery] = useState('');

  const filteredEquip = useMemo(() => {
    const q = equipQuery.toLowerCase();
    return TRUCK_TYPES.filter((t) => t.toLowerCase().includes(q));
  }, [equipQuery]);

  const filteredStates = useMemo(() => {
    const q = stateQuery.toLowerCase();
    return US_STATES.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.abbreviation.toLowerCase().includes(q)
    );
  }, [stateQuery]);

  function toggleEquip(type: string) {
    const set = new Set(props.equipmentTypes);
    if (set.has(type)) set.delete(type);
    else set.add(type);
    props.onEquipmentChange([...set]);
  }

  function toggleState(name: string) {
    const set = new Set(props.searchStates);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    props.onStatesChange([...set]);
  }

  function addCurrentTabToQueue() {
    if (!props.tab.url) return;
    const item: SearchQueueItem = {
      id: `q_${Date.now()}`,
      url: props.tab.url,
      label: props.tab.title || props.tab.url,
      equipmentType: props.equipmentTypes[0] ?? null,
      searchState: props.searchStates[0] ?? null,
      status: 'pending',
    };
    props.onQueueChange([...props.queue, item]);
  }

  return (
    <section className="cs-card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-brand-600" />
        <h2 className="text-sm font-semibold">Search setup</h2>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
        <div className="font-medium text-slate-800">Current CarrierSource tab</div>
        <div className="mt-1 break-all text-slate-600">
          {props.tab.isCarrierSource ? props.tab.url : 'No CarrierSource tab detected'}
        </div>
        {props.detectedFilters.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {props.detectedFilters.slice(0, 12).map((f) => (
              <span
                key={f}
                className="rounded-md bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200"
              >
                {f}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          Primary workflow: set filters on CarrierSource, then capture. Equipment/state selectors
          below organize your plan and tag saved records — they do not invent website URLs.
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Truck className="h-3.5 w-3.5" /> Equipment (multi-select)
        </div>
        <input
          className="cs-input mb-2"
          placeholder="Search truck types…"
          value={equipQuery}
          onChange={(e) => setEquipQuery(e.target.value)}
        />
        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 p-2">
          <div className="flex flex-wrap gap-1.5">
            {filteredEquip.map((t) => {
              const on = props.equipmentTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleEquip(t)}
                  className={`rounded-md px-2 py-1 text-xs ${
                    on
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <MapPin className="h-3.5 w-3.5" /> Search states (plan)
        </div>
        <input
          className="cs-input mb-2"
          placeholder="Search states…"
          value={stateQuery}
          onChange={(e) => setStateQuery(e.target.value)}
        />
        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 p-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => toggleState('Nationwide')}
              className={`rounded-md px-2 py-1 text-xs ${
                props.searchStates.includes('Nationwide')
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              Nationwide
            </button>
            {filteredStates.map((s) => {
              const on = props.searchStates.includes(s.name);
              return (
                <button
                  key={s.abbreviation}
                  type="button"
                  onClick={() => toggleState(s.name)}
                  className={`rounded-md px-2 py-1 text-xs ${
                    on
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={s.name}
                >
                  {s.abbreviation}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          Search-filter state is stored separately from each carrier&apos;s business state.
        </p>
      </div>

      <div className="space-y-2 text-sm text-slate-700">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.carriersOnly}
            onChange={(e) => props.onCarriersOnly(e.target.checked)}
          />
          Carriers only (skip brokerage cards when identifiable)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.activeAuthorityOnly}
            onChange={(e) => props.onActiveAuthorityOnly(e.target.checked)}
          />
          Active authority only (when status is visible on the card)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.includeProfiles}
            onChange={(e) => props.onIncludeProfiles(e.target.checked)}
          />
          Include free carrier profile details
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Verified search URL queue
          </span>
          <button
            type="button"
            className="cs-btn-secondary !py-1 !text-xs"
            onClick={addCurrentTabToQueue}
            disabled={!props.tab.isCarrierSource}
          >
            Add current tab URL
          </button>
        </div>
        {props.queue.length === 0 ? (
          <p className="text-xs text-slate-500">
            Queue verified CarrierSource search URLs you already opened. The extension will not
            invent URL formats.
          </p>
        ) : (
          <ul className="max-h-24 space-y-1 overflow-y-auto text-xs">
            {props.queue.map((q) => (
              <li
                key={q.id}
                className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1"
              >
                <span className="truncate">{q.label}</span>
                <button
                  type="button"
                  className="text-red-600"
                  onClick={() =>
                    props.onQueueChange(props.queue.filter((x) => x.id !== q.id))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
