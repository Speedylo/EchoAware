import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unit tests use this staging URL literal (mock config returns the same value).
// Integration test uses process.env.WORKER_URL to override against any deployed Worker.
const STAGING_URL =
  'https://echoaware-api-staging.younes-rahati.workers.dev/v1/escape-queries';

// ── Module mocks (hoisted by Vitest) ─────────────────────────────────────────

vi.mock('../src/storage/configStore.js', () => ({
  getConfig: vi.fn().mockResolvedValue({
    thresholdD: 0.6,
    inferenceEndpoint:
      'https://echoaware-api-staging.younes-rahati.workers.dev/v1/escape-queries',
    installToken: '11111111-2222-3333-4444-555555555555',
  }),
}));

// ── Chrome stub ───────────────────────────────────────────────────────────────

const mockSetBadgeText = vi.fn();
const mockSetBadgeBackgroundColor = vi.fn();

vi.stubGlobal('chrome', {
  action: {
    setBadgeText: mockSetBadgeText,
    setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
  },
});

import { triggerBadgeAlert } from '../src/background/badgeManager.js';
import { callInference } from '../src/background/inferenceClient.js';

// ── triggerBadgeAlert ─────────────────────────────────────────────────────────

describe('triggerBadgeAlert', () => {
  beforeEach(() => {
    mockSetBadgeText.mockClear();
    mockSetBadgeBackgroundColor.mockClear();
  });

  it('shows a red ! badge when score is below the 0.6 threshold', async () => {
    await triggerBadgeAlert(0.3);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' });
    expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#EF4444' });
  });

  it('shows a red ! badge for score 0 (maximum echo chamber)', async () => {
    await triggerBadgeAlert(0);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' });
  });

  it('shows a yellow ~ badge at exactly the 0.6 threshold (boundary — borderline)', async () => {
    await triggerBadgeAlert(0.6);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '~' });
    expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#F59E0B' });
  });

  it('shows a yellow ~ badge for a borderline score (e.g. 75%)', async () => {
    await triggerBadgeAlert(0.75);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '~' });
    expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#F59E0B' });
  });

  it('clears badge at exactly 80% (boundary — healthy)', async () => {
    await triggerBadgeAlert(0.8);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(mockSetBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('clears badge when score is well above threshold', async () => {
    await triggerBadgeAlert(0.9);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(mockSetBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});

// ── callInference (unit — mocked fetch) ───────────────────────────────────────

describe('callInference (unit)', () => {
  let _realFetch;
  beforeEach(() => { _realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = _realFetch; });

  it('POSTs to the Worker with X-Install-Token and no Bearer auth', async () => {
    const mockBody = {
      topicLabel: 'Tech Reviews',
      escapeQueries: [
        { queryText: 'nature documentaries' },
        { queryText: 'philosophy lectures' },
        { queryText: 'cooking tutorials' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => mockBody,
    }));

    const result = await callInference(['AI video A', 'AI video B']);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(STAGING_URL);
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-Install-Token']).toBe('11111111-2222-3333-4444-555555555555');
    expect(opts.headers['Authorization']).toBeUndefined();
    expect(result.topicLabel).toBe('Tech Reviews');
    expect(result.escapeQueries).toHaveLength(3);
  });

  it('sends titles in the request body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ topicLabel: 'X', escapeQueries: [] }),
    }));

    const titles = ['Video about cats', 'More cat content'];
    await callInference(titles);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.titles).toEqual(titles);
    expect(body).toHaveProperty('clientVersion');
  });

  it('maps 429 to a "rate limit reached" message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'rate_limited', scope: 'token' }),
    }));

    await expect(callInference(['Video A'])).rejects.toThrow(/rate limit/i);
  });

  it('maps 503 budget_exhausted to a daily-budget message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'budget_exhausted',
        message: 'Daily inference budget exceeded. Try again tomorrow.',
      }),
    }));

    await expect(callInference(['Video A'])).rejects.toThrow(/budget/i);
  });

  it('maps 503 service_disabled to a temporarily-disabled message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'service_disabled' }),
    }));

    await expect(callInference(['Video A'])).rejects.toThrow(/temporarily disabled/i);
  });

  it('maps 426 to an upgrade-required message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 426,
      json: async () => ({ error: 'upgrade_required' }),
    }));

    await expect(callInference(['Video A'])).rejects.toThrow(/update|upgrade/i);
  });
});

// ── callInference (integration — real Worker) ────────────────────────────────
// Hits the staging (or override) Worker with a valid install token. Skipped if
// WORKER_URL is not pointing at a reachable Worker.

describe.skipIf(!process.env.WORKER_URL)(
  'callInference (integration — real Worker)',
  () => {
    it(
      'returns a topicLabel string and exactly 3 escapeQueries for a real prompt',
      async (ctx) => {
        let response;
        const integrationUrl = process.env.WORKER_URL || STAGING_URL;
        try {
          response = await fetch(integrationUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Install-Token': '11111111-2222-3333-4444-555555555555',
              'X-Client-Version': 'test-0.0.0',
            },
            body: JSON.stringify({
              titles: [
                'Bitcoin bull run 2024',
                'Crypto millionaire secrets',
                'Altcoin season predictions',
              ],
            }),
          });
        } catch {
          ctx.skip();
          return;
        }

        // Skip (don't fail) on quota / outage states we can't control locally.
        if (response.status === 429 || response.status >= 500) {
          ctx.skip();
          return;
        }
        if (!response.ok) {
          throw new Error(`Worker error: HTTP ${response.status}`);
        }

        const content = await response.json();

        expect(typeof content.topicLabel).toBe('string');
        expect(content.topicLabel.length).toBeGreaterThan(0);

        expect(Array.isArray(content.escapeQueries)).toBe(true);
        expect(content.escapeQueries).toHaveLength(3);
        for (const q of content.escapeQueries) {
          expect(typeof q.queryText).toBe('string');
          expect(q.queryText.length).toBeGreaterThan(0);
        }
      },
      20_000,
    );
  },
);
