import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { extractProfileDetails } from '../src/content/profileExtractor';

function loadFixture(name: string) {
  const html = readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
  document.documentElement.innerHTML = html;
}

describe('profileExtractor', () => {
  it('extracts profile with website and dual MC numbers', () => {
    loadFixture('profile-with-website.html');
    const profile = extractProfileDetails(document);
    expect(profile).toBeTruthy();
    expect(profile!.companyName).toContain('Tri Star');
    expect(profile!.usdot).toBe('325836');
    expect(profile!.mcNumbers).toEqual(
      expect.arrayContaining(['MC203287', 'MC1742035'])
    );
    expect(profile!.ffNumbers).toContain('FF012054');
    expect(profile!.websiteUrl).toMatch(/^https:\/\/tristarfreightsys\.com\/?$/);
    expect(profile!.city).toBe('Houston');
    expect(profile!.businessState).toBe('TX');
    expect(profile!.fleet.ownedTractors).toBe(51);
    expect(profile!.fleet.leasedTractors).toBe(88);
    expect(profile!.mcs150Mileage).toBe(7173255);
    expect(profile!.mcs150Year).toBe(2025);
    expect(profile!.truckTypes).toEqual(
      expect.arrayContaining(['Box Truck', 'Dry Van'])
    );
    // Must not capture review body or email/phone
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toMatch(/secret@example\.com/);
    expect(serialized).not.toMatch(/555-0100/);
    expect(serialized).not.toMatch(/DO NOT COLLECT/);
  });

  it('handles profile without website link', () => {
    loadFixture('profile-without-website.html');
    const profile = extractProfileDetails(document);
    expect(profile!.websiteUrl).toBeNull();
    expect(profile!.mcNumbers).toContain('MC654321');
    expect(profile!.usdot).toBe('1234567');
  });
});
