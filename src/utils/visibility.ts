/**
 * Visibility helpers distinguish intentionally hidden/restricted content
 * from ordinary off-screen results that remain in the rendered document.
 */

export function isIntentionallyHidden(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden') return true;
  if (style.opacity === '0' && style.pointerEvents === 'none') return true;

  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') {
    // aria-hidden on decorative wrappers is common; only treat as hidden
    // when the element itself has no layout box.
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return true;
  }

  // Access-restricted / paywall overlays often use data attributes or classes.
  const restrictedHints = [
    'paywall',
    'locked',
    'premium-only',
    'subscription-required',
    'blur-content',
  ];
  const classAndAttrs = `${el.className} ${el.getAttribute('data-access') ?? ''}`.toLowerCase();
  if (restrictedHints.some((h) => classAndAttrs.includes(h))) {
    return true;
  }

  return false;
}

/** True when element participates in layout (may be below the fold). */
export function isInRenderedDocument(el: Element): boolean {
  if (isIntentionallyHidden(el)) return false;
  if (!(el instanceof HTMLElement)) return false;

  // Detached nodes
  if (!el.isConnected) return false;

  // Template / script contents
  if (el.closest('template, script, style, noscript')) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;

  return true;
}

export function closestVisible(el: Element | null, selector: string): Element | null {
  let current: Element | null = el;
  while (current) {
    if (current.matches(selector) && isInRenderedDocument(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}
