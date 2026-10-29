/**
 * MC / USDOT / FF identifier parsing.
 * Prefer scoped element text; regex is a fallback within that scope only.
 */

const MC_PATTERN = /\bMC[\s\-]?0*(\d{4,8})\b/gi;
const USDOT_PATTERN = /\b(?:USDOT|DOT|US\s*DOT)[\s\-:#]*(\d{4,9})\b/gi;
const FF_PATTERN = /\bFF[\s\-]?0*(\d{4,8})\b/gi;

/** Normalize MC to string preserving significant leading zeros from source digits. */
export function normalizeMc(raw: string): string | null {
  const match = raw.match(/MC[\s\-]?0*(\d{4,8})/i);
  if (!match) return null;
  // Preserve original digit run after MC prefix (including leading zeros in the digit portion as shown).
  const digits = raw.match(/MC[\s\-]?(\d+)/i);
  if (!digits) return null;
  return `MC${digits[1]}`;
}

/** Extract MC numbers from scoped text. Does not treat FF dockets as MC. */
export function extractMcNumbers(text: string): string[] {
  if (!text) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  // Strip FF tokens first so FF012054 is never misread as MC.
  const withoutFf = text.replace(FF_PATTERN, ' ');
  let match: RegExpExecArray | null;
  const re = new RegExp(MC_PATTERN.source, 'gi');
  while ((match = re.exec(withoutFf)) !== null) {
    const full = match[0];
    const digits = full.match(/(\d+)/);
    if (!digits) continue;
    const normalized = `MC${digits[1]}`;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push(normalized);
    }
  }
  return results;
}

export function extractFfNumbers(text: string): string[] {
  if (!text) return [];
  const results: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(FF_PATTERN.source, 'gi');
  while ((match = re.exec(text)) !== null) {
    const digits = match[0].match(/(\d+)/);
    if (!digits) continue;
    const normalized = `FF${digits[1]}`;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push(normalized);
    }
  }
  return results;
}

export function extractUsdot(text: string): string | null {
  if (!text) return null;
  const match = text.match(USDOT_PATTERN);
  if (!match) return null;
  const digits = match[0].match(/(\d+)/);
  return digits ? digits[1] : null;
}

/** Parse a docket line such as "FF012054, MC203287, MC1742035". */
export function parseDocketLine(text: string): {
  mcNumbers: string[];
  ffNumbers: string[];
} {
  return {
    mcNumbers: extractMcNumbers(text),
    ffNumbers: extractFfNumbers(text),
  };
}

/** Build a stable entity key: prefer USDOT, else sorted MC set, else name+profile. */
export function buildCarrierKey(
  usdot: string | null,
  mcNumbers: string[],
  companyName: string,
  profileUrl: string | null
): string {
  if (usdot) return `usdot:${usdot}`;
  if (mcNumbers.length > 0) {
    return `mc:${[...mcNumbers].sort().join(',')}`;
  }
  if (profileUrl) return `profile:${profileUrl}`;
  return `name:${companyName.toLowerCase().trim()}`;
}
