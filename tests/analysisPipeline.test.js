import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetDB } from '../src/storage/idb.js';
import { resetStorageManager, getStorageManager } from '../src/storage/StorageManager.js';
import {
  MSG_EMBED_REQUEST,
  MSG_CLUSTER_REQUEST,
  MSG_STATE_UPDATED,
} from '../src/shared/messageTypes.js';

// ── Module mocks (hoisted by Vitest) ─────────────────────────────────────────

vi.mock('../src/background/orchestrator.js', () => ({
  handleMessage: vi.fn(),
  triggerBadgeAlert: vi.fn().mockResolvedValue(undefined),
  callOpenRouter: vi.fn().mockResolvedValue({
    topicLabel: 'Technology',
    escapeQueries: [
      { queryText: 'nature documentaries' },
      { queryText: 'history lectures' },
      { queryText: 'art tutorials' },
    ],
  }),
}));

vi.mock('../src/storage/configStore.js', () => ({
  getConfig: vi.fn().mockResolvedValue({
    thresholdD: 0.6,
    inferenceEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    chatModel: 'openrouter/free',
    openRouterApiKey: 'test-key',
  }),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { runAnalysisPipeline } from '../src/background/analysisPipeline.js';
import { triggerBadgeAlert, callOpenRouter } from '../src/background/orchestrator.js';

// ── Chrome API stub ───────────────────────────────────────────────────────────

const MOCK_EMBEDDING = Array.from({ length: 384 }, () => Math.random());
const SESSION_ID_KEY = 'echoaware_session_id';

let sendMessageMock;

function buildChromeMock({ sessionExists = true, clusterAssignmentFn } = {}) {
  sendMessageMock = vi.fn().mockImplementation(async (msg) => {
    if (!msg?.type) return undefined;
    if (msg.type === MSG_EMBED_REQUEST) return MOCK_EMBEDDING;
    if (msg.type === MSG_CLUSTER_REQUEST) {
      return clusterAssignmentFn
        ? clusterAssignmentFn(msg.payload.embeddings)
        : msg.payload.embeddings.map((_, i) => ({ videoIndex: i, clusterId: 0 }));
    }
    // MSG_STATE_UPDATED — popup notification; ignore silently
    return undefined;
  });

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn((key, cb) => {
          cb(sessionExists ? { [SESSION_ID_KEY]: 'test-session-1' } : {});
        }),
        set: vi.fn((_data, cb) => cb?.()),
      },
    },
    runtime: {
      sendMessage: sendMessageMock,
      getURL: vi.fn(path => `chrome-extension://echoaware/${path}`),
      getContexts: vi.fn().mockResolvedValue([]),
    },
    offscreen: {
      createDocument: vi.fn().mockResolvedValue(undefined),
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
  });
}

function makeMetadata(id) {
  return {
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Video ${id}`,
    channelName: 'Test Channel',
    description: '',
  };
}

async function freshStorage() {
  resetDB();
  resetStorageManager();
  const storage = await getStorageManager();
  await storage.clearAll();
  return storage;
}

// ── Helpers: seed N videos into the pipeline ──────────────────────────────────

async function seedVideos(n, { clusterAssignmentFn } = {}) {
  buildChromeMock({ clusterAssignmentFn });
  for (let i = 0; i < n; i++) {
    await runAnalysisPipeline(makeMetadata(`vid${i}`));
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runAnalysisPipeline — deduplication', () => {
  let storage;

  beforeEach(async () => {
    storage = await freshStorage();
    vi.clearAllMocks();
  });

  it('skips a video that already has an embedding stored', async () => {
    buildChromeMock();
    const meta = makeMetadata('dup1');

    await runAnalysisPipeline(meta);
    const callsAfterFirst = sendMessageMock.mock.calls.length;

    await runAnalysisPipeline(meta); // second call — same URL
    expect(sendMessageMock.mock.calls.length).toBe(callsAfterFirst); // no new messages
  });
});

describe('runAnalysisPipeline — calibration phase (< 5 videos)', () => {
  let storage;

  beforeEach(async () => {
    storage = await freshStorage();
    vi.clearAllMocks();
  });

  it('stores session state with calibrationPhase=true after the first video', async () => {
    buildChromeMock();
    await runAnalysisPipeline(makeMetadata('v0'));

    const state = await storage.getSessionState('test-session-1');
    expect(state.calibrationPhase).toBe(true);
    expect(state.alertState).toBe('calibrating');
    expect(state.diversityScore).toBe(0);
  });

  it('does NOT call triggerBadgeAlert during calibration', async () => {
    buildChromeMock();
    await runAnalysisPipeline(makeMetadata('v0'));
    expect(triggerBadgeAlert).not.toHaveBeenCalled();
  });

  it('does NOT call callOpenRouter during calibration', async () => {
    buildChromeMock();
    await runAnalysisPipeline(makeMetadata('v0'));
    expect(callOpenRouter).not.toHaveBeenCalled();
  });

  it('creates the offscreen document on the first call', async () => {
    buildChromeMock();
    await runAnalysisPipeline(makeMetadata('v0'));
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce();
  });

  it('requests an embedding for title + channelName', async () => {
    buildChromeMock();
    await runAnalysisPipeline(makeMetadata('v0'));

    const embedCall = sendMessageMock.mock.calls.find(
      ([msg]) => msg?.type === MSG_EMBED_REQUEST
    );
    expect(embedCall).toBeDefined();
    expect(embedCall[0].payload.text).toContain('Video v0');
    expect(embedCall[0].payload.text).toContain('Test Channel');
  });

  it('persists the video entry with the returned embedding', async () => {
    buildChromeMock();
    await runAnalysisPipeline(makeMetadata('v0'));

    const entry = await storage.getVideoEntry('https://www.youtube.com/watch?v=v0');
    expect(entry).toBeDefined();
    expect(entry.embedding).toHaveLength(384);
    expect(entry.sessionId).toBe('test-session-1');
  });
});

describe('runAnalysisPipeline — healthy state (score ≥ threshold)', () => {
  let storage;

  beforeEach(async () => {
    storage = await freshStorage();
    vi.clearAllMocks();
  });

  it('transitions to healthy after 5 videos spread across 5 clusters (D ≈ 0.8)', async () => {
    // Assign each video to its own cluster → 5 clusters of size 1 → D = 0.8
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: i })),
    });

    const state = await storage.getSessionState('test-session-1');
    expect(state.alertState).toBe('healthy');
    expect(state.calibrationPhase).toBe(false);
    expect(state.diversityScore).toBeGreaterThan(0.6);
  });

  it('calls triggerBadgeAlert after leaving calibration', async () => {
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: i })),
    });
    expect(triggerBadgeAlert).toHaveBeenCalled();
  });

  it('does NOT call callOpenRouter when healthy', async () => {
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: i })),
    });
    expect(callOpenRouter).not.toHaveBeenCalled();
  });

  it('stores clusters in session state', async () => {
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: i })),
    });
    const state = await storage.getSessionState('test-session-1');
    expect(state.clusters.length).toBeGreaterThan(0);
  });
});

describe('runAnalysisPipeline — alert state (score < threshold)', () => {
  let storage;

  beforeEach(async () => {
    storage = await freshStorage();
    vi.clearAllMocks();
  });

  it('transitions to alert after 5 videos all in one cluster (D = 0)', async () => {
    // All videos → cluster 0 → D = 0 < 0.6 → alert
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: 0 })),
    });

    const state = await storage.getSessionState('test-session-1');
    expect(state.alertState).toBe('alert');
    expect(state.calibrationPhase).toBe(false);
    expect(state.diversityScore).toBe(0);
  });

  it('calls callOpenRouter with titles from the dominant cluster', async () => {
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: 0 })),
    });
    expect(callOpenRouter).toHaveBeenCalledOnce();

    const [titles] = callOpenRouter.mock.calls[0];
    expect(Array.isArray(titles)).toBe(true);
    expect(titles.length).toBeGreaterThan(0);
  });

  it('stores AI-generated topicLabel and escapeQueries on the dominant cluster', async () => {
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: 0 })),
    });

    const state = await storage.getSessionState('test-session-1');
    const dominant = state.clusters.find(c => c.isDominant);

    expect(dominant).toBeDefined();
    expect(dominant.topicLabel).toBe('Technology');
    expect(dominant.escapeQueries).toHaveLength(3);
    expect(dominant.escapeQueries[0]).toHaveProperty('queryId');
    expect(dominant.escapeQueries[0]).toHaveProperty('queryText');
    expect(dominant.escapeQueries[0].isCopied).toBe(false);
  });

  it('sets enrichmentStatus to done after OpenRouter completes', async () => {
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: 0 })),
    });
    const state = await storage.getSessionState('test-session-1');
    expect(state.enrichmentStatus).toBe('done');
  });

  it('calls triggerBadgeAlert with the low diversity score', async () => {
    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: 0 })),
    });
    expect(triggerBadgeAlert).toHaveBeenCalledWith(0);
  });

  it('survives OpenRouter failure and still writes a final session state', async () => {
    callOpenRouter.mockRejectedValueOnce(new Error('API unavailable'));

    await seedVideos(5, {
      clusterAssignmentFn: (embs) => embs.map((_, i) => ({ videoIndex: i, clusterId: 0 })),
    });

    const state = await storage.getSessionState('test-session-1');
    expect(state.alertState).toBe('alert');
    expect(state.enrichmentStatus).toBe('done');
  });
});
