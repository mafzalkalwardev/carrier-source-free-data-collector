import { describe, expect, it } from 'vitest';
import { buildMcOnlyCsv, buildCompleteCsv, buildXlsxBlob } from '../src/services/exportService';
import type { CarrierRecord } from '../src/types/carrier';

function sample(): CarrierRecord {
  return {
    id: 'usdot:1',
    companyName: 'Test Carrier',
    usdot: '1',
    mcNumbers: ['MC050609', 'MC203287'],
    ffNumbers: [],
    profileUrl: null,
    websiteUrl: null,
    city: 'Houston',
    businessState: 'TX',
    zipCode: null,
    businessAddress: null,
    classification: 'Carrier',
    operationType: 'Interstate',
    description: null,
    truckTypes: ['Box Truck'],
    freightCategories: [],
    shipmentTypes: [],
    specializedServices: [],
    powerUnits: 10,
    fleet: {},
    mcs150Mileage: null,
    mcs150Year: null,
    authorityStatus: 'Active',
    authorityStartDate: null,
    freightForwarderStatus: null,
    cargoAuthorization: [],
    safetyRating: null,
    insurance: [],
    inspectionSummary: null,
    violationSummaries: [],
    overallRating: 5,
    reviewCount: 2,
    ratingCategories: {},
    isSponsored: false,
    isBroker: false,
    profileStatus: 'not_visited',
    completeness: 'partial',
    searchMatches: [],
    matchedEquipmentTypes: ['Box Truck'],
    matchedSearchStates: ['Texas'],
    firstCapturedAt: '2026-01-01T00:00:00.000Z',
    lastCapturedAt: '2026-01-01T00:00:00.000Z',
    sourceUrls: ['https://www.carriersource.io/trucking-companies'],
  };
}

describe('exportService', () => {
  it('exports unique MC numbers preserving leading zeros', () => {
    const csv = buildMcOnlyCsv([sample()]);
    expect(csv).toContain('MC050609');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    // Dedup same MC across two records
    const dup = sample();
    const csv2 = buildMcOnlyCsv([sample(), dup]);
    const lines = csv2.trim().split(/\r?\n/);
    expect(lines.length).toBe(3); // header + 2 unique MCs
  });

  it('guards formula injection', () => {
    const evil = sample();
    evil.companyName = '=CMD()';
    const csv = buildCompleteCsv([evil]);
    expect(csv).toContain("'=CMD()");
  });

  it('builds xlsx blob', () => {
    const blob = buildXlsxBlob([sample()]);
    expect(blob.size).toBeGreaterThan(100);
  });

  it('never includes email or phone columns', () => {
    const csv = buildCompleteCsv([sample()]);
    expect(csv.toLowerCase()).not.toContain('email');
    expect(csv.toLowerCase()).not.toContain('phone');
  });
});
