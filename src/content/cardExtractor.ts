import type { PartialCarrierCard } from '../types/job';
import {
  extractMcNumbers,
  extractFfNumbers,
  extractUsdot,
  parseDocketLine,
} from '../utils/identifierParser';
import { isInRenderedDocument } from '../utils/visibility';
import { isExternalWebsite } from '../utils/urlValidation';

const CONTACT_BLOCK_RE =
  /\b(request quote|contact|call|email|phone|tel:|mailto:)\b/i;

/**
 * Extract a single carrier card from a scoped DOM subtree.
 * Never reads contact modals or clicks Contact / Request Quote.
 */
export function extractCardFromElement(
  cardEl: Element,
  sourceUrl: string,
  pageIdentifier: string | null
): PartialCarrierCard | null {
  if (!isInRenderedDocument(cardEl)) return null;

  // Skip navigation / footer / similar-company sidebars
  if (cardEl.closest('nav, footer, [role="navigation"], [data-similar], aside')) {
    return null;
  }

  const companyName = findCompanyName(cardEl);
  if (!companyName) return null;

  const profileUrl = findProfileUrl(cardEl, sourceUrl);
  const idScope = findIdentifierScope(cardEl);
  const idText = idScope?.textContent ?? '';

  let mcNumbers = extractMcNumbers(idText);
  let ffNumbers = extractFfNumbers(idText);
  let usdot = extractUsdot(idText);

  // Always reconcile against safe card text so a scoped MC hit does not
  // skip sibling USDOT / FF nodes in the same card.
  const safeText = getSafeCardText(cardEl);
  const docket = parseDocketLine(safeText);
  if (mcNumbers.length === 0) mcNumbers = docket.mcNumbers;
  else mcNumbers = uniqueMerge(mcNumbers, docket.mcNumbers);
  ffNumbers = uniqueMerge(ffNumbers, docket.ffNumbers);
  if (!usdot) usdot = extractUsdot(safeText);

  // A genuine carrier card should have at least a name and preferably an identifier.
  // Cards with only a name and profile link are allowed but marked sparse.
  const location = parseLocation(cardEl);
  const isSponsored = detectSponsored(cardEl);
  const isBroker = detectBroker(cardEl);
  const operationType = findLabeledValue(cardEl, /^(interstate|intrastate)$/i)
    ?? detectOperation(cardEl);
  const powerUnits = parsePowerUnits(cardEl);
  const authority = parseAuthority(cardEl);
  const safetyRating = findLabeledValue(cardEl, /^safety rating$/i);
  const insuranceLimit = findLabeledValue(cardEl, /^insurance$/i);
  const truckTypes = parseListSection(cardEl, /truck types?/i);
  const freightCategories = parseListSection(cardEl, /^freight$/i);
  const shipmentTypes = parseListSection(cardEl, /shipment types?/i);
  const specializedServices = parseListSection(cardEl, /specialized services?/i);
  const { overallRating, reviewCount } = parseRatings(cardEl);
  const websiteUrl = findWebsiteUrl(cardEl);

  return {
    companyName,
    usdot,
    mcNumbers,
    ffNumbers,
    profileUrl,
    websiteUrl,
    city: location.city,
    businessState: location.state,
    zipCode: location.zip,
    businessAddress: location.address,
    classification: isBroker ? 'Brokerage' : 'Carrier',
    operationType,
    truckTypes,
    freightCategories,
    shipmentTypes,
    specializedServices,
    powerUnits,
    authorityStatus: authority.status,
    authorityStartDate: authority.startDate,
    safetyRating,
    insuranceLimit,
    overallRating,
    reviewCount,
    isSponsored,
    isBroker,
    sourceUrl,
    pageIdentifier,
  };
}

function findCompanyName(cardEl: Element): string | null {
  // Prefer profile hyperlink text
  const profileLink = cardEl.querySelector(
    'a[href*="/carriers/"]'
  ) as HTMLAnchorElement | null;
  if (profileLink?.textContent?.trim()) {
    const name = cleanText(profileLink.textContent);
    // Skip "Read more about X" links
    if (name && !/^read more/i.test(name) && !CONTACT_BLOCK_RE.test(name)) {
      return name.replace(/^read more about\s+/i, '').trim() || name;
    }
  }

  for (const sel of ['h2', 'h3', 'h4', '[data-company-name]', '[itemprop="name"]']) {
    const el = cardEl.querySelector(sel);
    if (el?.textContent?.trim()) {
      const t = cleanText(el.textContent);
      if (t && !CONTACT_BLOCK_RE.test(t) && t.length < 120) return t;
    }
  }

  return null;
}

function findProfileUrl(cardEl: Element, sourceUrl: string): string | null {
  const links = Array.from(
    cardEl.querySelectorAll('a[href*="/carriers/"]')
  ) as HTMLAnchorElement[];
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href) continue;
    if (/contact|quote|review|sign/i.test(href)) continue;
    try {
      return new URL(href, sourceUrl).toString();
    } catch {
      /* continue */
    }
  }
  return null;
}

function findIdentifierScope(cardEl: Element): Element | null {
  // Prefer elements that contain MC or USDOT labels
  const candidates = Array.from(cardEl.querySelectorAll('li, span, div, p, dd, td'));
  for (const el of candidates) {
    const text = el.textContent ?? '';
    if (/\bMC[\s\-]?\d/i.test(text) || /\bUSDOT\b/i.test(text) || /\bDocket\b/i.test(text)) {
      // Prefer the smallest scoped element
      if (text.length < 200) return el;
    }
  }
  // Parent that groups MC | USDOT
  for (const el of candidates) {
    const text = el.textContent ?? '';
    if (/\bMC[\s\-]?\d/i.test(text) && /\bUSDOT\b/i.test(text) && text.length < 300) {
      return el;
    }
  }
  return null;
}

function getSafeCardText(cardEl: Element): string {
  const clone = cardEl.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'button, [href*="contact"], [href*="quote"], [href*="mailto"], [href*="tel:"], form, dialog, [role="dialog"]'
    )
    .forEach((n) => n.remove());
  return clone.textContent ?? '';
}

function detectSponsored(cardEl: Element): boolean {
  const text = cardEl.textContent ?? '';
  if (/\bsponsored\b/i.test(text.slice(0, 400))) return true;
  if (cardEl.querySelector('[data-sponsored], .sponsored, [aria-label*="Sponsored"]')) {
    return true;
  }
  return false;
}

function detectBroker(cardEl: Element): boolean {
  const text = getSafeCardText(cardEl).toLowerCase();
  // Only treat as brokerage when classification is explicit — not "Broker Active"
  // authority wording alone, and not review text mentioning brokers.
  if (/\bbrokerage\b/.test(text)) return true;
  const heading = cardEl.querySelector('h2, h3, h4')?.textContent?.toLowerCase() ?? '';
  if (/\bbroker\b/.test(heading) && !/\b(truck|freight|transport|logistics|carrier)\b/.test(heading)) {
    return true;
  }
  if (/company type\s*broker/i.test(text)) return true;
  return false;
}

function detectOperation(cardEl: Element): string | null {
  const text = cardEl.textContent ?? '';
  if (/\bInterstate\b/.test(text)) return 'Interstate';
  if (/\bIntrastate\b/.test(text)) return 'Intrastate';
  return null;
}

function parsePowerUnits(cardEl: Element): number | null {
  const fleetVal = findLabeledValue(cardEl, /^fleet size$/i);
  if (fleetVal) {
    const n = parseInt(fleetVal.replace(/,/g, ''), 10);
    if (!Number.isNaN(n)) return n;
  }
  const text = cardEl.textContent ?? '';
  const m = text.match(/([\d,]+)\s*power units?/i);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function parseAuthority(cardEl: Element): {
  status: string | null;
  startDate: string | null;
} {
  const val = findLabeledValue(cardEl, /^authority$/i);
  if (!val) return { status: null, startDate: null };
  const dateMatch = val.match(/\((\d{1,2}\/\d{1,2}\/\d{2,4})\)/);
  return {
    status: val.replace(/\(.*?\)/, '').trim() || null,
    startDate: dateMatch ? dateMatch[1] : null,
  };
}

function parseRatings(cardEl: Element): {
  overallRating: number | null;
  reviewCount: number | null;
} {
  const text = cardEl.textContent ?? '';
  let overallRating: number | null = null;
  let reviewCount: number | null = null;

  const ratingMatch = text.match(/(\d(?:\.\d)?)\s*(?:out of\s*5|\/\s*5)/i);
  if (ratingMatch) overallRating = parseFloat(ratingMatch[1]);

  const reviewMatch = text.match(/\((\d+)\s*reviews?\)/i);
  if (reviewMatch) reviewCount = parseInt(reviewMatch[1], 10);

  return { overallRating, reviewCount };
}

function parseLocation(cardEl: Element): {
  city: string | null;
  state: string | null;
  zip: string | null;
  address: string | null;
} {
  // Results cards often show "City, ST · N power units"
  const text = getSafeCardText(cardEl);
  const locMatch = text.match(
    /([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?(?:\s*[·•|]|\s+\d+\s*power)/
  );
  if (locMatch) {
    return {
      city: locMatch[1].trim(),
      state: locMatch[2],
      zip: locMatch[3] ?? null,
      address: null,
    };
  }

  // Full address on profiles: "5407 Mesa Drive Houston, TX US 77028"
  const addrMatch = text.match(
    /(\d{1,6}\s+[^\n,]{3,60}?)\s+([A-Za-z .'-]+),\s*([A-Z]{2})\s*(?:US\s*)?(\d{5})?/
  );
  if (addrMatch) {
    return {
      address: addrMatch[1].trim(),
      city: addrMatch[2].trim(),
      state: addrMatch[3],
      zip: addrMatch[4] ?? null,
    };
  }

  return { city: null, state: null, zip: null, address: null };
}

function parseListSection(cardEl: Element, headingRe: RegExp): string[] {
  const headings = Array.from(cardEl.querySelectorAll('h2, h3, h4, h5, strong, dt, legend'));
  for (const h of headings) {
    const label = cleanText(h.textContent ?? '');
    if (!headingRe.test(label.replace(/\s*\(\d+\)\s*$/, ''))) continue;
    const container = h.closest('section, div, article') ?? h.parentElement;
    if (!container) continue;
    const items = Array.from(container.querySelectorAll('li, a, span'))
      .map((el) => cleanText(el.textContent ?? ''))
      .filter(
        (t) =>
          t &&
          t.length < 60 &&
          !/^see all$/i.test(t) &&
          !headingRe.test(t) &&
          !CONTACT_BLOCK_RE.test(t)
      );
    const unique = [...new Set(items)];
    if (unique.length > 0) return unique.slice(0, 40);
  }

  // Text fallback for "Truck Types (5)" blocks
  return [];
}

function findLabeledValue(cardEl: Element, labelRe: RegExp): string | null {
  const walkers = Array.from(cardEl.querySelectorAll('div, dt, th, span, p, li'));
  for (const el of walkers) {
    const text = cleanText(el.textContent ?? '');
    if (!text || text.length > 80) continue;
    if (!labelRe.test(text)) continue;
    // Next sibling value
    const next = el.nextElementSibling;
    if (next?.textContent) {
      const v = cleanText(next.textContent);
      if (v && v !== text && v.length < 120) return v;
    }
    // Parent may be "Label\nValue"
    const parentText = cleanText(el.parentElement?.textContent ?? '');
    if (parentText.startsWith(text) && parentText.length > text.length) {
      const rest = parentText.slice(text.length).trim();
      if (rest && rest.length < 120) return rest;
    }
  }
  return null;
}

function findWebsiteUrl(cardEl: Element): string | null {
  const links = Array.from(cardEl.querySelectorAll('a[href]')) as HTMLAnchorElement[];
  for (const a of links) {
    const href = a.href;
    if (!href) continue;
    if (/carriersource\.io/i.test(href)) continue;
    if (/mailto:|tel:|javascript:/i.test(href)) continue;
    if (CONTACT_BLOCK_RE.test(a.textContent ?? '')) continue;
    if (isExternalWebsite(href)) return href;
  }
  return null;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueMerge(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
