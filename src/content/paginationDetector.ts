import type { PaginationInfo } from '../types/job';
import { isInRenderedDocument } from '../utils/visibility';

/**
 * Detect pagination only from the live, visible UI.
 * CarrierSource search uses a bottom pager: « < 1 2 3 4 5 6 … > »
 * Prefer the single ">" next control — never invent ?page= URLs.
 */

export function detectPagination(doc: Document = document): PaginationInfo {
  const nextBtn = findNextControl(doc);
  if (nextBtn) {
    const disabled = isDisabled(nextBtn);
    return {
      strategy: 'next_button',
      hasNext: !disabled,
      nextLabel: clean(nextBtn.textContent ?? '') || nextBtn.getAttribute('aria-label'),
      disabled,
      detail: disabled
        ? 'Next control is present but disabled (likely last page).'
        : 'Visible pagination Next (>) control found at page bottom.',
    };
  }

  const loadMore = findLoadMoreControl(doc);
  if (loadMore) {
    const disabled = isDisabled(loadMore);
    return {
      strategy: 'load_more',
      hasNext: !disabled,
      nextLabel: clean(loadMore.textContent ?? ''),
      disabled,
      detail: disabled
        ? 'Load More control is disabled.'
        : 'Visible Load More control found.',
    };
  }

  if (hasInfiniteScrollMarkers(doc)) {
    return {
      strategy: 'infinite_scroll',
      hasNext: true,
      nextLabel: null,
      disabled: false,
      detail:
        'Possible infinite scroll markers detected. Confirm behavior before automated scrolling.',
    };
  }

  return {
    strategy: 'none',
    hasNext: false,
    nextLabel: null,
    disabled: true,
    detail:
      'No accessible Next / Load More control found in the rendered DOM. Automated traversal stopped.',
  };
}

/** Scroll the pager into view, then click the genuine Next (>) control. */
export async function clickNextPage(doc: Document = document): Promise<{
  clicked: boolean;
  detail: string;
}> {
  const next = findNextControl(doc) ?? findLoadMoreControl(doc);
  if (!next) {
    return { clicked: false, detail: 'No pagination control available.' };
  }
  if (isDisabled(next)) {
    return { clicked: false, detail: 'Pagination control is disabled.' };
  }
  if (isForbiddenControl(next)) {
    return { clicked: false, detail: 'Control is a forbidden action button.' };
  }
  if (!(next instanceof HTMLElement)) {
    return { clicked: false, detail: 'Pagination control is not clickable.' };
  }

  // Roll to the bottom pager before clicking — matches real user behavior
  // and avoids interacting with unrelated top-of-page controls.
  const pager = next.closest(
    'nav, [role="navigation"], .pagination, [class*="pagination" i], [aria-label*="pagination" i]'
  ) as HTMLElement | null;

  (pager ?? next).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  await sleep(450);

  // Second scroll pass if layout shifted
  next.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center' });
  await sleep(150);

  next.click();
  return {
    clicked: true,
    detail: 'Scrolled to bottom pagination and clicked Next (>).',
  };
}

export function findNextControl(doc: Document = document): Element | null {
  const pagerRoots = findPagerRoots(doc);

  // Pass 1: inside known pager regions — prefer exact ">" next (not "»" last)
  for (const root of pagerRoots) {
    const hit = pickNextFromRoot(root);
    if (hit) return hit;
  }

  // Pass 2: whole document, still prefer ">" over generic "next"
  return pickNextFromRoot(doc.body);
}

function findPagerRoots(doc: Document): Element[] {
  const roots: Element[] = [];
  const seen = new Set<Element>();

  const add = (el: Element | null) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    roots.push(el);
  };

  doc
    .querySelectorAll(
      'nav, [role="navigation"], .pagination, [class*="pagination" i], [aria-label*="pagination" i], [aria-label*="Pagination" i]'
    )
    .forEach((el) => add(el));

  // Heuristic: a list/row that contains both a page number and ">" 
  for (const el of Array.from(doc.querySelectorAll('ul, ol, div, nav'))) {
    const text = clean(el.textContent ?? '');
    if (text.length > 80) continue;
    if (/\b\d+\b/.test(text) && /[>›]/.test(text) && /[<‹]/.test(text)) {
      add(el);
    }
  }

  // Prefer roots lower on the page (footer-adjacent pager)
  return roots.sort((a, b) => {
    const ay = a.getBoundingClientRect().top + window.scrollY;
    const by = b.getBoundingClientRect().top + window.scrollY;
    return by - ay;
  });
}

function pickNextFromRoot(root: Element): Element | null {
  const candidates = Array.from(
    root.querySelectorAll('a, button, [role="button"], [role="link"], span, li')
  );

  let best: Element | null = null;
  let bestScore = -1;

  for (const el of candidates) {
    if (!isInRenderedDocument(el)) continue;
    if (isForbiddenControl(el)) continue;
    if (isDisabled(el)) continue;

    const score = scoreNextCandidate(el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (bestScore >= 50) {
    // Prefer the clickable child/anchor if we scored a wrapper li/span
    const clickable =
      best?.matches('a, button, [role="button"], [role="link"]')
        ? best
        : best?.querySelector('a, button, [role="button"], [role="link"]');
    return (clickable as Element) ?? best;
  }
  return null;
}

function scoreNextCandidate(el: Element): number {
  const raw = clean(el.textContent ?? '');
  const aria = (
    (el.getAttribute('aria-label') ?? '') +
    ' ' +
    (el.getAttribute('title') ?? '') +
    ' ' +
    (el.getAttribute('rel') ?? '')
  ).toLowerCase();

  // Never pick first/last/prev
  if (/^(«|‹|<|<<)$/.test(raw)) return -1;
  if (/^(»|>>)$/.test(raw)) return -1; // last page — not next
  if (/\b(previous|prev|first|last)\b/i.test(aria + ' ' + raw)) return -1;
  if (/^\d+$/.test(raw)) return -1; // page number

  let score = 0;

  if ((el.getAttribute('rel') ?? '').toLowerCase() === 'next') score += 100;
  if (/\bnext\b/i.test(aria) && !/\bprevious\b/i.test(aria)) score += 90;

  // CarrierSource pager uses a lone ">" for next
  if (raw === '>' || raw === '›') score += 95;
  if (raw.toLowerCase() === 'next' || raw.toLowerCase() === 'next page') score += 90;

  // Mild boost if inside a pager-looking parent
  if (el.closest('nav, .pagination, [class*="pagination" i], [aria-label*="pagination" i]')) {
    score += 10;
  }

  // Must be an interactive-ish control for high scores from ">"
  if (score >= 90 && !el.matches('a, button, [role="button"], [role="link"]')) {
    // wrapper — still usable if it contains a link
    if (!el.querySelector('a, button, [role="button"], [role="link"]')) {
      score -= 20;
    }
  }

  return score;
}

function findLoadMoreControl(doc: Document): Element | null {
  const candidates = Array.from(doc.querySelectorAll('a, button, [role="button"]'));
  for (const el of candidates) {
    if (!isInRenderedDocument(el)) continue;
    if (isForbiddenControl(el)) continue;
    const label = clean(el.textContent ?? '').toLowerCase();
    if (
      label === 'load more' ||
      label === 'show more' ||
      label === 'see more results' ||
      /^load more/.test(label)
    ) {
      return el;
    }
  }
  return null;
}

function hasInfiniteScrollMarkers(doc: Document): boolean {
  return Boolean(
    doc.querySelector(
      '[data-infinite-scroll], [data-testid*="infinite"], .infinite-scroll-component, [aria-label*="infinite" i]'
    )
  );
}

function isDisabled(el: Element): boolean {
  if (el.hasAttribute('disabled')) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.classList.contains('disabled')) return true;
  if (el instanceof HTMLButtonElement && el.disabled) return true;
  const parent = el.closest('[aria-disabled="true"], .disabled');
  if (parent && parent !== el) return true;
  if (el instanceof HTMLAnchorElement && el.getAttribute('tabindex') === '-1') {
    const style = window.getComputedStyle(el);
    if (style.pointerEvents === 'none') return true;
  }
  return false;
}

function isForbiddenControl(el: Element): boolean {
  const label = (
    (el.textContent ?? '') +
    (el.getAttribute('href') ?? '') +
    (el.getAttribute('aria-label') ?? '')
  ).toLowerCase();
  return /contact|request quote|download list|sign in|subscribe|upgrade|payment|checkout/.test(
    label
  );
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
