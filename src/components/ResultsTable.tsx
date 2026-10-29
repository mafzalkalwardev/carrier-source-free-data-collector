import { useEffect, useMemo, useState } from 'react';
import { Search, ArrowUpDown, ExternalLink } from 'lucide-react';
import type { CarrierRecord } from '../types/carrier';

type SortKey =
  | 'companyName'
  | 'mc'
  | 'usdot'
  | 'businessState'
  | 'truck'
  | 'powerUnits'
  | 'authorityStatus';

interface Props {
  carriers: CarrierRecord[];
  onFilteredIdsChange?: (ids: string[]) => void;
}

export function ResultsTable({ carriers, onFilteredIdsChange }: Props) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('companyName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [stateFilter, setStateFilter] = useState('');
  const [truckFilter, setTruckFilter] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let rows = carriers.filter((c) => {
      if (stateFilter && (c.businessState ?? '') !== stateFilter) return false;
      if (
        truckFilter &&
        !c.truckTypes.some((t) => t.toLowerCase().includes(truckFilter.toLowerCase())) &&
        !c.matchedEquipmentTypes.some((t) =>
          t.toLowerCase().includes(truckFilter.toLowerCase())
        )
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [
        c.companyName,
        c.usdot,
        ...c.mcNumbers,
        c.businessState,
        ...c.truckTypes,
        c.websiteUrl,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return rows;
  }, [carriers, query, sortKey, sortDir, stateFilter, truckFilter]);

  useEffect(() => {
    onFilteredIdsChange?.(filtered.map((c) => c.id));
  }, [filtered, onFilteredIdsChange]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const states = useMemo(
    () =>
      [...new Set(carriers.map((c) => c.businessState).filter(Boolean) as string[])].sort(),
    [carriers]
  );

  return (
    <section className="cs-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Results ({filtered.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              className="cs-input !w-48 pl-7"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="cs-input !w-auto"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="">All business states</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            className="cs-input !w-36"
            placeholder="Truck type…"
            value={truckFilter}
            onChange={(e) => setTruckFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-100">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              {(
                [
                  ['companyName', 'Company'],
                  ['mc', 'MC'],
                  ['usdot', 'USDOT'],
                  ['businessState', 'State'],
                  ['truck', 'Truck Type'],
                  ['powerUnits', 'Power Units'],
                  ['authorityStatus', 'Authority'],
                ] as Array<[SortKey, string]>
              ).map(([key, label]) => (
                <th key={key} className="px-2 py-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1"
                    onClick={() => toggleSort(key)}
                  >
                    {label}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              ))}
              <th className="px-2 py-2">Website</th>
              <th className="px-2 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  No carrier records yet. Open a CarrierSource results page and capture.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="max-w-[180px] truncate px-2 py-2 font-medium text-slate-800">
                    {c.profileUrl ? (
                      <a
                        href={c.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-700 hover:underline"
                      >
                        {c.companyName}
                      </a>
                    ) : (
                      c.companyName
                    )}
                    {c.isSponsored && (
                      <span className="ml-1 text-[10px] text-amber-600">Sponsored</span>
                    )}
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px]">
                    {c.mcNumbers.join(', ') || '—'}
                  </td>
                  <td className="px-2 py-2 font-mono text-[11px]">{c.usdot || '—'}</td>
                  <td className="px-2 py-2">{c.businessState || '—'}</td>
                  <td className="max-w-[140px] truncate px-2 py-2">
                    {(c.truckTypes.length
                      ? c.truckTypes
                      : c.matchedEquipmentTypes
                    ).join(', ') || '—'}
                  </td>
                  <td className="px-2 py-2 tabular-nums">
                    {c.powerUnits != null ? c.powerUnits.toLocaleString() : '—'}
                  </td>
                  <td className="max-w-[120px] truncate px-2 py-2">
                    {c.authorityStatus || '—'}
                  </td>
                  <td className="px-2 py-2">
                    {c.websiteUrl ? (
                      <a
                        href={c.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                      >
                        Link <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="max-w-[120px] truncate px-2 py-2 text-slate-500">
                    {c.sourceUrls[0] ? (
                      <a
                        href={c.sourceUrls[0]}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        Source
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function sortValue(c: CarrierRecord, key: SortKey): string | number {
  switch (key) {
    case 'companyName':
      return c.companyName.toLowerCase();
    case 'mc':
      return c.mcNumbers[0] ?? '';
    case 'usdot':
      return c.usdot ?? '';
    case 'businessState':
      return c.businessState ?? '';
    case 'truck':
      return (c.truckTypes[0] ?? c.matchedEquipmentTypes[0] ?? '').toLowerCase();
    case 'powerUnits':
      return c.powerUnits ?? -1;
    case 'authorityStatus':
      return (c.authorityStatus ?? '').toLowerCase();
  }
}
