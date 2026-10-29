import { Download, FileSpreadsheet, FileText, Filter } from 'lucide-react';

interface Props {
  filteredCount: number;
  totalCount: number;
  busy: boolean;
  onExportMc: (filtered: boolean) => void;
  onExportCsv: (filtered: boolean) => void;
  onExportXlsx: (filtered: boolean) => void;
  onClearData: () => void;
}

export function ExportPanel({
  filteredCount,
  totalCount,
  busy,
  onExportMc,
  onExportCsv,
  onExportXlsx,
  onClearData,
}: Props) {
  return (
    <section className="cs-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Export</h2>
      <p className="mb-3 text-xs text-slate-500">
        CSV files include a UTF-8 BOM for Microsoft Excel. Formula-like cells are neutralized.
        Phone numbers, emails, and contact names are never exported because they are never collected.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="cs-btn-secondary"
          disabled={busy || totalCount === 0}
          onClick={() => onExportMc(false)}
        >
          <FileText className="h-4 w-4" />
          MC Numbers Only CSV
        </button>
        <button
          type="button"
          className="cs-btn-secondary"
          disabled={busy || totalCount === 0}
          onClick={() => onExportCsv(false)}
        >
          <Download className="h-4 w-4" />
          Complete Carrier CSV
        </button>
        <button
          type="button"
          className="cs-btn-secondary"
          disabled={busy || totalCount === 0}
          onClick={() => onExportXlsx(false)}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Excel XLSX
        </button>
        <button
          type="button"
          className="cs-btn-primary"
          disabled={busy || filteredCount === 0}
          onClick={() => onExportCsv(true)}
        >
          <Filter className="h-4 w-4" />
          Export Filtered CSV ({filteredCount})
        </button>
      </div>
      <button
        type="button"
        className="cs-btn-danger mt-3"
        onClick={onClearData}
        disabled={busy}
      >
        Clear all local data
      </button>
    </section>
  );
}
