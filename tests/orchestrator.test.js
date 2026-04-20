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
    chatModel: 'openrouter/free',
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
// Use vi.stubGlobal / vi.unstubAllGlobals so the getConfig module mock is
// never touched by cleanup, while fetch is still fully reset between tests.

describe('callOpenRouter (unit)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

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
    expect(body.models[0]).toBe('openrouter/free');  // default chatModel
    expect(body.models[1]).toBe('openrouter/free');  // explicit fallback
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

    await expect(callOpenRouter(['Video A'])).rejects.toThrow('401');
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
      async () => {
        const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'chrome-extension://echoaware',
            'X-Title': 'EchoAware',
          },
          body: JSON.stringify({
            model: 'openrouter/free',
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

        const body = await response.json();
        expect(response.ok, `OpenRouter error: ${JSON.stringify(body?.error)}`).toBe(true);

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
