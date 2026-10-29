# CarrierSource DOM Field Map

**Inspection date:** 2026-10-22  
**Method:** Public page content review (rendered text / structure). Live CSS class names were not fully verified because automated browser inspection did not load the SPA reliably in this environment.

## Confirmed visible fields (results cards)

Observed on pages such as `/trucking-companies/united-states/arizona` and `/trucking-companies/box-truck/united-states/texas`:

| Field | Visible on results? | Notes |
|-------|---------------------|-------|
| Company name | Yes | Linked to `/carriers/{slug}` |
| CarrierSource profile URL | Yes | Same profile link |
| MC number(s) | Yes | e.g. `MC632214` |
| FF docket | Sometimes | e.g. `FF012031` — stored separately, never as MC |
| USDOT | Yes | e.g. `USDOT 1725083` |
| Interstate / Intrastate | Yes | Badge/text near identifiers |
| Overall rating + review count | Yes | e.g. `(10 reviews) 4.9 out of 5` |
| Fleet size / power units | Yes | Labeled `Fleet Size` or `N power units` |
| Authority status + date | Yes | e.g. `Contract Active(02/21/2008)` |
| Insurance limit | Yes | e.g. `$2,000,000` |
| Safety rating | Yes | Satisfactory / Conditional / None |
| Truck types | Yes | Listed under Truck Types |
| Freight categories | Yes | Listed under Freight |
| Sponsored marker | Yes | `Sponsored` label on paid placements |
| Company website | Rare on cards | Prefer profile page |
| Phone / email / contacts | Present as actions | **Never collected; never clicked** |

## Confirmed visible fields (free profile pages)

Observed on `/carriers/tri-star-freight-system-inc`:

| Field | Visible? | Collected? |
|-------|----------|------------|
| Address, city, state, ZIP | Yes | Yes |
| Docket line (MC + FF) | Yes | Yes (MC/FF separated) |
| USDOT | Yes | Yes |
| Website hyperlink | Sometimes | Yes only if freely displayed |
| About / description | Yes | Yes (non-contact text) |
| Fleet owned/leased table | Yes | Yes |
| Truck / freight / shipment / specialized | Yes | Yes |
| MCS-150 mileage + year | Yes | Yes |
| Authority start dates | Yes | Yes |
| Cargo authorization | Yes | Yes |
| Safety / inspection / violation tables | Yes | Summaries only |
| Insurance type, company, limit, date | Yes | Yes (not policy secrets beyond public display) |
| Numerical rating categories | Yes | Yes |
| Review body text | Yes | **No** |
| Contact / Request Quote | Yes | **Never clicked / never scraped from modals** |

## Pagination (live confirmation still recommended)

- Do **not** invent `?page=` query parameters.
- Adapter looks for visible `Next`, `rel="next"`, or `Load More` controls.
- Infinite-scroll markers pause automated Mode C until confirmed.
- Fixture tests include a `rel="next"` control; live DOM may differ (client-rendered controls, icons-only buttons).

## Selectors strategy

Prefer, in order:

1. Semantic landmarks (`main`, `article`, `a[href*="/carriers/"]`)
2. Labeled text blocks (`Fleet Size`, `Authority`, `Docket`, `USDOT`)
3. Scoped regex inside identifier elements only
4. Avoid hashed CSS class names

## Still requiring live browser confirmation

1. Exact pagination control markup on filtered search pages after Apply Filters.
2. Whether infinite scroll is used for some filter combinations.
3. Whether some fleet/insurance fields are behind soft paywalls (blur / locked) for anonymous users.
4. City search DOM vs state search DOM differences.
5. Whether SPA navigation fully replaces card nodes or patches in place (affects MutationObserver tuning).

Update this document after loading the extension against a live authorized session.
