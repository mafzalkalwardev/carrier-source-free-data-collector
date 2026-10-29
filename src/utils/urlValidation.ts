const CARRIER_SOURCE_HOSTS = new Set(['www.carriersource.io', 'carriersource.io']);

export function isCarrierSourceUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return CARRIER_SOURCE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isResultsPage(url: string | null | undefined): boolean {
  if (!isCarrierSourceUrl(url)) return false;
  try {
    const path = new URL(url!).pathname.toLowerCase();
    return (
      path.includes('/trucking-companies') ||
      path.includes('/search') ||
      path === '/'
    );
  } catch {
    return false;
  }
}

export function isProfilePage(url: string | null | undefined): boolean {
  if (!isCarrierSourceUrl(url)) return false;
  try {
    const path = new URL(url!).pathname.toLowerCase();
    return /\/carriers\/[^/]+\/?$/.test(path);
  } catch {
    return false;
  }
}

export function normalizeCarrierSourceUrl(url: string): string | null {
  if (!isCarrierSourceUrl(url)) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Resolve a relative CarrierSource path to absolute. */
export function resolveCarrierSourceHref(href: string | null, baseUrl: string): string | null {
  if (!href) return null;
  // Skip contact / quote / auth actions
  const lower = href.toLowerCase();
  if (
    lower.includes('contact') ||
    lower.includes('quote') ||
    lower.includes('sign-in') ||
    lower.includes('signin') ||
    lower.includes('mailto:') ||
    lower.includes('tel:')
  ) {
    return null;
  }
  try {
    const absolute = new URL(href, baseUrl).toString();
    return isCarrierSourceUrl(absolute) || !absolute.includes('carriersource.io')
      ? absolute
      : null;
  } catch {
    return null;
  }
}

/**
 * Infer search equipment / state from known public URL patterns only.
 * Does not invent undocumented routes — returns null when uncertain.
 */
export function inferSearchContextFromUrl(url: string): {
  equipmentType: string | null;
  searchState: string | null;
  searchCity: string | null;
} {
  if (!isCarrierSourceUrl(url)) {
    return { equipmentType: null, searchState: null, searchCity: null };
  }

  try {
    const path = new URL(url).pathname.toLowerCase();
    // Observed: /trucking-companies/box-truck/united-states/texas
    // Observed: /trucking-companies/united-states/arizona
    // Observed: /trucking-companies/united-states/texas/houston
    const parts = path.split('/').filter(Boolean);

    let equipmentType: string | null = null;
    let searchState: string | null = null;
    let searchCity: string | null = null;

    const tcIdx = parts.indexOf('trucking-companies');
    if (tcIdx === -1) return { equipmentType, searchState, searchCity };

    const rest = parts.slice(tcIdx + 1);
    const usIdx = rest.indexOf('united-states');

    if (usIdx === -1) return { equipmentType, searchState, searchCity };

    if (usIdx > 0) {
      equipmentType = slugToTitle(rest[0]);
    }

    if (rest.length > usIdx + 1) {
      searchState = slugToTitle(rest[usIdx + 1]);
    }
    if (rest.length > usIdx + 2) {
      searchCity = slugToTitle(rest[usIdx + 2]);
    }

    return { equipmentType, searchState, searchCity };
  } catch {
    return { equipmentType: null, searchState: null, searchCity: null };
  }
}

function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function isExternalWebsite(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return !CARRIER_SOURCE_HOSTS.has(host);
  } catch {
    return false;
  }
}
