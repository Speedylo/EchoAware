# EchoAware Inference Worker

Cloudflare Worker that runs Llama 3.1 8B via Workers AI to produce echo-chamber escape queries.
See `.claude/proxy-plan.md` for full design.

**Phase 1 status:** MVP only — no rate limits, no KV, no budget cap (those land in Phase 2).

## Endpoints

- `POST /v1/escape-queries` — body `{ "titles": string[] }` (1–5 titles). Returns `{ topicLabel, escapeQueries: [{ queryText }] × 3 }`.
- `GET /health` — `{ ok: true, model, version }`.

## Setup

```powershell
cd worker
npm install
npx wrangler login   # if you haven't already
```

Prereqs (see `.claude/proxy-plan.md` §Phase 0):
- Workers AI enabled on the account
- Workers AI spend cap set to **$0** in the CF dashboard

## Local dev

```powershell
npm run dev          # wrangler dev on http://localhost:8787
```

Smoke test:

```powershell
curl http://localhost:8787/health
curl -X POST http://localhost:8787/v1/escape-queries `
  -H "Content-Type: application/json" `
  -d '{"titles":["Why cats rule the internet","Top 10 funny cat fails","Cat vs cucumber compilation"]}'
```

## Tests

```powershell
npm test             # unit tests (pure functions + schemas)
npm run typecheck    # tsc --noEmit
```

## Deploy

```powershell
npm run deploy:staging      # → echoaware-api-staging.<subdomain>.workers.dev
npm run deploy:production   # → echoaware-api.<subdomain>.workers.dev
```

Phase 1 exit criterion: staging `POST /v1/escape-queries` returns a valid 3-query response, and `GET /health` returns 200.
