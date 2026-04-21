import { openDB } from './idb.js';
import { STORE_VIDEO_ENTRY, STORE_SESSION_STATE } from '../shared/constants.js';

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class StorageManager {
  /** @param {IDBDatabase} db */
  constructor(db) {
    this._db = db;
  }

  static async create() {
    const db = await openDB();
    return new StorageManager(db);
  }

  // ── VIDEO_ENTRY ──────────────────────────────────────────────────────────

  /**
   * Upsert a video entry. `embedding` should be a Float32Array (384 floats).
   * @param {{ videoUrl: string, title: string, embedding: Float32Array,
   *           watchedAt: number, clusterId: number|null, sessionId: string }} entry
   */
  async putVideoEntry(entry) {
    const tx = this._db.transaction(STORE_VIDEO_ENTRY, 'readwrite');
    await idbRequest(tx.objectStore(STORE_VIDEO_ENTRY).put(entry));
  }

  /** @param {string} videoUrl @returns {Promise<object|undefined>} */
  async getVideoEntry(videoUrl) {
    const tx = this._db.transaction(STORE_VIDEO_ENTRY, 'readonly');
    return idbRequest(tx.objectStore(STORE_VIDEO_ENTRY).get(videoUrl));
  }

  /** @returns {Promise<object[]>} */
  async getAllVideoEntries() {
    const tx = this._db.transaction(STORE_VIDEO_ENTRY, 'readonly');
    return idbRequest(tx.objectStore(STORE_VIDEO_ENTRY).getAll());
  }

  /** @param {string} sessionId @returns {Promise<object[]>} */
  async getVideoEntriesBySession(sessionId) {
    const tx = this._db.transaction(STORE_VIDEO_ENTRY, 'readonly');
    return idbRequest(tx.objectStore(STORE_VIDEO_ENTRY).index('sessionId').getAll(sessionId));
  }

  /** @param {string} videoUrl */
  async deleteVideoEntry(videoUrl) {
    const tx = this._db.transaction(STORE_VIDEO_ENTRY, 'readwrite');
    await idbRequest(tx.objectStore(STORE_VIDEO_ENTRY).delete(videoUrl));
  }

  // ── SESSION_STATE ────────────────────────────────────────────────────────

  /**
   * @param {{ sessionId: string, diversityScore: number, alertState: string,
   *           calibrationPhase: boolean, enrichmentStatus: string,
   *           clusters: Array<{clusterId: number, topicLabel: string,
   *             isDominant: boolean, escapeQueries: Array<{queryId: string,
   *             queryText: string, isCopied: boolean}>}> }} state
   */
  async putSessionState(state) {
    const tx = this._db.transaction(STORE_SESSION_STATE, 'readwrite');
    await idbRequest(tx.objectStore(STORE_SESSION_STATE).put(state));
  }

  /** @param {string} sessionId @returns {Promise<object|undefined>} */
  async getSessionState(sessionId) {
    const tx = this._db.transaction(STORE_SESSION_STATE, 'readonly');
    return idbRequest(tx.objectStore(STORE_SESSION_STATE).get(sessionId));
  }

  // ── Read-model projections (§5.6) ────────────────────────────────────────

  /**
   * UIState projection: fields consumed by the popup.
   * @param {string} sessionId
   * @returns {Promise<{diversityScore: number, alertState: string,
   *   calibrationPhase: boolean, enrichmentStatus: string}|undefined>}
   */
  async getUIState(sessionId) {
    const state = await this.getSessionState(sessionId);
    if (!state) return undefined;
    const { diversityScore, alertState, calibrationPhase, enrichmentStatus } = state;
    return { diversityScore, alertState, calibrationPhase, enrichmentStatus };
  }

  /**
   * PipelineState projection: fields consumed by the orchestrator and analysis pipeline.
   * @param {string} sessionId
   * @returns {Promise<{clusters: object[], watchedVideos: object[]}|undefined>}
   */
  async getPipelineState(sessionId) {
    const state = await this.getSessionState(sessionId);
    if (!state) return undefined;
    const watchedVideos = await this.getVideoEntriesBySession(sessionId);
    return { clusters: state.clusters ?? [], watchedVideos };
  }

  // ── Housekeeping ─────────────────────────────────────────────────────────

  /** Clear all stores. Used in tests to isolate each case. */
  async clearAll() {
    const tx = this._db.transaction([STORE_VIDEO_ENTRY, STORE_SESSION_STATE], 'readwrite');
    await Promise.all([
      idbRequest(tx.objectStore(STORE_VIDEO_ENTRY).clear()),
      idbRequest(tx.objectStore(STORE_SESSION_STATE).clear()),
    ]);
  }
}

// ── Module-level singleton (used by videoStore / sessionStore) ───────────────

let _instance = null;

/** Returns the shared StorageManager instance, creating it on first call. */
export async function getStorageManager() {
  if (!_instance) _instance = await StorageManager.create();
  return _instance;
}

/** Reset the singleton (used in tests alongside resetDB). */
export function resetStorageManager() {
  _instance = null;
}
