import { describe, it, expect } from 'vitest';
import {
  checkBudget,
  checkIpLimit,
  checkTokenLimit,
  isValidTokenShape,
  readConfig,
  secondsUntilNextUtcDay,
  utcDay,
} from '../src/limits';

// Minimal in-memory KV shim. Enough surface for limits.ts (get + put with
// expirationTtl, which we ignore in tests).
function memoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true, cacheStatus: null };
    },
    async getWithMetadata() {
      throw new Error('not implemented');
    },
  } as unknown as KVNamespace;
}

const TOKEN = '11111111-2222-3333-4444-555555555555';

describe('isValidTokenShape', () => {
  it('accepts a v4-ish UUID', () => {
    expect(isValidTokenShape(TOKEN)).toBe(true);
  });

  it('rejects missing token', () => {
    expect(isValidTokenShape(null)).toBe(false);
    expect(isValidTokenShape(undefined)).toBe(false);
    expect(isValidTokenShape('')).toBe(false);
  });

  it('rejects non-UUID strings', () => {
    expect(isValidTokenShape('not-a-uuid')).toBe(false);
    expect(isValidTokenShape('11111111-2222-3333-4444')).toBe(false);
    expect(isValidTokenShape('zzzzzzzz-2222-3333-4444-555555555555')).toBe(false);
  });
});

describe('utcDay / secondsUntilNextUtcDay', () => {
  it('formats YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-05-12T14:30:00Z'))).toBe('2026-05-12');
  });

  it('returns positive seconds until midnight UTC', () => {
    const noon = new Date('2026-05-12T12:00:00Z');
    expect(secondsUntilNextUtcDay(noon)).toBe(12 * 3600);
  });
});

describe('checkTokenLimit', () => {
  it('allows requests up to the limit and rejects the next one', async () => {
    const kv = memoryKv();
    const LIMIT = 10;

    for (let i = 1; i <= LIMIT; i++) {
      const result = await checkTokenLimit(kv, TOKEN, LIMIT);
      expect(result.ok, `request ${i} should pass`).toBe(true);
      expect(result.remaining).toBe(LIMIT - i);
    }

    const blocked = await checkTokenLimit(kv, TOKEN, LIMIT);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('isolates counters per token (hash-keyed)', async () => {
    const kv = memoryKv();
    const OTHER = '99999999-8888-7777-6666-555555555555';

    await checkTokenLimit(kv, TOKEN, 1);
    const blocked = await checkTokenLimit(kv, TOKEN, 1);
    expect(blocked.ok).toBe(false);

    const otherOk = await checkTokenLimit(kv, OTHER, 1);
    expect(otherOk.ok).toBe(true);
  });
});

describe('checkIpLimit', () => {
  it('allows up to the limit per IP', async () => {
    const kv = memoryKv();
    const LIMIT = 3;

    for (let i = 0; i < LIMIT; i++) {
      expect((await checkIpLimit(kv, '1.2.3.4', LIMIT)).ok).toBe(true);
    }
    expect((await checkIpLimit(kv, '1.2.3.4', LIMIT)).ok).toBe(false);

    expect((await checkIpLimit(kv, '5.6.7.8', LIMIT)).ok).toBe(true);
  });
});

describe('checkBudget', () => {
  it('returns 503-shape (ok=false) when the daily budget is exhausted', async () => {
    const kv = memoryKv();
    const LIMIT = 2;

    expect((await checkBudget(kv, LIMIT)).ok).toBe(true);
    expect((await checkBudget(kv, LIMIT)).ok).toBe(true);
    const exhausted = await checkBudget(kv, LIMIT);
    expect(exhausted.ok).toBe(false);
    expect(exhausted.retryAfter).toBeGreaterThan(0);
  });
});

describe('readConfig', () => {
  it('returns defaults when KV is empty', async () => {
    const kv = memoryKv();
    const cfg = await readConfig(kv);
    expect(cfg.enabled).toBe(true);
    expect(cfg.model).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(cfg.tokenPerDay).toBe(10);
    expect(cfg.ipPerDay).toBe(20);
    expect(cfg.budgetPerDay).toBe(800);
  });

  it('honors kill switch when enabled=false', async () => {
    const kv = memoryKv();
    await kv.put('enabled', 'false');
    expect((await readConfig(kv)).enabled).toBe(false);
  });

  it('reads tunable limits from KV', async () => {
    const kv = memoryKv();
    await kv.put('limit:tok_per_day', '5');
    await kv.put('limit:ip_per_day', '15');
    await kv.put('limit:budget_per_day', '500');
    await kv.put('model', '@cf/meta/llama-3.3-70b-instruct');

    const cfg = await readConfig(kv);
    expect(cfg.tokenPerDay).toBe(5);
    expect(cfg.ipPerDay).toBe(15);
    expect(cfg.budgetPerDay).toBe(500);
    expect(cfg.model).toBe('@cf/meta/llama-3.3-70b-instruct');
  });

  it('falls back to defaults when KV values are malformed', async () => {
    const kv = memoryKv();
    await kv.put('limit:tok_per_day', 'not-a-number');
    expect((await readConfig(kv)).tokenPerDay).toBe(10);
  });
});
