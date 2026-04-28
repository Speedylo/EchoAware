import { DB_NAME, DB_VERSION, STORE_VIDEO_ENTRY, STORE_SESSION_STATE } from '../shared/constants.js';

/** @type {IDBDatabase|null} */
let _db = null;

export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const { oldVersion } = event;

      if (oldVersion < 1) {
        // Fresh install: create stores and indexes
        const videoStore = db.createObjectStore(STORE_VIDEO_ENTRY, { keyPath: 'videoUrl' });
        videoStore.createIndex('sessionId', 'sessionId', { unique: false });
        db.createObjectStore(STORE_SESSION_STATE, { keyPath: 'sessionId' });
      }

      if (oldVersion === 1) {
        // Add sessionId index to existing VIDEO_ENTRY store.
        const videoStore = event.target.transaction.objectStore(STORE_VIDEO_ENTRY);
        if (!videoStore.indexNames.contains('sessionId')) {
          videoStore.createIndex('sessionId', 'sessionId', { unique: false });
        }
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = () => reject(request.error);
  });
}

/** Reset the cached connection (used in tests to get a fresh DB). */
export function resetDB() {
  _db = null;
}
