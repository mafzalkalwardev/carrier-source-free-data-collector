import { getDatabase, clearAllData } from './database';

export { clearAllData };
import type { CarrierRecord, McAuthorityRecord, CapturedPageRecord } from '../types/carrier';
import type {
  AuthorizationState,
  CollectionJob,
  CollectionStats,
  SearchQueueItem,
} from '../types/job';
import { DEFAULT_AUTHORIZATION } from '../types/job';

const SETTINGS_KEY = 'app';

export async function upsertCarriers(records: CarrierRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await getDatabase();
  const tx = db.transaction(['carriers', 'mcAuthorities'], 'readwrite');
  for (const record of records) {
    await tx.objectStore('carriers').put(record);
    for (const mc of record.mcNumbers) {
      const existing = await tx.objectStore('mcAuthorities').get(mc);
      const now = record.lastCapturedAt;
      const mcRecord: McAuthorityRecord = {
        mcNumber: mc,
        usdot: record.usdot,
        companyName: record.companyName,
        carrierId: record.id,
        authorityStatus: record.authorityStatus,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
      };
      await tx.objectStore('mcAuthorities').put(mcRecord);
    }
  }
  await tx.done;
}

export async function getAllCarriers(): Promise<CarrierRecord[]> {
  const db = await getDatabase();
  return db.getAll('carriers');
}

export async function getCarrier(id: string): Promise<CarrierRecord | undefined> {
  const db = await getDatabase();
  return db.get('carriers', id);
}

export async function getCarrierByUsdot(usdot: string): Promise<CarrierRecord | undefined> {
  const db = await getDatabase();
  return db.getFromIndex('carriers', 'byUsdot', usdot);
}

export async function getAllMcNumbers(): Promise<string[]> {
  const db = await getDatabase();
  const all = await db.getAll('mcAuthorities');
  return all.map((m) => m.mcNumber);
}

export async function saveCapturedPage(page: CapturedPageRecord): Promise<void> {
  const db = await getDatabase();
  await db.put('capturedPages', page);
}

export async function hasPageFingerprint(fingerprint: string): Promise<boolean> {
  const db = await getDatabase();
  const match = await db.getFromIndex('capturedPages', 'byFingerprint', fingerprint);
  return Boolean(match);
}

export async function getCapturedPageCount(): Promise<number> {
  const db = await getDatabase();
  return db.count('capturedPages');
}

export async function saveJob(job: CollectionJob): Promise<void> {
  const db = await getDatabase();
  await db.put('jobs', job);
  const settings = await getSettings();
  settings.activeJobId = job.status === 'running' || job.status === 'paused' ? job.id : settings.activeJobId;
  await putSettings(settings);
}

export async function getJob(id: string): Promise<CollectionJob | undefined> {
  const db = await getDatabase();
  return db.get('jobs', id);
}

export async function getActiveJob(): Promise<CollectionJob | null> {
  const settings = await getSettings();
  if (!settings.activeJobId) return null;
  const job = await getJob(settings.activeJobId);
  if (!job) return null;
  // A closed browser must not leave a "running" session active.
  if (job.status === 'running') {
    job.status = 'paused';
    job.statusDetail = 'Session interrupted (browser closed or worker suspended). Resume to continue.';
    job.updatedAt = new Date().toISOString();
    await saveJob(job);
  }
  return job;
}

export async function getSettings() {
  const db = await getDatabase();
  const existing = await db.get('settings', SETTINGS_KEY);
  if (existing) return existing;
  const fresh = {
    key: SETTINGS_KEY,
    authorization: { ...DEFAULT_AUTHORIZATION },
    searchQueue: [] as SearchQueueItem[],
    activeJobId: null as string | null,
    uiPreferences: {},
  };
  await db.put('settings', fresh);
  return fresh;
}

async function putSettings(
  settings: Awaited<ReturnType<typeof getSettings>>
): Promise<void> {
  const db = await getDatabase();
  await db.put('settings', settings);
}

export async function saveAuthorization(auth: AuthorizationState): Promise<void> {
  const settings = await getSettings();
  settings.authorization = auth;
  await putSettings(settings);
}

export async function saveSearchQueue(queue: SearchQueueItem[]): Promise<void> {
  const settings = await getSettings();
  settings.searchQueue = queue;
  await putSettings(settings);
}

export async function logError(
  context: string,
  message: string,
  details?: string
): Promise<void> {
  const db = await getDatabase();
  await db.put('errors', {
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    context,
    message,
    details,
  });
}

export async function computeStats(): Promise<CollectionStats> {
  const carriers = await getAllCarriers();
  const mcSet = new Set<string>();
  const usdotSet = new Set<string>();
  let missing = 0;
  let profilesEnriched = 0;

  for (const c of carriers) {
    for (const mc of c.mcNumbers) mcSet.add(mc);
    if (c.usdot) usdotSet.add(c.usdot);
    if (c.profileStatus === 'completed') profilesEnriched += 1;
    if (!c.usdot) missing += 1;
    if (c.mcNumbers.length === 0) missing += 1;
    if (!c.websiteUrl) missing += 1;
    if (!c.authorityStatus) missing += 1;
  }

  const pages = await getCapturedPageCount();
  const settings = await getSettings();
  const job = settings.activeJobId ? await getJob(settings.activeJobId) : null;

  return {
    searchPagesCaptured: pages,
    carrierRecords: carriers.length,
    uniqueMcNumbers: mcSet.size,
    uniqueUsdotNumbers: usdotSet.size,
    duplicatesSkipped: job?.duplicatesSkipped ?? 0,
    profilesEnriched,
    missingInformationCount: missing,
  };
}
