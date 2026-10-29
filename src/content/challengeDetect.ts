/**
 * Detect Cloudflare / bot-check interstitial pages.
 * We never bypass challenges — only wait or pause for the user.
 */

export function isChallengeInterstitial(doc: Document = document): boolean {
  const title = (doc.title ?? '').toLowerCase();
  if (
    /just a moment|attention required|checking your browser|verify you are human|security check/.test(
      title
    )
  ) {
    return true;
  }

  if (
    doc.querySelector(
      '#challenge-running, #cf-challenge-running, #challenge-form, .cf-turnstile, iframe[src*="challenges.cloudflare"], iframe[src*="turnstile"]'
    )
  ) {
    return true;
  }

  const snippet = (doc.body?.innerText ?? '').slice(0, 1200).toLowerCase();
  if (
    /checking your browser before accessing|verify you are human|enable javascript and cookies|cf-browser-verification|attention required/.test(
      snippet
    )
  ) {
    // Avoid false positives on normal pages that mention cookies once
    if (!doc.querySelector('a[href*="/carriers/"]') && !/\bMC[\s\-]?\d/i.test(snippet)) {
      return true;
    }
  }

  return false;
}

export function getPageReadyState(doc: Document = document): {
  challenge: boolean;
  url: string;
  title: string;
  carrierLinkCount: number;
} {
  return {
    challenge: isChallengeInterstitial(doc),
    url: doc.location?.href ?? '',
    title: doc.title ?? '',
    carrierLinkCount: doc.querySelectorAll('a[href*="/carriers/"]').length,
  };
}
