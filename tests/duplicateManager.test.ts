import { describe, expect, it } from 'vitest';
import { DuplicateManager } from '../src/services/duplicateManager';
import type { PartialCarrierCard } from '../src/types/job';

function card(partial: Partial<PartialCarrierCard>): PartialCarrierCard {
  return {
    companyName: 'Test',
    usdot: null,
    mcNumbers: [],
    ffNumbers: [],
    profileUrl: null,
    websiteUrl: null,
    city: null,
    businessState: null,
    zipCode: null,
    businessAddress: null,
    classification: null,
    operationType: null,
    truckTypes: [],
    freightCategories: [],
    shipmentTypes: [],
    specializedServices: [],
    powerUnits: null,
    authorityStatus: null,
    authorityStartDate: null,
    safetyRating: null,
    insuranceLimit: null,
    overallRating: null,
    reviewCount: null,
    isSponsored: false,
    isBroker: false,
    sourceUrl: 'https://www.carriersource.io/trucking-companies',
    pageIdentifier: null,
    ...partial,
  };
}

describe('DuplicateManager', () => {
  it('merges sponsored duplicate by USDOT and keeps equipment matches', () => {
    const mgr = new DuplicateManager();
    const a = mgr.ingest(
      card({
        companyName: 'TCI Transportation',
        usdot: '1725083',
        mcNumbers: ['MC632214'],
        isSponsored: true,
      }),
      'Box Truck',
      'Texas',
      null
    );
    expect(a.isNew).toBe(true);

    const b = mgr.ingest(
      card({
        companyName: 'TCI Transportation',
        usdot: '1725083',
        mcNumbers: ['MC632214'],
        isSponsored: false,
      }),
      'Dry Van',
      'Arizona',
      null
    );
    expect(b.isNew).toBe(false);
    expect(b.record.matchedEquipmentTypes).toEqual(
      expect.arrayContaining(['Box Truck', 'Dry Van'])
    );
    expect(b.record.matchedSearchStates).toEqual(
      expect.arrayContaining(['Texas', 'Arizona'])
    );
    expect(mgr.getAll()).toHaveLength(1);
  });

  it('keeps both MC numbers on one entity', () => {
    const mgr = new DuplicateManager();
    mgr.ingest(
      card({
        companyName: 'Tri Star',
        usdot: '325836',
        mcNumbers: ['MC203287', 'MC1742035'],
      }),
      'Box Truck',
      'Texas',
      null
    );
    const all = mgr.getAll();
    expect(all[0].mcNumbers).toHaveLength(2);
  });

  it('does not merge different USDOTs with similar names', () => {
    const mgr = new DuplicateManager();
    mgr.ingest(
      card({ companyName: 'Acme Trucking', usdot: '1', mcNumbers: ['MC1'] }),
      null,
      null,
      null
    );
    const second = mgr.ingest(
      card({ companyName: 'Acme Trucking', usdot: '2', mcNumbers: ['MC2'] }),
      null,
      null,
      null
    );
    expect(second.isNew).toBe(true);
    expect(mgr.getAll()).toHaveLength(2);
  });
});
