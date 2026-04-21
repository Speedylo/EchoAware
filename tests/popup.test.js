// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetDB } from '../src/storage/idb.js';
import { resetStorageManager, getStorageManager } from '../src/storage/StorageManager.js';

// chrome must be stubbed before popup.js is imported so the module-level
// DOMContentLoaded listener (if it fires) has a valid global available.
vi.stubGlobal('chrome', {
  storage: { local: { get: vi.fn(), set: vi.fn((_d, cb) => cb?.()) } },
  runtime: { onMessage: { addListener: vi.fn() }, sendMessage: vi.fn() },
});

import { renderCalibrating, renderHealthy, renderAlert, render } from '../src/popup/popup.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION_ID = 'test-popup-session';

function setupDOM() {
  document.body.innerHTML = `
    <div id="app">
      <div id="state-calibrating" class="state">
        <p>Calibrating: <span id="video-count">0</span> / 5 videos watched</p>
      </div>
      <div id="state-healthy" class="state">
        <p id="diversity-score"></p>
      </div>
      <div id="state-alert" class="state">
        <p id="alert-score"></p>
        <p id="topic-label">Analysing...</p>
        <ul id="representative-titles" hidden></ul>
        <ul id="escape-queries"></ul>
      </div>
    </div>
  `;
}

async function freshStorage() {
  resetDB();
  resetStorageManager();
  const storage = await getStorageManager();
  await storage.clearAll();
  return storage;
}

function mockChromeSession(sessionId) {
  chrome.storage.local.get.mockImplementation((_key, cb) =>
    cb(sessionId ? { echoaware_session_id: sessionId } : {})
  );
}

const BASE_ALERT_STATE = {
  sessionId: SESSION_ID,
  diversityScore: 0.2,
  alertState: 'alert',
  calibrationPhase: false,
  enrichmentStatus: 'done',
  clusters: [
    {
      clusterId: 0,
      topicLabel: 'Technology hype',
      isDominant: true,
      escapeQueries: [
        { queryId: 'q1', queryText: 'nature documentaries', isCopied: false },
        { queryId: 'q2', queryText: 'history lectures', isCopied: false },
        { queryId: 'q3', queryText: 'art tutorials', isCopied: false },
      ],
    },
  ],
};

// ── renderCalibrating ─────────────────────────────────────────────────────────

describe('renderCalibrating', () => {
  beforeEach(setupDOM);

  it('makes the calibrating panel active', () => {
    renderCalibrating(3);
    expect(document.getElementById('state-calibrating').classList.contains('active')).toBe(true);
  });

  it('updates the video count', () => {
    renderCalibrating(3);
    expect(document.getElementById('video-count').textContent).toBe('3');
  });

  it('hides healthy and alert panels', () => {
    renderCalibrating(3);
    expect(document.getElementById('state-healthy').classList.contains('active')).toBe(false);
    expect(document.getElementById('state-alert').classList.contains('active')).toBe(false);
  });

  it('handles zero videos', () => {
    renderCalibrating(0);
    expect(document.getElementById('video-count').textContent).toBe('0');
  });
});

// ── renderHealthy ─────────────────────────────────────────────────────────────

describe('renderHealthy', () => {
  beforeEach(setupDOM);

  it('makes the healthy panel active', () => {
    renderHealthy(0.75);
    expect(document.getElementById('state-healthy').classList.contains('active')).toBe(true);
  });

  it('displays the score as a rounded percentage', () => {
    renderHealthy(0.75);
    expect(document.getElementById('diversity-score').textContent).toBe('Diversity score: 75%');
  });

  it('rounds fractional percentages', () => {
    renderHealthy(0.756);
    expect(document.getElementById('diversity-score').textContent).toBe('Diversity score: 76%');
  });

  it('hides calibrating and alert panels', () => {
    renderHealthy(0.75);
    expect(document.getElementById('state-calibrating').classList.contains('active')).toBe(false);
    expect(document.getElementById('state-alert').classList.contains('active')).toBe(false);
  });
});

// ── renderAlert ───────────────────────────────────────────────────────────────

describe('renderAlert — panel and score', () => {
  beforeEach(setupDOM);

  it('makes the alert panel active', () => {
    renderAlert(BASE_ALERT_STATE);
    expect(document.getElementById('state-alert').classList.contains('active')).toBe(true);
  });

  it('displays the diversity score', () => {
    renderAlert(BASE_ALERT_STATE);
    expect(document.getElementById('alert-score').textContent).toBe('Diversity score: 20%');
  });

  it('hides calibrating and healthy panels', () => {
    renderAlert(BASE_ALERT_STATE);
    expect(document.getElementById('state-calibrating').classList.contains('active')).toBe(false);
    expect(document.getElementById('state-healthy').classList.contains('active')).toBe(false);
  });
});

describe('renderAlert — topic label', () => {
  beforeEach(setupDOM);

  it('displays the topic label when enrichment is done', () => {
    renderAlert(BASE_ALERT_STATE);
    expect(document.getElementById('topic-label').textContent).toBe('Technology hype');
  });

  it('shows "Analysing..." when enrichmentStatus is enriching', () => {
    renderAlert({ ...BASE_ALERT_STATE, enrichmentStatus: 'enriching' });
    expect(document.getElementById('topic-label').textContent).toBe('Analysing...');
  });

  it('falls back to generic label when topicLabel is empty', () => {
    const state = {
      ...BASE_ALERT_STATE,
      clusters: [{ ...BASE_ALERT_STATE.clusters[0], topicLabel: '' }],
    };
    renderAlert(state);
    expect(document.getElementById('topic-label').textContent).toBe('Echo chamber detected');
  });
});

describe('renderAlert — escape queries', () => {
  beforeEach(setupDOM);

  it('renders one list item per escape query', () => {
    renderAlert(BASE_ALERT_STATE);
    expect(document.querySelectorAll('.escape-query')).toHaveLength(3);
  });

  it('each item has query text and a Copy button', () => {
    renderAlert(BASE_ALERT_STATE);
    const first = document.querySelector('.escape-query');
    expect(first.querySelector('.query-text').textContent).toBe('nature documentaries');
    expect(first.querySelector('.copy-btn').textContent).toBe('Copy');
  });

  it('shows "Copied!" and adds .copied class for a pre-copied query', () => {
    const state = {
      ...BASE_ALERT_STATE,
      clusters: [{
        ...BASE_ALERT_STATE.clusters[0],
        escapeQueries: [{ queryId: 'q1', queryText: 'nature docs', isCopied: true }],
      }],
    };
    renderAlert(state);
    const btn = document.querySelector('.copy-btn');
    expect(btn.textContent).toBe('Copied!');
    expect(btn.classList.contains('copied')).toBe(true);
  });

  it('renders no query items while enriching', () => {
    renderAlert({ ...BASE_ALERT_STATE, enrichmentStatus: 'enriching' });
    expect(document.querySelectorAll('.escape-query')).toHaveLength(0);
  });

  it('shows the unavailable message when escape queries are empty', () => {
    const state = {
      ...BASE_ALERT_STATE,
      clusters: [{ ...BASE_ALERT_STATE.clusters[0], escapeQueries: [] }],
    };
    renderAlert(state);
    const msg = document.querySelector('.escape-unavailable');
    expect(msg).not.toBeNull();
    expect(msg.textContent).toContain('unavailable');
  });

  it('shows unavailable message when there are no clusters', () => {
    renderAlert({ ...BASE_ALERT_STATE, clusters: [] });
    expect(document.querySelector('.escape-unavailable')).not.toBeNull();
  });
});

describe('renderAlert — representative titles', () => {
  beforeEach(setupDOM);

  it('renders one item per title', () => {
    renderAlert(BASE_ALERT_STATE, ['Video A', 'Video B']);
    expect(document.querySelectorAll('.representative-title')).toHaveLength(2);
  });

  it('shows the title text', () => {
    renderAlert(BASE_ALERT_STATE, ['My Video']);
    expect(document.querySelector('.representative-title').textContent).toBe('My Video');
  });

  it('reveals the titles list when titles are provided', () => {
    renderAlert(BASE_ALERT_STATE, ['My Video']);
    expect(document.getElementById('representative-titles').hasAttribute('hidden')).toBe(false);
  });

  it('keeps the titles list hidden when no titles are provided', () => {
    renderAlert(BASE_ALERT_STATE, []);
    expect(document.getElementById('representative-titles').hasAttribute('hidden')).toBe(true);
  });

  it('hides the titles list when no second argument is passed', () => {
    renderAlert(BASE_ALERT_STATE);
    expect(document.getElementById('representative-titles').hasAttribute('hidden')).toBe(true);
  });
});

// ── Copy button interaction ───────────────────────────────────────────────────

describe('copy button', () => {
  beforeEach(() => {
    setupDOM();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it('writes the query text to the clipboard on click', async () => {
    renderAlert(BASE_ALERT_STATE);
    document.querySelector('.copy-btn').click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('nature documentaries');
  });

  it('updates button text to "Copied!" after click', async () => {
    renderAlert(BASE_ALERT_STATE);
    const btn = document.querySelector('.copy-btn');
    btn.click();
    await vi.waitFor(() => expect(btn.textContent).toBe('Copied!'));
  });

  it('adds the .copied class to the button after click', async () => {
    renderAlert(BASE_ALERT_STATE);
    const btn = document.querySelector('.copy-btn');
    btn.click();
    await vi.waitFor(() => expect(btn.classList.contains('copied')).toBe(true));
  });
});

// ── render() integration ──────────────────────────────────────────────────────

describe('render() — integration', () => {
  let storage;

  beforeEach(async () => {
    setupDOM();
    storage = await freshStorage();
    vi.clearAllMocks();
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(), set: vi.fn((_d, cb) => cb?.()) } },
      runtime: { onMessage: { addListener: vi.fn() }, sendMessage: vi.fn() },
    });
  });

  it('shows calibrating at 0 when no session exists', async () => {
    mockChromeSession(null);
    await render();
    expect(document.getElementById('state-calibrating').classList.contains('active')).toBe(true);
    expect(document.getElementById('video-count').textContent).toBe('0');
  });

  it('shows calibrating with the stored video count', async () => {
    mockChromeSession(SESSION_ID);
    await storage.putVideoEntry({
      videoUrl: 'https://youtube.com/watch?v=1',
      title: 'Video 1',
      embedding: new Array(384).fill(0),
      watchedAt: Date.now(),
      clusterId: null,
      sessionId: SESSION_ID,
    });
    await storage.putSessionState({
      sessionId: SESSION_ID,
      diversityScore: 0,
      alertState: 'calibrating',
      calibrationPhase: true,
      enrichmentStatus: 'idle',
      clusters: [],
    });
    await render();
    expect(document.getElementById('state-calibrating').classList.contains('active')).toBe(true);
    expect(document.getElementById('video-count').textContent).toBe('1');
  });

  it('shows calibrating when there is no session state yet', async () => {
    mockChromeSession(SESSION_ID);
    // No session state written — storage returns undefined
    await render();
    expect(document.getElementById('state-calibrating').classList.contains('active')).toBe(true);
  });

  it('shows the healthy panel', async () => {
    mockChromeSession(SESSION_ID);
    await storage.putSessionState({
      sessionId: SESSION_ID,
      diversityScore: 0.8,
      alertState: 'healthy',
      calibrationPhase: false,
      enrichmentStatus: 'idle',
      clusters: [],
    });
    await render();
    expect(document.getElementById('state-healthy').classList.contains('active')).toBe(true);
    expect(document.getElementById('diversity-score').textContent).toBe('Diversity score: 80%');
  });

  it('shows the alert panel with topic label', async () => {
    mockChromeSession(SESSION_ID);
    await storage.putSessionState(BASE_ALERT_STATE);
    await render();
    expect(document.getElementById('state-alert').classList.contains('active')).toBe(true);
    expect(document.getElementById('topic-label').textContent).toBe('Technology hype');
  });

  it('passes dominant-cluster videos as representative titles', async () => {
    mockChromeSession(SESSION_ID);
    await storage.putVideoEntry({
      videoUrl: 'https://youtube.com/watch?v=dom',
      title: 'Dominant Video',
      embedding: new Array(384).fill(0),
      watchedAt: Date.now(),
      clusterId: 0,
      sessionId: SESSION_ID,
    });
    await storage.putSessionState({
      ...BASE_ALERT_STATE,
      clusters: [{
        clusterId: 0, topicLabel: 'Echo topic', isDominant: true, escapeQueries: [],
      }],
    });
    await render();
    const titles = document.querySelectorAll('.representative-title');
    expect(titles).toHaveLength(1);
    expect(titles[0].textContent).toBe('Dominant Video');
  });

  it('does not include videos from non-dominant clusters as representative titles', async () => {
    mockChromeSession(SESSION_ID);
    await storage.putVideoEntry({
      videoUrl: 'https://youtube.com/watch?v=other',
      title: 'Other Video',
      embedding: new Array(384).fill(0),
      watchedAt: Date.now(),
      clusterId: 1,
      sessionId: SESSION_ID,
    });
    await storage.putSessionState({
      ...BASE_ALERT_STATE,
      clusters: [
        { clusterId: 0, topicLabel: 'Dominant', isDominant: true, escapeQueries: [] },
        { clusterId: 1, topicLabel: 'Other', isDominant: false, escapeQueries: [] },
      ],
    });
    await render();
    expect(document.querySelectorAll('.representative-title')).toHaveLength(0);
  });
});
