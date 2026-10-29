import * as XLSX from 'xlsx';
import type { CarrierRecord } from '../types/carrier';

/** Prevent CSV formula injection when opened in Excel. */
function sanitizeCell(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) {
    s = `'${s}`;
  }
  return s;
}

function csvEscape(value: unknown): string {
  const s = sanitizeCell(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinList(values: string[] | undefined): string {
  return (values ?? []).join('; ');
}

export function buildMcOnlyCsv(carriers: CarrierRecord[]): string {
  const mcSet = new Map<string, { mc: string; usdot: string; company: string }>();
  for (const c of carriers) {
    for (const mc of c.mcNumbers) {
      if (!mcSet.has(mc)) {
        mcSet.set(mc, {
          mc,
          usdot: c.usdot ?? '',
          company: c.companyName,
        });
      }
    }
  }
  const rows = ['MC Number,USDOT,Company Name'];
  for (const row of mcSet.values()) {
    rows.push(
      [csvEscape(row.mc), csvEscape(row.usdot), csvEscape(row.company)].join(',')
    );
  }
  // BOM for Excel UTF-8
  return `\uFEFF${rows.join('\r\n')}`;
}

export function buildCompleteCsv(carriers: CarrierRecord[]): string {
  const headers = [
    'Company Name',
    'MC Numbers',
    'FF Numbers',
    'USDOT',
    'Profile URL',
    'Website URL',
    'City',
    'Business State',
    'ZIP',
    'Business Address',
    'Classification',
    'Operation',
    'Truck Types',
    'Freight Categories',
    'Shipment Types',
    'Specialized Services',
    'Power Units',
    'Owned Tractors',
    'Leased Tractors',
    'Owned Trucks',
    'Leased Trucks',
    'Owned Trailers',
    'Leased Trailers',
    'MCS-150 Mileage',
    'MCS-150 Year',
    'Authority Status',
    'Authority Start Date',
    'Freight Forwarder Status',
    'Cargo Authorization',
    'Safety Rating',
    'Insurance Summary',
    'Overall Rating',
    'Review Count',
    'Quality of Equipment',
    'Communication Rating',
    'Timeliness Rating',
    'Sponsored',
    'Matched Equipment Types',
    'Matched Search States',
    'Source URLs',
    'Profile Status',
    'Completeness',
    'First Captured At',
    'Last Captured At',
  ];

  const rows = [headers.map(csvEscape).join(',')];
  for (const c of carriers) {
    const insurance = c.insurance
      .map(
        (i) =>
          [i.insuranceType, i.companyName, i.policyLimit, i.effectiveDate]
            .filter(Boolean)
            .join(' ')
      )
      .join(' | ');

    rows.push(
      [
        c.companyName,
        joinList(c.mcNumbers),
        joinList(c.ffNumbers),
        c.usdot ?? '',
        c.profileUrl ?? '',
        c.websiteUrl ?? '',
        c.city ?? '',
        c.businessState ?? '',
        c.zipCode ?? '',
        c.businessAddress ?? '',
        c.classification ?? '',
        c.operationType ?? '',
        joinList(c.truckTypes),
        joinList(c.freightCategories),
        joinList(c.shipmentTypes),
        joinList(c.specializedServices),
        c.powerUnits ?? '',
        c.fleet.ownedTractors ?? '',
        c.fleet.leasedTractors ?? '',
        c.fleet.ownedTrucks ?? '',
        c.fleet.leasedTrucks ?? '',
        c.fleet.ownedTrailers ?? '',
        c.fleet.leasedTrailers ?? '',
        c.mcs150Mileage ?? '',
        c.mcs150Year ?? '',
        c.authorityStatus ?? '',
        c.authorityStartDate ?? '',
        c.freightForwarderStatus ?? '',
        joinList(c.cargoAuthorization),
        c.safetyRating ?? '',
        insurance,
        c.overallRating ?? '',
        c.reviewCount ?? '',
        c.ratingCategories.qualityOfEquipment ?? '',
        c.ratingCategories.communication ?? '',
        c.ratingCategories.timeliness ?? '',
        c.isSponsored ? 'Yes' : 'No',
        joinList(c.matchedEquipmentTypes),
        joinList(c.matchedSearchStates),
        joinList(c.sourceUrls),
        c.profileStatus,
        c.completeness,
        c.firstCapturedAt,
        c.lastCapturedAt,
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return `\uFEFF${rows.join('\r\n')}`;
}

export function buildXlsxBlob(carriers: CarrierRecord[]): Blob {
  const rows = carriers.map((c) => ({
    'Company Name': sanitizeCell(c.companyName),
    'MC Numbers': sanitizeCell(joinList(c.mcNumbers)),
    'FF Numbers': sanitizeCell(joinList(c.ffNumbers)),
    USDOT: sanitizeCell(c.usdot ?? ''),
    'Profile URL': sanitizeCell(c.profileUrl ?? ''),
    'Website URL': sanitizeCell(c.websiteUrl ?? ''),
    City: sanitizeCell(c.city ?? ''),
    'Business State': sanitizeCell(c.businessState ?? ''),
    ZIP: sanitizeCell(c.zipCode ?? ''),
    'Business Address': sanitizeCell(c.businessAddress ?? ''),
    Classification: sanitizeCell(c.classification ?? ''),
    Operation: sanitizeCell(c.operationType ?? ''),
    'Truck Types': sanitizeCell(joinList(c.truckTypes)),
    Freight: sanitizeCell(joinList(c.freightCategories)),
    'Power Units': c.powerUnits ?? '',
    Authority: sanitizeCell(c.authorityStatus ?? ''),
    'Safety Rating': sanitizeCell(c.safetyRating ?? ''),
    Rating: c.overallRating ?? '',
    Reviews: c.reviewCount ?? '',
    'Matched Equipment': sanitizeCell(joinList(c.matchedEquipmentTypes)),
    'Matched Search States': sanitizeCell(joinList(c.matchedSearchStates)),
    Sources: sanitizeCell(joinList(c.sourceUrls)),
    'Profile Status': sanitizeCell(c.profileStatus),
    Completeness: sanitizeCell(c.completeness),
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Carriers');

  // MC-only sheet
  const mcRows: Array<{ MC: string; USDOT: string; Company: string }> = [];
  const seen = new Set<string>();
  for (const c of carriers) {
    for (const mc of c.mcNumbers) {
      if (seen.has(mc)) continue;
      seen.add(mc);
      mcRows.push({
        MC: sanitizeCell(mc),
        USDOT: sanitizeCell(c.usdot ?? ''),
        Company: sanitizeCell(c.companyName),
      });
    }
  }
  const mcSheet = XLSX.utils.json_to_sheet(mcRows);
  XLSX.utils.book_append_sheet(book, mcSheet, 'MC Numbers');

  const array = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  return new Blob([array], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function downloadTextFile(
  content: string,
  filename: string,
  mime = 'text/csv;charset=utf-8'
): Promise<void> {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  });
  // Revoke later; Chrome needs the URL briefly
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
