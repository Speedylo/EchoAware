import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

// ── Load .env for integration test (not available via esbuild define in tests) ─

function loadDotEnv() {
  try {
    return Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split('\n')
        .filter(l => l && !l.startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ?? loadDotEnv().OPENROUTER_API_KEY ?? '';

// ── Module mocks (hoisted by Vitest) ─────────────────────────────────────────

vi.mock('../src/storage/configStore.js', () => ({
  getConfig: vi.fn().mockResolvedValue({
    thresholdD: 0.6,
    inferenceEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    chatModel: 'openai/gpt-oss-120b:free',
    openRouterApiKey: 'test-key',
  }),
}));

// analysisPipeline is imported by orchestrator — mock it to isolate the module
vi.mock('../src/background/analysisPipeline.js', () => ({
  runAnalysisPipeline: vi.fn().mockResolvedValue(undefined),
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

import { triggerBadgeAlert, callOpenRouter } from '../src/background/orchestrator.js';

// ── triggerBadgeAlert ─────────────────────────────────────────────────────────

describe('triggerBadgeAlert', () => {
  beforeEach(() => {
    mockSetBadgeText.mockClear();
    mockSetBadgeBackgroundColor.mockClear();
  });

  it('shows a red ! badge when score is below the 0.6 threshold', async () => {
    await triggerBadgeAlert(0.3);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' });
    expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#E53935' });
  });

  it('shows a red ! badge for score 0 (maximum echo chamber)', async () => {
    await triggerBadgeAlert(0);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' });
  });

  it('clears badge at exactly the 0.6 threshold (boundary — healthy)', async () => {
    await triggerBadgeAlert(0.6);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(mockSetBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('clears badge when score is well above threshold', async () => {
    await triggerBadgeAlert(0.9);
    expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' });
    expect(mockSetBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});

// ── callOpenRouter (unit — mocked fetch) ──────────────────────────────────────
// Save/restore only globalThis.fetch so the top-level chrome stub and the
// vi.mock() module stubs are not disturbed between tests.

describe('callOpenRouter (unit)', () => {
  let _realFetch;
  beforeEach(() => { _realFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = _realFetch; });

  it('POSTs to the configured endpoint with Bearer auth', async () => {
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
      json: async () => ({ choices: [{ message: { content: JSON.stringify(mockBody) } }] }),
    }));

    const result = await callOpenRouter(['AI video A', 'AI video B']);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toMatch(/^Bearer /);
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(result.topicLabel).toBe('Tech Reviews');
    expect(result.escapeQueries).toHaveLength(3);
  });

  it('includes the representative titles in the request body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ topicLabel: 'X', escapeQueries: [] }) } }],
      }),
    }));

    const titles = ['Video about cats', 'More cat content'];
    await callOpenRouter(titles);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe('openai/gpt-oss-120b:free');  // default chatModel
    const userMessage = body.messages.find(m => m.role === 'user').content;
    expect(userMessage).toContain('Video about cats');
    expect(userMessage).toContain('More cat content');
  });

  it('throws when OpenRouter returns a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }));

    await expect(callOpenRouter(['Video A'])).rejects.toThrow(/API key|OpenRouter/i);
  });
});

// ── callOpenRouter (integration — real OpenRouter API) ────────────────────────
// Uses the free nvidia/nemotron-3-super-120b-a12b model — no credits required.
// Skipped automatically in CI where OPENROUTER_API_KEY is not set.

describe.skipIf(!OPENROUTER_API_KEY)(
  'callOpenRouter (integration — real OpenRouter API)',
  () => {
    it(
      'returns a topicLabel string and exactly 3 escapeQueries for a real prompt',
      async (ctx) => {
        const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        let response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'HTTP-Referer': 'chrome-extension://echoaware',
              'X-Title': 'EchoAware',
            },
            body: JSON.stringify({
              model: 'openai/gpt-oss-120b:free',
              messages: [
                {
                  role: 'system',
                  content:
                    'You detect echo chambers in YouTube viewing patterns. Always reply with valid JSON only, no markdown fences.',
                },
                {
                  role: 'user',
                  content:
                    'I keep watching: "Bitcoin bull run 2024", "Crypto millionaire secrets", "Altcoin season predictions". ' +
                    'Identify the main topic and give 3 search queries to diversify my feed. ' +
                    'Reply in this JSON shape: {"topicLabel":"...","escapeQueries":[{"queryText":"..."},{"queryText":"..."},{"queryText":"..."}]}',
                },
              ],
            }),
          });
        } catch {
          // Network unreachable (timeout, no internet, rate-limit) — skip, don't fail.
          ctx.skip();
          return;
        }

        const body = await response.json();
        if (!response.ok) {
          // Skip (not fail) on out-of-band conditions we can't control locally:
          //   429 — free-tier daily quota exhausted
          //   5xx — upstream provider timeout / outage (e.g. provider_name: Venice)
          if (response.status === 429 || response.status >= 500) {
            ctx.skip();
            return;
          }
          throw new Error(`OpenRouter error: ${JSON.stringify(body?.error)}`);
        }

        const content = JSON.parse(body.choices[0].message.content);

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
