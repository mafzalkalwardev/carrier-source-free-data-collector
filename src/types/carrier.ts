/** Profile enrichment status for optional free-profile visits. */
export type ProfileStatus =
  | 'not_visited'
  | 'completed'
  | 'unavailable'
  | 'permission_restricted'
  | 'error';

/** Record completeness heuristic based on filled identifier/business fields. */
export type CompletenessLevel = 'minimal' | 'partial' | 'substantial' | 'rich';

export interface RatingCategories {
  qualityOfEquipment?: number | null;
  communication?: number | null;
  timeliness?: number | null;
}

export interface FleetBreakdown {
  ownedTractors?: number | null;
  leasedTractors?: number | null;
  ownedTrucks?: number | null;
  leasedTrucks?: number | null;
  ownedTrailers?: number | null;
  leasedTrailers?: number | null;
}

export interface InspectionSummary {
  driverInspections?: number | null;
  driverOosInspections?: number | null;
  driverOosPercentage?: number | null;
  vehicleInspections?: number | null;
  vehicleOosInspections?: number | null;
  vehicleOosPercentage?: number | null;
}

export interface ViolationSummary {
  type: string;
  total?: number | null;
  severe?: number | null;
  outOfService?: number | null;
  measure?: number | null;
  percentile?: number | null;
}

export interface InsuranceInfo {
  insuranceType?: string | null;
  companyName?: string | null;
  policyLimit?: string | null;
  effectiveDate?: string | null;
}

export interface SearchMatch {
  equipmentType?: string | null;
  searchState?: string | null;
  searchCity?: string | null;
  sourceUrl: string;
  pageIdentifier?: string | null;
  capturedAt: string;
  sponsored?: boolean;
}

/**
 * Normalized carrier entity collected from freely visible DOM only.
 * Contact fields (phone, email, personal names) are intentionally absent.
 */
export interface CarrierRecord {
  id: string;
  companyName: string;
  usdot: string | null;
  mcNumbers: string[];
  ffNumbers: string[];
  profileUrl: string | null;
  websiteUrl: string | null;
  city: string | null;
  /** Carrier's displayed business state (not the search filter state). */
  businessState: string | null;
  zipCode: string | null;
  businessAddress: string | null;
  classification: string | null;
  operationType: string | null;
  description: string | null;
  truckTypes: string[];
  freightCategories: string[];
  shipmentTypes: string[];
  specializedServices: string[];
  powerUnits: number | null;
  fleet: FleetBreakdown;
  mcs150Mileage: number | null;
  mcs150Year: number | null;
  authorityStatus: string | null;
  authorityStartDate: string | null;
  freightForwarderStatus: string | null;
  cargoAuthorization: string[];
  safetyRating: string | null;
  insurance: InsuranceInfo[];
  inspectionSummary: InspectionSummary | null;
  violationSummaries: ViolationSummary[];
  overallRating: number | null;
  reviewCount: number | null;
  ratingCategories: RatingCategories;
  isSponsored: boolean;
  isBroker: boolean;
  profileStatus: ProfileStatus;
  completeness: CompletenessLevel;
  searchMatches: SearchMatch[];
  /** Search filter equipment types under which this carrier was found. */
  matchedEquipmentTypes: string[];
  /** Search filter states under which this carrier was found. */
  matchedSearchStates: string[];
  firstCapturedAt: string;
  lastCapturedAt: string;
  sourceUrls: string[];
}

export interface McAuthorityRecord {
  mcNumber: string;
  usdot: string | null;
  companyName: string;
  carrierId: string;
  authorityStatus: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CapturedPageRecord {
  id: string;
  url: string;
  pageFingerprint: string;
  carrierCount: number;
  capturedAt: string;
  jobId: string | null;
}

export const TRUCK_TYPES = [
  'Box Truck',
  'Dry Van',
  'Reefer',
  'Flatbed',
  'Power Only',
  'Hot Shot',
  'Step Deck',
  'Sprinter Van',
  'Auto Carrier',
  'Container',
  'Conestoga',
  'Lowboy',
  'Tanker',
  'Dump Trailer',
  'Hopper Bottom',
  'Oversized',
  'Pneumatic',
  'Removable Gooseneck',
  'B-Train',
  'Stretch',
  'Multi-Axle',
  'Pickup',
  'Belt',
  'Walking Floor',
] as const;

export type TruckType = (typeof TRUCK_TYPES)[number];

export interface USState {
  name: string;
  abbreviation: string;
}

export const US_STATES: USState[] = [
  { name: 'Alabama', abbreviation: 'AL' },
  { name: 'Alaska', abbreviation: 'AK' },
  { name: 'Arizona', abbreviation: 'AZ' },
  { name: 'Arkansas', abbreviation: 'AR' },
  { name: 'California', abbreviation: 'CA' },
  { name: 'Colorado', abbreviation: 'CO' },
  { name: 'Connecticut', abbreviation: 'CT' },
  { name: 'Delaware', abbreviation: 'DE' },
  { name: 'Florida', abbreviation: 'FL' },
  { name: 'Georgia', abbreviation: 'GA' },
  { name: 'Hawaii', abbreviation: 'HI' },
  { name: 'Idaho', abbreviation: 'ID' },
  { name: 'Illinois', abbreviation: 'IL' },
  { name: 'Indiana', abbreviation: 'IN' },
  { name: 'Iowa', abbreviation: 'IA' },
  { name: 'Kansas', abbreviation: 'KS' },
  { name: 'Kentucky', abbreviation: 'KY' },
  { name: 'Louisiana', abbreviation: 'LA' },
  { name: 'Maine', abbreviation: 'ME' },
  { name: 'Maryland', abbreviation: 'MD' },
  { name: 'Massachusetts', abbreviation: 'MA' },
  { name: 'Michigan', abbreviation: 'MI' },
  { name: 'Minnesota', abbreviation: 'MN' },
  { name: 'Mississippi', abbreviation: 'MS' },
  { name: 'Missouri', abbreviation: 'MO' },
  { name: 'Montana', abbreviation: 'MT' },
  { name: 'Nebraska', abbreviation: 'NE' },
  { name: 'Nevada', abbreviation: 'NV' },
  { name: 'New Hampshire', abbreviation: 'NH' },
  { name: 'New Jersey', abbreviation: 'NJ' },
  { name: 'New Mexico', abbreviation: 'NM' },
  { name: 'New York', abbreviation: 'NY' },
  { name: 'North Carolina', abbreviation: 'NC' },
  { name: 'North Dakota', abbreviation: 'ND' },
  { name: 'Ohio', abbreviation: 'OH' },
  { name: 'Oklahoma', abbreviation: 'OK' },
  { name: 'Oregon', abbreviation: 'OR' },
  { name: 'Pennsylvania', abbreviation: 'PA' },
  { name: 'Rhode Island', abbreviation: 'RI' },
  { name: 'South Carolina', abbreviation: 'SC' },
  { name: 'South Dakota', abbreviation: 'SD' },
  { name: 'Tennessee', abbreviation: 'TN' },
  { name: 'Texas', abbreviation: 'TX' },
  { name: 'Utah', abbreviation: 'UT' },
  { name: 'Vermont', abbreviation: 'VT' },
  { name: 'Virginia', abbreviation: 'VA' },
  { name: 'Washington', abbreviation: 'WA' },
  { name: 'West Virginia', abbreviation: 'WV' },
  { name: 'Wisconsin', abbreviation: 'WI' },
  { name: 'Wyoming', abbreviation: 'WY' },
  { name: 'District of Columbia', abbreviation: 'DC' },
];
