import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, beforeEach } from 'vitest';
import { CarrierSourceAdapter } from '../src/content/carrierSourceAdapter';
import { extractMcNumbers } from '../src/utils/identifierParser';

function loadFixture(name: string) {
  const html = readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
  document.documentElement.innerHTML = html;
  // jsdom location is limited; adapter uses location.href for source URL
}

describe('CarrierSource results extraction', () => {
  beforeEach(() => {
    loadFixture('results-page.html');
  });

  it('extracts ordinary carrier cards without nav/footer/alternative noise', () => {
    const adapter = new CarrierSourceAdapter();
    const { carriers } = adapter.extractCards();

    expect(carriers.length).toBeGreaterThanOrEqual(10);
    const names = carriers.map((c) => c.companyName);
    expect(names).toContain('TCI Transportation');
    expect(names).toContain('Tri Star Freight System Inc');
    expect(names).not.toContain('Someone Else LLC');

    // Footer MC noise not present as a card
    expect(carriers.every((c) => c.companyName !== 'Contact support')).toBe(true);
  });

  it('keeps multiple MC numbers and ignores FF as MC', () => {
    const adapter = new CarrierSourceAdapter();
    const { carriers } = adapter.extractCards();
    const tri = carriers.find((c) => c.companyName.includes('Tri Star'));
    expect(tri).toBeTruthy();
    expect(tri!.mcNumbers).toEqual(expect.arrayContaining(['MC203287', 'MC1742035']));
    expect(tri!.mcNumbers).not.toContain('FF012054');
    expect(tri!.ffNumbers).toContain('FF012054');
    expect(tri!.usdot).toBe('325836');
  });

  it('preserves leading zeros on MC', () => {
    const adapter = new CarrierSourceAdapter();
    const { carriers } = adapter.extractCards();
    const zero = carriers.find((c) => c.companyName.includes('Leading Zero'));
    expect(zero?.mcNumbers).toContain('MC050609');
  });

  it('marks sponsored cards and finds Mercer with FF+MC', () => {
    const adapter = new CarrierSourceAdapter();
    const { carriers } = adapter.extractCards();
    const sponsored = carriers.filter((c) => c.isSponsored);
    expect(sponsored.length).toBeGreaterThanOrEqual(1);
    const mercer = carriers.find((c) => c.companyName.includes('Mercer'));
    expect(mercer?.mcNumbers).toContain('MC143059');
    expect(mercer?.ffNumbers).toContain('FF012031');
  });

  it('detects next pagination control without guessing query params', () => {
    const adapter = new CarrierSourceAdapter();
    const pagination = adapter.detectPagination();
    expect(pagination.strategy).toBe('next_button');
    expect(pagination.hasNext).toBe(true);
  });

  it('handles missing USDOT card', () => {
    const adapter = new CarrierSourceAdapter();
    const { carriers } = adapter.extractCards();
    const missing = carriers.find((c) => c.companyName.includes('Missing Usdot'));
    expect(missing?.usdot).toBeNull();
    expect(missing?.mcNumbers).toContain('MC888222');
  });

  it('does not treat contact buttons as data sources', () => {
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Request Quote/);
    // Extraction still works and MC parser on full page would include nav noise —
    // card-scoped extraction should not invent contacts
    const adapter = new CarrierSourceAdapter();
    const { carriers } = adapter.extractCards();
    for (const c of carriers) {
      expect(JSON.stringify(c)).not.toMatch(/@/);
      expect(JSON.stringify(c)).not.toMatch(/555-/);
    }
  });

  it('page fingerprint changes when cards change', () => {
    const adapter = new CarrierSourceAdapter();
    const first = adapter.extractCards().pageFingerprint;
    document.querySelector('[data-carrier="10"]')?.remove();
    const second = adapter.extractCards().pageFingerprint;
    expect(first).not.toBe(second);
  });
});

describe('MC regex scoped safety', () => {
  it('extractMcNumbers does not invent numbers from unrelated text', () => {
    expect(extractMcNumbers('Welcome to our company directory')).toEqual([]);
  });
});
