import type { PartialCarrierCard, SearchContext } from '../types/job';
import { extractCardFromElement } from './cardExtractor';
import { extractProfileDetails } from './profileExtractor';
import { detectPagination, clickNextPage } from './paginationDetector';
import { DomObserverController, waitForResultsChange } from './domObserver';
import { getPageReadyState } from './challengeDetect';
import {
  inferSearchContextFromUrl,
  isProfilePage,
  isResultsPage,
} from '../utils/urlValidation';
import { isInRenderedDocument } from '../utils/visibility';
import { extractMcNumbers, extractUsdot } from '../utils/identifierParser';

/**
 * CarrierSource-specific site adapter.
 *
 * Confirmed from public pages (Oct 2026):
 * - Results list carrier cards with company name, MC, USDOT, authority, fleet,
 *   truck types, freight, ratings, and Sponsored markers.
 * - Profile pages expose Docket (MC/FF), USDOT, address, website, fleet table,
 *   compliance, insurance, and numerical rating categories.
 *
 * Live selector refinement may still be needed if CarrierSource changes markup.
 * Prefer semantic cues (profile links, MC/USDOT text, labeled fields) over
 * hashed CSS class names.
 */

export class CarrierSourceAdapter {
  readonly observer = new DomObserverController();

  getPageContext(): SearchContext & {
    isResultsPage: boolean;
    isProfilePage: boolean;
    title: string;
  } {
    const url = location.href;
    const inferred = inferSearchContextFromUrl(url);
    const detectedFilters = detectActiveFilters();

    return {
      url,
      equipmentTypes: inferred.equipmentType
        ? [inferred.equipmentType]
        : detectSelectedTruckTypes(),
      searchState: inferred.searchState,
      searchCity: inferred.searchCity,
      carriersOnly: detectedFilters.includes('Carrier'),
      activeAuthorityOnly: false,
      detectedFilters,
      pageTitle: document.title,
      isResultsPage: isResultsPage(url),
      isProfilePage: isProfilePage(url),
      title: document.title,
    };
  }

  /**
   * Locate the results container and genuine carrier cards.
   * Ignores nav, footer, similar-company sidebars, and hidden templates.
   */
  findCarrierCards(): Element[] {
    const resultsRoot = this.findResultsContainer();
    const scope = resultsRoot ?? document.body;

    // Primary: cards that contain both a /carriers/ profile link and an MC or USDOT
    const profileLinks = Array.from(
      scope.querySelectorAll('a[href*="/carriers/"]')
    ) as HTMLAnchorElement[];

    const cards: Element[] = [];
    const seen = new Set<Element>();

    for (const link of profileLinks) {
      if (!isInRenderedDocument(link)) continue;
      if (link.closest('nav, footer, [role="navigation"]')) continue;
      // Skip "similar / alternative" blocks
      if (isInSimilarBlock(link)) continue;

      const card = findCardWrapper(link);
      if (!card || seen.has(card)) continue;
      if (!looksLikeCarrierCard(card)) continue;

      seen.add(card);
      cards.push(card);
    }

    return cards;
  }

  findResultsContainer(): Element | null {
    // Semantic / landmark preferences
    const candidates = [
      document.querySelector('[data-testid*="results" i]'),
      document.querySelector('[aria-label*="results" i]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
    ].filter(Boolean) as Element[];

    for (const c of candidates) {
      if (c.querySelectorAll('a[href*="/carriers/"]').length >= 1) return c;
    }
    return document.querySelector('main') ?? document.body;
  }

  extractCards(): {
    carriers: PartialCarrierCard[];
    pageFingerprint: string;
    searchContext: SearchContext;
  } {
    const ctx = this.getPageContext();
    const cards = this.findCarrierCards();
    const pageIdentifier = buildPageIdentifier(ctx.url, cards.length);
    const carriers: PartialCarrierCard[] = [];

    for (const cardEl of cards) {
      const extracted = extractCardFromElement(cardEl, ctx.url, pageIdentifier);
      if (!extracted) continue;
      // Skip cards with no identifiers and no profile — likely noise
      if (
        !extracted.usdot &&
        extracted.mcNumbers.length === 0 &&
        !extracted.profileUrl
      ) {
        continue;
      }
      carriers.push(extracted);
    }

    const pageFingerprint = fingerprintResults(carriers, ctx.url);

    return {
      carriers,
      pageFingerprint,
      searchContext: {
        url: ctx.url,
        equipmentTypes: ctx.equipmentTypes,
        searchState: ctx.searchState,
        searchCity: ctx.searchCity,
        carriersOnly: ctx.carriersOnly,
        activeAuthorityOnly: ctx.activeAuthorityOnly,
        detectedFilters: ctx.detectedFilters,
        pageTitle: ctx.pageTitle,
      },
    };
  }

  extractProfile() {
    return extractProfileDetails(document);
  }

  detectPagination() {
    return detectPagination(document);
  }

  clickNext() {
    return clickNextPage(document);
  }

  getReadyState() {
    return getPageReadyState(document);
  }

  async waitForChange(previousFingerprint: string) {
    return waitForResultsChange(
      () => this.extractCards().pageFingerprint,
      previousFingerprint,
      15000,
      () => this.extractCards().carriers.length,
      1
    );
  }
}

function findCardWrapper(link: Element): Element | null {
  let current: Element | null = link;
  for (let depth = 0; depth < 12 && current; depth++) {
    const text = current.textContent ?? '';
    const hasId =
      /\bMC[\s\-]?\d/i.test(text) ||
      /\bUSDOT\b/i.test(text) ||
      /\bFleet Size\b/i.test(text) ||
      /\bAuthority\b/i.test(text);

    // Article / listitem semantics
    if (
      current.matches('article, li, [role="listitem"], [data-carrier], [itemtype*="Organization"]')
    ) {
      return current;
    }

    // Heuristic: a reasonably sized block with identifiers
    if (hasId && text.length > 40 && text.length < 8000) {
      // Prefer a parent that doesn't encompass the entire results list
      const siblingCards = current.parentElement
        ? Array.from(current.parentElement.children).filter((c) =>
            c.querySelector('a[href*="/carriers/"]')
          )
        : [];
      if (siblingCards.length >= 2 || depth >= 3) {
        return current;
      }
    }
    current = current.parentElement;
  }
  return link.closest('article, li, div');
}

function looksLikeCarrierCard(card: Element): boolean {
  const text = card.textContent ?? '';
  if (text.length < 20) return false;
  // Must not be the entire page
  if (text.length > 20000) return false;
  const hasProfile = Boolean(card.querySelector('a[href*="/carriers/"]'));
  const hasId =
    extractMcNumbers(text).length > 0 || Boolean(extractUsdot(text));
  // Top-rated / sponsored cards on landing pages may only show name + equipment
  const hasFleetOrRating =
    /\bpower units?\b/i.test(text) ||
    /\breviews?\b/i.test(text) ||
    /\bfleet size\b/i.test(text);
  return hasProfile && (hasId || hasFleetOrRating);
}

function isInSimilarBlock(el: Element): boolean {
  const block = el.closest('aside, [class*="similar" i], [class*="alternative" i]');
  if (block) {
    const heading = block.querySelector('h2, h3, h4')?.textContent ?? '';
    if (/similar|alternative|nearby|looking for/i.test(heading + (block.textContent ?? '').slice(0, 200))) {
      return true;
    }
  }
  const nearbyHeading = el.parentElement
    ?.closest('section, div')
    ?.querySelector('h2, h3')?.textContent;
  if (nearbyHeading && /alternative carriers|similar companies/i.test(nearbyHeading)) {
    return true;
  }
  return false;
}

function detectActiveFilters(): string[] {
  const filters: string[] = [];
  // Checked checkboxes / pressed toggles in filter panels
  const checked = document.querySelectorAll(
    'input[type="checkbox"]:checked, [aria-checked="true"], [aria-pressed="true"]'
  );
  for (const el of Array.from(checked)) {
    const label =
      (el as HTMLInputElement).labels?.[0]?.textContent ??
      el.getAttribute('aria-label') ??
      el.parentElement?.textContent ??
      '';
    const t = label.replace(/\s+/g, ' ').trim();
    if (t && t.length < 60) filters.push(t);
  }
  return [...new Set(filters)].slice(0, 40);
}

function detectSelectedTruckTypes(): string[] {
  const known = [
    'Box Truck',
    'Dry Van',
    'Reefer',
    'Flatbed',
    'Power Only',
    'Hot Shot',
    'Step Deck',
    'Sprinter Van',
    'Auto Carrier',
    'Container',
    'Conestoga',
    'Lowboy',
    'Tanker',
    'Dump Trailer',
    'Hopper Bottom',
    'Oversized',
    'Pneumatic',
    'Removable Gooseneck',
  ];
  const selected = detectActiveFilters();
  return known.filter((k) =>
    selected.some((s) => s.toLowerCase() === k.toLowerCase())
  );
}

function buildPageIdentifier(url: string, count: number): string {
  return `${url}#cards=${count}`;
}

function fingerprintResults(carriers: PartialCarrierCard[], url: string): string {
  const ids = carriers
    .map((c) => c.usdot || c.mcNumbers.join(',') || c.companyName)
    .sort()
    .join('|');
  // Simple stable hash
  let hash = 0;
  const input = `${url}::${ids}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash)}_${carriers.length}`;
}

export const adapter = new CarrierSourceAdapter();
