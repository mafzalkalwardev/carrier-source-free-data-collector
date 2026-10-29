import type { CarrierRecord, FleetBreakdown, InsuranceInfo, RatingCategories, ViolationSummary, InspectionSummary } from '../types/carrier';
import { extractUsdot, parseDocketLine } from '../utils/identifierParser';
import { isExternalWebsite } from '../utils/urlValidation';
import { isInRenderedDocument } from '../utils/visibility';

/**
 * Extract freely visible profile details from a CarrierSource carrier page.
 * Explicitly skips Contact / Request Quote / review body text / emails / phones.
 */
export function extractProfileDetails(doc: Document = document): Partial<CarrierRecord> | null {
  if (!isInRenderedDocument(doc.body)) return null;

  // Remove contact/review regions from a working clone conceptually by skipping them
  const main = findMainContent(doc);
  if (!main) return null;

  const companyName = findProfileName(main, doc);
  if (!companyName) return null;

  const docketText = findLabeledBlock(main, /^docket$/i) ?? '';
  const { mcNumbers, ffNumbers } = parseDocketLine(docketText);
  const usdotText = findLabeledBlock(main, /^usdot$/i) ?? '';
  const usdot = extractUsdot(`USDOT ${usdotText}`) ?? extractUsdot(main.textContent ?? '');

  const websiteUrl = findProfileWebsite(main);
  const addressInfo = parseProfileAddress(main);
  const operationType = findBadge(main, /^(interstate|intrastate)$/i);
  const description = findAboutText(main);

  const truckTypes = parseSectionList(main, /^truck types$/i);
  const freightCategories = parseSectionList(main, /^freight$/i);
  const shipmentTypes = parseSectionList(main, /^shipment types$/i);
  const specializedServices = parseSectionList(main, /^specialized services$/i);

  const fleet = parseFleetTable(main);
  const powerUnits = estimatePowerUnits(fleet, main);
  const { mileage, year } = parseMcs150(main);

  const authorityStatus = findAuthorityStatus(main);
  const authorityStartDate = findAuthorityDate(main);
  const freightForwarderStatus = findFfAuthority(main);
  const cargoAuthorization = parseCargoAuth(main);
  const safetyRating = findSafetyRating(main);
  const insurance = parseInsurance(main);
  const inspectionSummary = parseInspections(main);
  const violationSummaries = parseViolations(main);
  const ratingCategories = parseRatingCategories(main);
  const { overallRating, reviewCount } = parseOverallRating(main);

  // Never collect review text — intentionally omit review bodies

  return {
    companyName,
    usdot,
    mcNumbers,
    ffNumbers,
    profileUrl: doc.location?.href ?? null,
    websiteUrl,
    city: addressInfo.city,
    businessState: addressInfo.state,
    zipCode: addressInfo.zip,
    businessAddress: addressInfo.address,
    classification: 'Carrier',
    operationType,
    description,
    truckTypes,
    freightCategories,
    shipmentTypes,
    specializedServices,
    powerUnits,
    fleet,
    mcs150Mileage: mileage,
    mcs150Year: year,
    authorityStatus,
    authorityStartDate,
    freightForwarderStatus,
    cargoAuthorization,
    safetyRating,
    insurance,
    inspectionSummary,
    violationSummaries,
    overallRating,
    reviewCount,
    ratingCategories,
    profileStatus: 'completed',
  };
}

function findMainContent(doc: Document): Element {
  return (
    doc.querySelector('main') ??
    doc.querySelector('[role="main"]') ??
    doc.querySelector('article') ??
    doc.body
  );
}

function findProfileName(main: Element, doc: Document): string | null {
  const h1 = main.querySelector('h1');
  if (h1?.textContent?.trim()) return clean(h1.textContent);

  const title = doc.title?.split('|')[0]?.trim();
  return title || null;
}

function findLabeledBlock(root: Element, labelRe: RegExp): string | null {
  const nodes = Array.from(root.querySelectorAll('div, dt, th, span, p, li, td'));
  for (const el of nodes) {
    const t = clean(el.textContent ?? '');
    if (!t || t.length > 40) continue;
    if (!labelRe.test(t)) continue;

    // Prefer following sibling
    let sibling = el.nextElementSibling;
    while (sibling) {
      const v = clean(sibling.textContent ?? '');
      if (v && !labelRe.test(v) && v.length < 300) return v;
      sibling = sibling.nextElementSibling;
    }

    const parent = el.parentElement;
    if (parent) {
      const all = clean(parent.textContent ?? '');
      if (all.toLowerCase().startsWith(t.toLowerCase())) {
        const rest = all.slice(t.length).trim();
        if (rest) return rest;
      }
    }
  }
  return null;
}

function findProfileWebsite(main: Element): string | null {
  // Look for a Website label then an external link
  const label = Array.from(main.querySelectorAll('*')).find((el) =>
    /^website$/i.test(clean(el.textContent ?? ''))
  );
  if (label) {
    const scope = label.parentElement ?? label;
    const link = scope.querySelector('a[href]') as HTMLAnchorElement | null;
    if (link?.href && isExternalWebsite(link.href)) return link.href;
    // Nearby links
    const nearby = label.closest('div, section, dl')?.querySelectorAll('a[href]');
    if (nearby) {
      for (const a of Array.from(nearby) as HTMLAnchorElement[]) {
        if (isExternalWebsite(a.href)) return a.href;
      }
    }
  }

  // Any free external website link near the header (not social, not contact)
  const header = main.querySelector('h1')?.closest('section, div, header') ?? main;
  for (const a of Array.from(header.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
    if (!isExternalWebsite(a.href)) continue;
    if (/facebook|twitter|linkedin|instagram|youtube|mailto|tel:/i.test(a.href)) continue;
    if (/contact|quote/i.test(a.textContent ?? '')) continue;
    return a.href;
  }
  return null;
}

function parseProfileAddress(main: Element): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const text = main.textContent ?? '';
  const m = text.match(
    /(\d{1,6}\s+[A-Za-z0-9 .#'-]+)\s+([A-Za-z .'-]+),\s*([A-Z]{2})\s*(?:US\s*)?(\d{5})?/
  );
  if (!m) return { address: null, city: null, state: null, zip: null };
  return {
    address: m[1].trim(),
    city: m[2].trim(),
    state: m[3],
    zip: m[4] ?? null,
  };
}

function findBadge(main: Element, re: RegExp): string | null {
  const nodes = Array.from(main.querySelectorAll('span, div, p, li'));
  for (const el of nodes) {
    const t = clean(el.textContent ?? '');
    if (re.test(t) && t.length < 20) return t;
  }
  return null;
}

function findAboutText(main: Element): string | null {
  const headings = Array.from(main.querySelectorAll('h2, h3, h4'));
  for (const h of headings) {
    if (!/^about\b/i.test(clean(h.textContent ?? ''))) continue;
    const parts: string[] = [];
    let n = h.nextElementSibling;
    while (n && !/^H[1-4]$/.test(n.tagName)) {
      if (n.tagName === 'P') {
        const t = clean(n.textContent ?? '');
        // Skip if it looks like contact info
        if (t && !/\b(email|phone|@|tel:)\b/i.test(t)) parts.push(t);
      }
      n = n.nextElementSibling;
      if (parts.join(' ').length > 800) break;
    }
    return parts.join('\n\n') || null;
  }
  return null;
}

function parseSectionList(root: Element, headingRe: RegExp): string[] {
  const headings = Array.from(root.querySelectorAll('h2, h3, h4, h5, strong'));
  for (const h of headings) {
    const label = clean(h.textContent ?? '').replace(/\s*\(\d+\)\s*$/, '');
    if (!headingRe.test(label)) continue;
    const container = h.closest('section, div') ?? h.parentElement;
    if (!container) continue;
    const items = Array.from(container.querySelectorAll('li'))
      .map((li) => clean(li.textContent ?? ''))
      .filter((t) => t && t.length < 80 && !/^see all$/i.test(t));
    if (items.length) return [...new Set(items)];
  }
  return [];
}

function parseFleetTable(root: Element): FleetBreakdown {
  const result: FleetBreakdown = {};
  const tables = Array.from(root.querySelectorAll('table'));
  for (const table of tables) {
    const header = clean(table.textContent ?? '').toLowerCase();
    if (!header.includes('tractors') && !header.includes('owned')) continue;

    const rows = Array.from(table.querySelectorAll('tr'));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('th, td')).map((c) =>
        clean(c.textContent ?? '')
      );
      if (cells.length < 2) continue;
      const label = cells[0].toLowerCase();
      const nums = cells.slice(1).map((c) => parseInt(c.replace(/,/g, ''), 10));
      if (label.includes('owned')) {
        result.ownedTractors = Number.isNaN(nums[0]) ? null : nums[0];
        result.ownedTrailers = Number.isNaN(nums[1]) ? null : nums[1];
        result.ownedTrucks = Number.isNaN(nums[2]) ? null : nums[2];
      }
      if (label.includes('leased')) {
        result.leasedTractors = Number.isNaN(nums[0]) ? null : nums[0];
        result.leasedTrailers = Number.isNaN(nums[1]) ? null : nums[1];
        result.leasedTrucks = Number.isNaN(nums[2]) ? null : nums[2];
      }
    }
  }
  return result;
}

function estimatePowerUnits(fleet: FleetBreakdown, main: Element): number | null {
  const owned = fleet.ownedTractors ?? 0;
  const leased = fleet.leasedTractors ?? 0;
  const trucks =
    (fleet.ownedTrucks ?? 0) + (fleet.leasedTrucks ?? 0);
  const sum = owned + leased + trucks;
  if (sum > 0) return sum;

  const m = (main.textContent ?? '').match(/(\d+)\s*[- ]?truck/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

function parseMcs150(main: Element): { mileage: number | null; year: number | null } {
  const text = main.textContent ?? '';
  const m = text.match(/MCS-150\s*Mileage\s*([\d,]+)\s*\((\d{4})\)/i);
  if (!m) return { mileage: null, year: null };
  return {
    mileage: parseInt(m[1].replace(/,/g, ''), 10),
    year: parseInt(m[2], 10),
  };
}

function findAuthorityStatus(main: Element): string | null {
  const text = main.textContent ?? '';
  const m = text.match(/Motor Carrier\s+(Active|Inactive|None)[^\n]{0,40}/i);
  if (m) return clean(m[0]);
  const auth = findLabeledBlock(main, /^authority$/i);
  return auth;
}

function findAuthorityDate(main: Element): string | null {
  const text = main.textContent ?? '';
  const m = text.match(/Motor Carrier\s+Active\s*[—\-–]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  return m ? m[1] : null;
}

function findFfAuthority(main: Element): string | null {
  const text = main.textContent ?? '';
  const m = text.match(/Freight Forwarder\s+(Active|Inactive|None)[^\n]{0,40}/i);
  return m ? clean(m[0]) : null;
}

function parseCargoAuth(main: Element): string[] {
  const block = findLabeledBlock(main, /^cargo authorization$/i);
  if (!block) return [];
  return block
    .split(/[\n,]/)
    .map(clean)
    .filter((t) => t && t.length < 40);
}

function findSafetyRating(main: Element): string | null {
  const text = main.textContent ?? '';
  const m = text.match(/safety rating[:\s]+(Satisfactory|Conditional|Unsatisfactory|None)/i);
  if (m) return m[1];
  return findLabeledBlock(main, /^safety rating$/i);
}

function parseInsurance(main: Element): InsuranceInfo[] {
  const results: InsuranceInfo[] = [];
  const text = main.textContent ?? '';

  // Pattern from observed profile layout
  const typeMatches = [
    ...text.matchAll(/Insurance Type\s*(BIPD[^]*?|Cargo|Bond)[\s\S]{0,200}?Company Name\s*([^\n]+)/gi),
  ];

  // Simpler structured parse via labels
  const sections = text.split(/Insurance Type/i).slice(1);
  for (const section of sections.slice(0, 5)) {
    const insuranceType = clean(section.split('\n')[0] ?? '') || null;
    const companyName = section.match(/Company Name\s*([^\n]+)/i)?.[1]?.trim() ?? null;
    const policyLimit = section.match(/Policy Limit\s*([^\n]+)/i)?.[1]?.trim() ?? null;
    const effectiveDate = section.match(/Effective Date\s*([^\n]+)/i)?.[1]?.trim() ?? null;
    // Skip policy numbers that look like they could be sensitive — still public on page,
    // but we only keep type/company/limit/date per requirements.
    if (insuranceType || companyName || policyLimit) {
      results.push({ insuranceType, companyName, policyLimit, effectiveDate });
    }
  }

  void typeMatches;
  return results;
}

function parseInspections(main: Element): InspectionSummary | null {
  const text = main.textContent ?? '';
  const driver = text.match(
    /Driver\s+(\d+)\s+(\d+)\s+([\d.]+)%/i
  );
  const vehicle = text.match(
    /Vehicle\s+(\d+)\s+(\d+)\s+([\d.]+)%/i
  );
  if (!driver && !vehicle) return null;
  return {
    driverInspections: driver ? parseInt(driver[1], 10) : null,
    driverOosInspections: driver ? parseInt(driver[2], 10) : null,
    driverOosPercentage: driver ? parseFloat(driver[3]) : null,
    vehicleInspections: vehicle ? parseInt(vehicle[1], 10) : null,
    vehicleOosInspections: vehicle ? parseInt(vehicle[2], 10) : null,
    vehicleOosPercentage: vehicle ? parseFloat(vehicle[3]) : null,
  };
}

function parseViolations(main: Element): ViolationSummary[] {
  const types = [
    'Vehicle Maintenance',
    'Unsafe Driving',
    'Hours of Service Compliance',
    'Driver Fitness',
    'Controlled Substances',
  ];
  const text = main.textContent ?? '';
  const out: ViolationSummary[] = [];
  for (const type of types) {
    const re = new RegExp(
      `${type}\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+([\\d.]+)\\s+([\\d.]+)%`,
      'i'
    );
    const m = text.match(re);
    if (m) {
      out.push({
        type,
        total: parseInt(m[1], 10),
        severe: parseInt(m[2], 10),
        outOfService: parseInt(m[3], 10),
        measure: parseFloat(m[4]),
        percentile: parseFloat(m[5]),
      });
    }
  }
  return out;
}

function parseRatingCategories(main: Element): RatingCategories {
  const text = main.textContent ?? '';
  const pick = (label: string): number | null => {
    const re = new RegExp(`${label}\\s*([\\d.]+)`, 'i');
    const m = text.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return {
    qualityOfEquipment: pick('Quality of Equipment'),
    communication: pick('Communication'),
    timeliness: pick('Timeliness'),
  };
}

function parseOverallRating(main: Element): {
  overallRating: number | null;
  reviewCount: number | null;
} {
  const text = main.textContent ?? '';
  const rating = text.match(/(\d(?:\.\d)?)\s*out of\s*5/i);
  const reviews = text.match(/\((\d+)\s*reviews?\)/i);
  return {
    overallRating: rating ? parseFloat(rating[1]) : null,
    reviewCount: reviews ? parseInt(reviews[1], 10) : null,
  };
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
