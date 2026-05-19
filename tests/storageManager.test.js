import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDB } from '../src/storage/idb.js';
import { StorageManager, resetStorageManager } from '../src/storage/StorageManager.js';

const MOCK_EMBEDDING = new Float32Array(384).fill(0.1);

const MOCK_VIDEO = {
  videoUrl: 'https://www.youtube.com/watch?v=abc123',
  title: 'Test Video',
  embedding: MOCK_EMBEDDING,
  watchedAt: 1713398400000,
  clusterId: null,
  sessionId: 'session-1',
};

const MOCK_STATE = {
  sessionId: 'session-1',
  diversityScore: 0.42,
  alertState: 'healthy',
  calibrationPhase: false,
  enrichmentStatus: 'done',
  clusters: [],
};

async function freshStorage() {
  resetDB();
  resetStorageManager();
  const storage = await StorageManager.create();
  await storage.clearAll();
  return storage;
}

// ── VIDEO_ENTRY ───────────────────────────────────────────────────────────────

describe('StorageManager — VIDEO_ENTRY', () => {
  let storage;

  beforeEach(async () => { storage = await freshStorage(); });

  it('saves and retrieves a video entry', async () => {
    await storage.putVideoEntry(MOCK_VIDEO);
    const result = await storage.getVideoEntry(MOCK_VIDEO.videoUrl);

    expect(result.videoUrl).toBe(MOCK_VIDEO.videoUrl);
    expect(result.title).toBe(MOCK_VIDEO.title);
    expect(result.sessionId).toBe(MOCK_VIDEO.sessionId);
  });

  it('preserves the 384-float embedding as a Float32Array', async () => {
    await storage.putVideoEntry(MOCK_VIDEO);
    const result = await storage.getVideoEntry(MOCK_VIDEO.videoUrl);

    expect(result.embedding).toBeInstanceOf(Float32Array);
    expect(result.embedding).toHaveLength(384);
    expect(result.embedding[0]).toBeCloseTo(0.1, 5);
  });

  it('returns undefined for a missing video', async () => {
    const result = await storage.getVideoEntry('https://www.youtube.com/watch?v=missing');
    expect(result).toBeUndefined();
  });

  it('getVideoEntriesBySession returns only entries for that session', async () => {
    const otherVideo = {
      ...MOCK_VIDEO,
      videoUrl: 'https://www.youtube.com/watch?v=other1',
      sessionId: 'session-2',
    };
    await storage.putVideoEntry(MOCK_VIDEO);
    await storage.putVideoEntry(otherVideo);

    const session1Videos = await storage.getVideoEntriesBySession('session-1');
    expect(session1Videos).toHaveLength(1);
    expect(session1Videos[0].videoUrl).toBe(MOCK_VIDEO.videoUrl);
  });

  it('getVideoEntriesBySession returns empty array for unknown session', async () => {
    const result = await storage.getVideoEntriesBySession('no-such-session');
    expect(result).toEqual([]);
  });

  it('overwrites an existing entry on put (upsert)', async () => {
    await storage.putVideoEntry(MOCK_VIDEO);
    await storage.putVideoEntry({ ...MOCK_VIDEO, title: 'Updated Title' });

    const result = await storage.getVideoEntry(MOCK_VIDEO.videoUrl);
    expect(result.title).toBe('Updated Title');
  });

});

// ── SESSION_STATE ─────────────────────────────────────────────────────────────

describe('StorageManager — SESSION_STATE', () => {
  let storage;

  beforeEach(async () => { storage = await freshStorage(); });

  it('saves and retrieves session state', async () => {
    await storage.putSessionState(MOCK_STATE);
    const result = await storage.getSessionState('session-1');

    expect(result.diversityScore).toBe(0.42);
    expect(result.alertState).toBe('healthy');
    expect(result.calibrationPhase).toBe(false);
    expect(result.enrichmentStatus).toBe('done');
  });

  it('stores and retrieves nested clusters with escape queries', async () => {
    const stateWithClusters = {
      ...MOCK_STATE,
      clusters: [{
        clusterId: 0,
        topicLabel: 'Tech reviews',
        isDominant: true,
        escapeQueries: [{ queryId: 'q1', queryText: 'eco-friendly tech', isCopied: false }],
      }],
    };
    await storage.putSessionState(stateWithClusters);
    const result = await storage.getSessionState('session-1');

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].topicLabel).toBe('Tech reviews');
    expect(result.clusters[0].escapeQueries[0].queryText).toBe('eco-friendly tech');
  });

  it('returns undefined for a missing session', async () => {
    const result = await storage.getSessionState('nonexistent');
    expect(result).toBeUndefined();
  });
});

