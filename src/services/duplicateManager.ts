import type { CarrierRecord, CompletenessLevel, SearchMatch } from '../types/carrier';
import type { PartialCarrierCard } from '../types/job';
import { buildCarrierKey } from '../utils/identifierParser';

export interface MergeResult {
  record: CarrierRecord;
  isNew: boolean;
  skippedAsDuplicate: boolean;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (v && v.trim()) set.add(v.trim());
  }
  return [...set];
}

function computeCompleteness(r: Partial<CarrierRecord>): CompletenessLevel {
  let score = 0;
  if (r.companyName) score += 1;
  if (r.usdot) score += 2;
  if (r.mcNumbers && r.mcNumbers.length) score += 2;
  if (r.profileUrl) score += 1;
  if (r.websiteUrl) score += 1;
  if (r.authorityStatus) score += 1;
  if (r.powerUnits != null) score += 1;
  if (r.truckTypes && r.truckTypes.length) score += 1;
  if (r.businessAddress || r.city) score += 1;
  if (r.safetyRating) score += 1;
  if (score <= 3) return 'minimal';
  if (score <= 6) return 'partial';
  if (score <= 9) return 'substantial';
  return 'rich';
}

export function cardToSearchMatch(
  card: PartialCarrierCard,
  equipmentType: string | null,
  searchState: string | null,
  searchCity: string | null
): SearchMatch {
  return {
    equipmentType,
    searchState,
    searchCity,
    sourceUrl: card.sourceUrl,
    pageIdentifier: card.pageIdentifier,
    capturedAt: new Date().toISOString(),
    sponsored: card.isSponsored,
  };
}

export function createCarrierFromCard(
  card: PartialCarrierCard,
  equipmentType: string | null,
  searchState: string | null,
  searchCity: string | null
): CarrierRecord {
  const now = new Date().toISOString();
  const id = buildCarrierKey(card.usdot, card.mcNumbers, card.companyName, card.profileUrl);
  const match = cardToSearchMatch(card, equipmentType, searchState, searchCity);

  const record: CarrierRecord = {
    id,
    companyName: card.companyName,
    usdot: card.usdot,
    mcNumbers: [...card.mcNumbers],
    ffNumbers: [...card.ffNumbers],
    profileUrl: card.profileUrl,
    websiteUrl: card.websiteUrl,
    city: card.city,
    businessState: card.businessState,
    zipCode: card.zipCode,
    businessAddress: card.businessAddress,
    classification: card.classification,
    operationType: card.operationType,
    description: null,
    truckTypes: [...card.truckTypes],
    freightCategories: [...card.freightCategories],
    shipmentTypes: [...card.shipmentTypes],
    specializedServices: [...card.specializedServices],
    powerUnits: card.powerUnits,
    fleet: {},
    mcs150Mileage: null,
    mcs150Year: null,
    authorityStatus: card.authorityStatus,
    authorityStartDate: card.authorityStartDate,
    freightForwarderStatus: null,
    cargoAuthorization: [],
    safetyRating: card.safetyRating,
    insurance: card.insuranceLimit
      ? [{ policyLimit: card.insuranceLimit }]
      : [],
    inspectionSummary: null,
    violationSummaries: [],
    overallRating: card.overallRating,
    reviewCount: card.reviewCount,
    ratingCategories: {},
    isSponsored: card.isSponsored,
    isBroker: card.isBroker,
    profileStatus: 'not_visited',
    completeness: 'minimal',
    searchMatches: [match],
    matchedEquipmentTypes: equipmentType ? [equipmentType] : [],
    matchedSearchStates: searchState ? [searchState] : [],
    firstCapturedAt: now,
    lastCapturedAt: now,
    sourceUrls: [card.sourceUrl],
  };
  record.completeness = computeCompleteness(record);
  return record;
}

/**
 * Merge a newly extracted card into an existing entity.
 * Never overwrites search-filter state with business state (or vice versa).
 * Preserves every equipment category in which the carrier was found.
 */
export function mergeCarrier(
  existing: CarrierRecord,
  incoming: CarrierRecord
): MergeResult {
  // Guard: do not merge unrelated businesses that only share a similar name
  // without shared USDOT or overlapping MC.
  if (
    existing.usdot &&
    incoming.usdot &&
    existing.usdot !== incoming.usdot
  ) {
    return { record: incoming, isNew: true, skippedAsDuplicate: false };
  }

  const mcOverlap =
    existing.mcNumbers.some((m) => incoming.mcNumbers.includes(m)) ||
    (existing.usdot && incoming.usdot && existing.usdot === incoming.usdot);

  if (
    !mcOverlap &&
    existing.companyName.toLowerCase() === incoming.companyName.toLowerCase() &&
    !existing.usdot &&
    !incoming.usdot &&
    existing.mcNumbers.length === 0 &&
    incoming.mcNumbers.length === 0
  ) {
    // Name-only collision without identifiers — keep separate if profile URLs differ
    if (
      existing.profileUrl &&
      incoming.profileUrl &&
      existing.profileUrl !== incoming.profileUrl
    ) {
      return { record: incoming, isNew: true, skippedAsDuplicate: false };
    }
  }

  const merged: CarrierRecord = {
    ...existing,
    companyName: existing.companyName || incoming.companyName,
    usdot: existing.usdot || incoming.usdot,
    mcNumbers: uniqueStrings([...existing.mcNumbers, ...incoming.mcNumbers]),
    ffNumbers: uniqueStrings([...existing.ffNumbers, ...incoming.ffNumbers]),
    profileUrl: existing.profileUrl || incoming.profileUrl,
    websiteUrl: existing.websiteUrl || incoming.websiteUrl,
    city: existing.city || incoming.city,
    businessState: existing.businessState || incoming.businessState,
    zipCode: existing.zipCode || incoming.zipCode,
    businessAddress: existing.businessAddress || incoming.businessAddress,
    classification: existing.classification || incoming.classification,
    operationType: existing.operationType || incoming.operationType,
    description: existing.description || incoming.description,
    truckTypes: uniqueStrings([...existing.truckTypes, ...incoming.truckTypes]),
    freightCategories: uniqueStrings([
      ...existing.freightCategories,
      ...incoming.freightCategories,
    ]),
    shipmentTypes: uniqueStrings([
      ...existing.shipmentTypes,
      ...incoming.shipmentTypes,
    ]),
    specializedServices: uniqueStrings([
      ...existing.specializedServices,
      ...incoming.specializedServices,
    ]),
    powerUnits: existing.powerUnits ?? incoming.powerUnits,
    fleet: {
      ownedTractors: existing.fleet.ownedTractors ?? incoming.fleet.ownedTractors,
      leasedTractors: existing.fleet.leasedTractors ?? incoming.fleet.leasedTractors,
      ownedTrucks: existing.fleet.ownedTrucks ?? incoming.fleet.ownedTrucks,
      leasedTrucks: existing.fleet.leasedTrucks ?? incoming.fleet.leasedTrucks,
      ownedTrailers: existing.fleet.ownedTrailers ?? incoming.fleet.ownedTrailers,
      leasedTrailers: existing.fleet.leasedTrailers ?? incoming.fleet.leasedTrailers,
    },
    mcs150Mileage: existing.mcs150Mileage ?? incoming.mcs150Mileage,
    mcs150Year: existing.mcs150Year ?? incoming.mcs150Year,
    authorityStatus: existing.authorityStatus || incoming.authorityStatus,
    authorityStartDate: existing.authorityStartDate || incoming.authorityStartDate,
    freightForwarderStatus:
      existing.freightForwarderStatus || incoming.freightForwarderStatus,
    cargoAuthorization: uniqueStrings([
      ...existing.cargoAuthorization,
      ...incoming.cargoAuthorization,
    ]),
    safetyRating: existing.safetyRating || incoming.safetyRating,
    insurance:
      existing.insurance.length > 0 ? existing.insurance : incoming.insurance,
    inspectionSummary: existing.inspectionSummary || incoming.inspectionSummary,
    violationSummaries:
      existing.violationSummaries.length > 0
        ? existing.violationSummaries
        : incoming.violationSummaries,
    overallRating: existing.overallRating ?? incoming.overallRating,
    reviewCount: existing.reviewCount ?? incoming.reviewCount,
    ratingCategories: {
      ...incoming.ratingCategories,
      ...existing.ratingCategories,
    },
    isSponsored: existing.isSponsored || incoming.isSponsored,
    isBroker: existing.isBroker || incoming.isBroker,
    profileStatus:
      existing.profileStatus === 'completed'
        ? 'completed'
        : incoming.profileStatus !== 'not_visited'
          ? incoming.profileStatus
          : existing.profileStatus,
    searchMatches: [...existing.searchMatches, ...incoming.searchMatches],
    matchedEquipmentTypes: uniqueStrings([
      ...existing.matchedEquipmentTypes,
      ...incoming.matchedEquipmentTypes,
    ]),
    matchedSearchStates: uniqueStrings([
      ...existing.matchedSearchStates,
      ...incoming.matchedSearchStates,
    ]),
    firstCapturedAt: existing.firstCapturedAt,
    lastCapturedAt: incoming.lastCapturedAt,
    sourceUrls: uniqueStrings([...existing.sourceUrls, ...incoming.sourceUrls]),
    completeness: 'partial',
  };

  merged.completeness = computeCompleteness(merged);

  // Same identifiers already present and no new fields — count as duplicate skip signal
  const noNewIds =
    existing.usdot === merged.usdot &&
    existing.mcNumbers.length === merged.mcNumbers.length &&
    existing.matchedEquipmentTypes.length === merged.matchedEquipmentTypes.length &&
    existing.sourceUrls.length === merged.sourceUrls.length;

  return {
    record: merged,
    isNew: false,
    skippedAsDuplicate: noNewIds,
  };
}

export class DuplicateManager {
  private byKey = new Map<string, CarrierRecord>();

  load(records: CarrierRecord[]): void {
    this.byKey.clear();
    for (const r of records) {
      this.byKey.set(r.id, r);
      if (r.usdot) this.byKey.set(`usdot:${r.usdot}`, r);
      for (const mc of r.mcNumbers) {
        this.byKey.set(`mc:${mc}`, r);
      }
    }
  }

  ingest(
    card: PartialCarrierCard,
    equipmentType: string | null,
    searchState: string | null,
    searchCity: string | null
  ): MergeResult {
    const incoming = createCarrierFromCard(
      card,
      equipmentType,
      searchState,
      searchCity
    );

    let existing: CarrierRecord | undefined;
    if (incoming.usdot) {
      existing = this.byKey.get(`usdot:${incoming.usdot}`);
    }
    if (!existing) {
      for (const mc of incoming.mcNumbers) {
        existing = this.byKey.get(`mc:${mc}`);
        if (existing) break;
      }
    }
    if (!existing) {
      existing = this.byKey.get(incoming.id);
    }

    if (!existing) {
      this.index(incoming);
      return { record: incoming, isNew: true, skippedAsDuplicate: false };
    }

    const result = mergeCarrier(existing, incoming);
    if (!result.isNew) {
      this.index(result.record);
    } else {
      this.index(result.record);
    }
    return result;
  }

  private index(record: CarrierRecord): void {
    this.byKey.set(record.id, record);
    if (record.usdot) this.byKey.set(`usdot:${record.usdot}`, record);
    for (const mc of record.mcNumbers) {
      this.byKey.set(`mc:${mc}`, record);
    }
  }

  getAll(): CarrierRecord[] {
    const seen = new Set<string>();
    const out: CarrierRecord[] = [];
    for (const r of this.byKey.values()) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  }
}
