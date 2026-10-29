# CarrierSource Free Data Collector

Chrome Manifest V3 extension that collects **freely visible** carrier information from [CarrierSource](https://www.carriersource.io/) using **browser DOM extraction only**.

It does **not** call CarrierSource APIs, intercept network responses, bypass access controls, or collect phone numbers, emails, or personal contact names.

## Screenshots

Live captures from a real Chrome session and the built dashboard UI.

### Popup over CarrierSource search results

![Extension popup over CarrierSource search](docs/screenshots/01-popup-over-search.png)

### Popup close-up

![Popup close-up](docs/screenshots/02-popup-closeup.png)

### Dashboard — authorization & compliance

![Dashboard authorization gate](docs/screenshots/06-dashboard-authorization.png)

### Dashboard — collection controls

![Collection controls](docs/screenshots/07-dashboard-collection-controls.png)

### Live collection stats

![Dashboard statistics after capture](docs/screenshots/03-dashboard-stats.png)

### CarrierSource pagination (Next `>` at page bottom)

![CarrierSource pagination controls](docs/screenshots/04-carriersource-pagination.png)

## Compliance

CarrierSource’s Terms of Service require express written permission for scraping, including manual extraction. The extension:

1. Shows an authorization acknowledgement before collection.
2. Keeps **Collect All Result Pages** disabled until you confirm written authorization for automated traversal.
3. Keeps profile enrichment gated behind a separate authorization flag.
4. Never clicks Contact, Request Quote, Download List, or payment controls.
5. Stops when pagination is unavailable, repeated, disabled, or blocked.

**You are responsible for obtaining permission that covers your intended use.**

## Features

| Mode | Behavior |
|------|----------|
| **Capture Current Page** | Extracts genuine carrier cards from the active results page |
| **Capture As I Browse** | Watches DOM/URL changes while you navigate; dedupes result sets |
| **Collect All Result Pages** | Permission-gated; uses visible Next / Load More only |

Also included:

- Searchable multi-select equipment + state planning UI
- Verified search URL queue (no invented CarrierSource routes)
- IndexedDB persistence with resume-safe job checkpoints
- MC / USDOT normalization (preserves leading zeros; FF ≠ MC)
- Deduplication by USDOT + MC set
- CSV (Excel-friendly) and XLSX export with formula-injection protection
- Optional free-profile enrichment when authorized

## Requirements

- Google Chrome (or Chromium) with Manifest V3 support
- Node.js 20+ (for build/test)
- A CarrierSource tab open in the browser
- Appropriate written authorization for your collection mode

## Install dependencies

```bash
cd carrier-source-dom-collector
npm install
npm run icons
```

## Build

```bash
npm run build
```

Output folder: `dist/`

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `carrier-source-dom-collector/dist` folder
5. Pin the extension; open the **side panel dashboard** from the popup

## Use

1. Open https://www.carriersource.io/ and apply your filters on the site.
2. Open the extension dashboard.
3. Complete the **Authorization & compliance** checkboxes that match your written permission.
4. Click **Capture Current Page** (Mode A), or start **Capture As I Browse** (Mode B).
5. Only if authorized, use **Collect All Result Pages** (Mode C).
6. Export MC-only CSV, complete CSV, or Excel from the Export section.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Typecheck + build extension into `dist/` |
| `npm test` | Run Vitest suite (fixtures + unit tests) |
| `npm run typecheck` | TypeScript only |
| `npm run icons` | Generate PNG icons |

## Project structure

```
carrier-source-dom-collector/
  manifest.json
  src/
    background/serviceWorker.ts
    content/          # CarrierSource DOM adapter + extractors
    sidepanel/        # React dashboard
    popup/            # Quick capture popup
    storage/          # IndexedDB
    services/         # Collector, jobs, export, dedupe
    types/ utils/ components/
  tests/fixtures/     # Saved HTML layouts
  docs/DOM-FIELD-MAP.md
```

## What can actually be extracted

See [docs/DOM-FIELD-MAP.md](docs/DOM-FIELD-MAP.md) for confirmed visible fields and items that still need live DOM confirmation.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| “No CarrierSource tab open” | Focus a tab on `https://www.carriersource.io/...` |
| Zero cards captured | Confirm results are rendered (not an empty filter set). Site markup may have changed — inspect with DevTools and update the adapter. |
| Collect All disabled | Confirm ToS acknowledgement **and** automated traversal authorization. |
| Pagination stops early | No accessible Next/Load More, repeated fingerprint, or infinite-scroll pause. Use Capture As I Browse. |
| Profile fields missing | Field may be locked/paid, or profile authorization not confirmed. Basic card data is retained. |
| Export won’t open in Excel | Use the provided CSV (UTF-8 BOM). Avoid editing raw blobs mid-download. |
| Job says paused after restart | Expected — closed browsers do not leave a running session. Resume or re-run. |

## Limitations (cannot verify without live inspection / authorization)

1. Exact live pagination widget markup after client-side filter application.
2. Whether some filter views use infinite scroll instead of Next.
3. Soft paywall / blurred field behavior for anonymous vs signed-in users.
4. Full stability of SPA card remount patterns under MutationObserver.
5. End-to-end traversal of “all” results cannot be claimed from fixtures alone.

## Privacy

All records stay in the browser’s IndexedDB. There is no external server, analytics endpoint, or third-party collection API in this project.

## License

Private / local research tool. Ensure your use complies with CarrierSource Terms of Service and applicable law.
