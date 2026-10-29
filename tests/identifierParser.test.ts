import { describe, expect, it } from 'vitest';
import {
  extractMcNumbers,
  extractFfNumbers,
  extractUsdot,
  parseDocketLine,
  normalizeMc,
  buildCarrierKey,
} from '../src/utils/identifierParser';

describe('identifierParser', () => {
  it('parses MC variants and preserves leading zeros', () => {
    expect(extractMcNumbers('MC632214')).toEqual(['MC632214']);
    expect(extractMcNumbers('MC 632214')).toEqual(['MC632214']);
    expect(extractMcNumbers('MC-632214')).toEqual(['MC632214']);
    expect(extractMcNumbers('MC050609')).toEqual(['MC050609']);
  });

  it('extracts multiple MCs and ignores FF dockets', () => {
    const text = 'Docket: FF012054, MC203287, MC1742035';
    const { mcNumbers, ffNumbers } = parseDocketLine(text);
    expect(mcNumbers).toEqual(['MC203287', 'MC1742035']);
    expect(ffNumbers).toEqual(['FF012054']);
    expect(extractFfNumbers(text)).toEqual(['FF012054']);
  });

  it('extracts USDOT as string', () => {
    expect(extractUsdot('USDOT 325836')).toBe('325836');
    expect(extractUsdot('USDOT: 1725083')).toBe('1725083');
  });

  it('normalizeMc preserves digit run', () => {
    expect(normalizeMc('MC050609')).toBe('MC050609');
    expect(normalizeMc('MC-050609')).toBe('MC050609');
  });

  it('builds stable keys preferring USDOT', () => {
    expect(buildCarrierKey('325836', ['MC203287'], 'Tri Star', null)).toBe(
      'usdot:325836'
    );
    expect(buildCarrierKey(null, ['MC203287', 'MC1742035'], 'Tri Star', null)).toBe(
      'mc:MC1742035,MC203287'
    );
  });
});
