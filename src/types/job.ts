export type JobMode =
  | 'capture_current'
  | 'capture_as_browse'
  | 'collect_all_pages'
  | 'enrich_profiles'
  | 'process_queue';

export type JobStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'stopped'
  | 'partially_completed'
  | 'blocked'
  | 'error';

export interface AuthorizationState {
  /** User acknowledges CarrierSource ToS and personal responsibility. */
  tosAcknowledged: boolean;
  tosAcknowledgedAt: string | null;
  /** Written permission covers automated page traversal. */
  automatedTraversalAuthorized: boolean;
  automatedTraversalAuthorizedAt: string | null;
  /** Written permission covers visiting free carrier profile pages. */
  profileEnrichmentAuthorized: boolean;
  profileEnrichmentAuthorizedAt: string | null;
  authorizationNotes: string;
}

export interface SearchContext {
  url: string;
  equipmentTypes: string[];
  searchState: string | null;
  searchCity: string | null;
  carriersOnly: boolean;
  activeAuthorityOnly: boolean;
  detectedFilters: string[];
  pageTitle: string | null;
}

export interface SearchQueueItem {
  id: string;
  url: string;
  label: string;
  equipmentType: string | null;
  searchState: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'error';
  errorMessage?: string;
}

export interface CollectionJob {
  id: string;
  mode: JobMode;
  status: JobStatus;
  startedAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
  includeProfiles: boolean;
  searchContext: SearchContext | null;
  pagesCaptured: number;
  carriersFound: number;
  carriersSaved: number;
  duplicatesSkipped: number;
  profilesEnriched: number;
  missingFieldCount: number;
  lastPageFingerprint: string | null;
  lastUrl: string | null;
  errorMessage: string | null;
  statusDetail: string | null;
  queue: SearchQueueItem[];
  checkpoint: JobCheckpoint | null;
}

export interface JobCheckpoint {
  lastUrl: string;
  lastPageFingerprint: string;
  processedProfileUrls: string[];
  queueIndex: number;
  savedAt: string;
}

export interface CollectionStats {
  searchPagesCaptured: number;
  carrierRecords: number;
  uniqueMcNumbers: number;
  uniqueUsdotNumbers: number;
  duplicatesSkipped: number;
  profilesEnriched: number;
  missingInformationCount: number;
}

export interface TabInfo {
  tabId: number | null;
  url: string | null;
  title: string | null;
  isCarrierSource: boolean;
  isResultsPage: boolean;
  isProfilePage: boolean;
}

export type ContentMessageType =
  | 'PING'
  | 'GET_PAGE_CONTEXT'
  | 'EXTRACT_CARDS'
  | 'EXTRACT_PROFILE'
  | 'START_BROWSE_OBSERVER'
  | 'STOP_BROWSE_OBSERVER'
  | 'DETECT_PAGINATION'
  | 'CLICK_NEXT_PAGE'
  | 'WAIT_FOR_RESULTS_CHANGE';

export interface ContentRequest {
  type: ContentMessageType;
  payload?: Record<string, unknown>;
}

export interface ExtractCardsResult {
  ok: boolean;
  carriers: PartialCarrierCard[];
  pageFingerprint: string;
  searchContext: SearchContext;
  error?: string;
}

export interface PartialCarrierCard {
  companyName: string;
  usdot: string | null;
  mcNumbers: string[];
  ffNumbers: string[];
  profileUrl: string | null;
  websiteUrl: string | null;
  city: string | null;
  businessState: string | null;
  zipCode: string | null;
  businessAddress: string | null;
  classification: string | null;
  operationType: string | null;
  truckTypes: string[];
  freightCategories: string[];
  shipmentTypes: string[];
  specializedServices: string[];
  powerUnits: number | null;
  authorityStatus: string | null;
  authorityStartDate: string | null;
  safetyRating: string | null;
  insuranceLimit: string | null;
  overallRating: number | null;
  reviewCount: number | null;
  isSponsored: boolean;
  isBroker: boolean;
  sourceUrl: string;
  pageIdentifier: string | null;
}

export interface PaginationInfo {
  strategy: 'next_button' | 'load_more' | 'infinite_scroll' | 'none' | 'unknown';
  hasNext: boolean;
  nextLabel: string | null;
  disabled: boolean;
  detail: string;
}

export const DEFAULT_AUTHORIZATION: AuthorizationState = {
  tosAcknowledged: false,
  tosAcknowledgedAt: null,
  automatedTraversalAuthorized: false,
  automatedTraversalAuthorizedAt: null,
  profileEnrichmentAuthorized: false,
  profileEnrichmentAuthorizedAt: null,
  authorizationNotes: '',
};

export function createIdleJob(): CollectionJob {
  const now = new Date().toISOString();
  return {
    id: `job_${Date.now()}`,
    mode: 'capture_current',
    status: 'idle',
    startedAt: null,
    updatedAt: now,
    finishedAt: null,
    includeProfiles: false,
    searchContext: null,
    pagesCaptured: 0,
    carriersFound: 0,
    carriersSaved: 0,
    duplicatesSkipped: 0,
    profilesEnriched: 0,
    missingFieldCount: 0,
    lastPageFingerprint: null,
    lastUrl: null,
    errorMessage: null,
    statusDetail: null,
    queue: [],
    checkpoint: null,
  };
}
