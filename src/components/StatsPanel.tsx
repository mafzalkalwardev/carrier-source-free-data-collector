import type { CollectionStats } from '../types/job';

interface Props {
  stats: CollectionStats;
}

export function StatsPanel({ stats }: Props) {
  const items = [
    { label: 'Pages captured', value: stats.searchPagesCaptured },
    { label: 'Carrier records', value: stats.carrierRecords },
    { label: 'Unique MC', value: stats.uniqueMcNumbers },
    { label: 'Unique USDOT', value: stats.uniqueUsdotNumbers },
    { label: 'Duplicates skipped', value: stats.duplicatesSkipped },
    { label: 'Profiles enriched', value: stats.profilesEnriched },
    { label: 'Missing info markers', value: stats.missingInformationCount },
  ];

  return (
    <section className="cs-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Statistics</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-center"
          >
            <div className="text-lg font-semibold tabular-nums text-slate-900">
              {item.value}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
