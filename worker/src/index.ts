import { RequestSchema } from './schema';
import { runInference, DEFAULT_MODEL } from './inference';
import {
  checkBudget,
  checkIpLimit,
  checkTokenLimit,
  isValidTokenShape,
  readConfig,
} from './limits';

export interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  BUDGET: KVNamespace;
  CONFIG: KVNamespace;
}

const VERSION = '0.2.0';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      const cfg = await readConfig(env.CONFIG).catch(() => null);
      return jsonResponse({
        ok: true,
        model: cfg?.model ?? DEFAULT_MODEL,
        enabled: cfg?.enabled ?? true,
        version: VERSION,
      });
    }

    if (request.method === 'POST' && url.pathname === '/v1/escape-queries') {
      const config = await readConfig(env.CONFIG);

      if (!config.enabled) {
        return jsonResponse({ error: 'service_disabled' }, { status: 503 });
      }

      const token = request.headers.get('X-Install-Token');
      if (!isValidTokenShape(token)) {
        return jsonResponse({ error: 'missing_or_invalid_token' }, { status: 401 });
      }

      const ip = clientIp(request);
      const ipResult = await checkIpLimit(env.RATE_LIMIT, ip, config.ipPerDay);
      if (!ipResult.ok) {
        return jsonResponse(
          { error: 'rate_limited', scope: 'ip' },
          { status: 429, headers: { 'Retry-After': String(ipResult.retryAfter) } },
        );
      }

      const tokResult = await checkTokenLimit(env.RATE_LIMIT, token as string, config.tokenPerDay);
      if (!tokResult.ok) {
        return jsonResponse(
          { error: 'rate_limited', scope: 'token' },
          { status: 429, headers: { 'Retry-After': String(tokResult.retryAfter) } },
        );
      }

      const budgetResult = await checkBudget(env.BUDGET, config.budgetPerDay);
      if (!budgetResult.ok) {
        return jsonResponse(
          {
            error: 'budget_exhausted',
            message: 'Daily inference budget exceeded. Try again tomorrow.',
          },
          { status: 503, headers: { 'Retry-After': String(budgetResult.retryAfter) } },
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'invalid_json' }, { status: 400 });
      }

      const parsed = RequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse(
          { error: 'invalid_request', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      try {
        const result = await runInference(env.AI, parsed.data.titles, config.model);
        return jsonResponse(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        return jsonResponse({ error: 'upstream_error', message }, { status: 503 });
      }
    }

    return jsonResponse({ error: 'not_found' }, { status: 404 });
  },

  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Daily tick. Counters TTL on their own; no per-request data is persisted.
    // Reserved for future trend snapshots (proxy-plan.md §4 Monitoring).
  },
} satisfies ExportedHandler<Env>;
