import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CarrierRecord, McAuthorityRecord, CapturedPageRecord } from '../types/carrier';
import type {
  AuthorizationState,
  CollectionJob,
  SearchQueueItem,
} from '../types/job';

interface CollectorDB extends DBSchema {
  carriers: {
    key: string;
    value: CarrierRecord;
    indexes: {
      byUsdot: string;
      byName: string;
      byCaptured: string;
    };
  };
  mcAuthorities: {
    key: string;
    value: McAuthorityRecord;
    indexes: {
      byUsdot: string;
      byCarrierId: string;
    };
  };
  capturedPages: {
    key: string;
    value: CapturedPageRecord;
    indexes: {
      byFingerprint: string;
      byJob: string;
    };
  };
  jobs: {
    key: string;
    value: CollectionJob;
  };
  settings: {
    key: string;
    value: {
      key: string;
      authorization: AuthorizationState;
      searchQueue: SearchQueueItem[];
      activeJobId: string | null;
      uiPreferences: Record<string, unknown>;
    };
  };
  errors: {
    key: string;
    value: {
      id: string;
      at: string;
      context: string;
      message: string;
      details?: string;
    };
  };
}

const DB_NAME = 'carrier-source-dom-collector';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CollectorDB>> | null = null;

export function getDatabase(): Promise<IDBPDatabase<CollectorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CollectorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('carriers')) {
          const carriers = db.createObjectStore('carriers', { keyPath: 'id' });
          carriers.createIndex('byUsdot', 'usdot');
          carriers.createIndex('byName', 'companyName');
          carriers.createIndex('byCaptured', 'lastCapturedAt');
        }
        if (!db.objectStoreNames.contains('mcAuthorities')) {
          const mc = db.createObjectStore('mcAuthorities', { keyPath: 'mcNumber' });
          mc.createIndex('byUsdot', 'usdot');
          mc.createIndex('byCarrierId', 'carrierId');
        }
        if (!db.objectStoreNames.contains('capturedPages')) {
          const pages = db.createObjectStore('capturedPages', { keyPath: 'id' });
          pages.createIndex('byFingerprint', 'pageFingerprint');
          pages.createIndex('byJob', 'jobId');
        }
        if (!db.objectStoreNames.contains('jobs')) {
          db.createObjectStore('jobs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('errors')) {
          db.createObjectStore('errors', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function clearAllData(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(
    ['carriers', 'mcAuthorities', 'capturedPages', 'jobs', 'errors'],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('carriers').clear(),
    tx.objectStore('mcAuthorities').clear(),
    tx.objectStore('capturedPages').clear(),
    tx.objectStore('jobs').clear(),
    tx.objectStore('errors').clear(),
    tx.done,
  ]);
}
