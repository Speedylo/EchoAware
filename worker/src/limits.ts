// Rate-limit + budget + config helpers backed by Cloudflare KV.
//
// Per proxy-plan.md §6: KV chosen over Durable Objects. Counters are
// best-effort (eventually consistent — small over-burst is acceptable when
// the global budget cap is the real ceiling).

const TTL_SECONDS = 90_000; // ~25h, safely past day rollover

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidTokenShape(token: string | null | undefined): boolean {
  return typeof token === 'string' && UUID_RE.test(token);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function secondsUntilNextUtcDay(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

export interface CounterResult {
  ok: boolean;
  remaining: number;
  retryAfter: number;
}

async function incrementCounter(
  kv: KVNamespace,
  key: string,
  limit: number,
): Promise<CounterResult> {
  const current = parseInt((await kv.get(key)) ?? '0', 10) || 0;
  if (current >= limit) {
    return { ok: false, remaining: 0, retryAfter: secondsUntilNextUtcDay() };
  }
  await kv.put(key, String(current + 1), { expirationTtl: TTL_SECONDS });
  return { ok: true, remaining: limit - current - 1, retryAfter: 0 };
}

export async function checkTokenLimit(
  rl: KVNamespace,
  token: string,
  limit: number,
): Promise<CounterResult> {
  const hash = await sha256Hex(token);
  return incrementCounter(rl, `rl:tok:${hash}:${utcDay()}`, limit);
}

export async function checkIpLimit(
  rl: KVNamespace,
  ip: string,
  limit: number,
): Promise<CounterResult> {
  return incrementCounter(rl, `rl:ip:${ip}:${utcDay()}`, limit);
}

export async function checkBudget(
  budget: KVNamespace,
  limit: number,
): Promise<CounterResult> {
  return incrementCounter(budget, `budget:requests:${utcDay()}`, limit);
}

export interface ResolvedConfig {
  enabled: boolean;
  model: string;
  tokenPerDay: number;
  ipPerDay: number;
  budgetPerDay: number;
}

const DEFAULTS = {
  enabled: true,
  model: '@cf/meta/llama-3.1-8b-instruct',
  tokenPerDay: 10,
  ipPerDay: 20,
  budgetPerDay: 800,
} as const;

async function readNumber(
  kv: KVNamespace,
  key: string,
  fallback: number,
): Promise<number> {
  const raw = await kv.get(key);
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function readConfig(kv: KVNamespace): Promise<ResolvedConfig> {
  const [enabledRaw, model, tokenPerDay, ipPerDay, budgetPerDay] = await Promise.all([
    kv.get('enabled'),
    kv.get('model'),
    readNumber(kv, 'limit:tok_per_day', DEFAULTS.tokenPerDay),
    readNumber(kv, 'limit:ip_per_day', DEFAULTS.ipPerDay),
    readNumber(kv, 'limit:budget_per_day', DEFAULTS.budgetPerDay),
  ]);

  return {
    enabled: enabledRaw == null ? DEFAULTS.enabled : enabledRaw !== 'false',
    model: model ?? DEFAULTS.model,
    tokenPerDay,
    ipPerDay,
    budgetPerDay,
  };
}
