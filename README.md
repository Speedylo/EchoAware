# EchoAware

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue?logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)
[![Version](https://img.shields.io/badge/version-0.1.0-informational)](package.json)
[![CI](https://github.com/Speedylo/EchoAware/actions/workflows/test.yml/badge.svg)](https://github.com/Speedylo/EchoAware/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> A privacy-first Chrome extension that detects YouTube echo chambers and suggests escape queries — all local ML, no server.

EchoAware monitors the YouTube videos you watch, clusters them by topic using local ML inference, and calculates a diversity score. When your viewing history becomes too narrow — a sign of an echo chamber — it alerts you and generates AI-powered "escape queries" to help you discover counter-perspectives. Your watch history and embeddings never leave the browser.

---

## How It Works

After 5 watched videos, EchoAware runs the following pipeline on every new navigation:

```
YouTube page
    └─► Content Script         scrapes title, channel, description
            └─► Service Worker (Orchestrator)
                    └─► Offscreen Document
                    │       ├─ all-MiniLM-L6-v2 (Transformers.js/ONNX)  → 384-dim embedding
                    │       └─ HDBSCAN                                    → topic clusters
                    ├─► Simpson's Diversity Index  →  score ∈ [0, 1]
                    │
                    ├─ score ≥ 0.6  →  ✅  badge cleared,  popup: Healthy
                    └─ score < 0.6  →  🔴  badge alert
                                        └─► OpenRouter API
                                                └─ topic label + 3 escape queries
                                                        └─► popup: Alert (copy to clipboard)
```

Key properties:
- **Fully local during normal operation** — embeddings and clustering happen in an Offscreen Document; nothing is sent externally.
- **OpenRouter is called only in alert state** — and only sends representative video titles (not URLs or full watch history).
- **Calibration** — the first 5 videos build up enough data before any scoring begins.
- **Simpson's Diversity Index** — `D = 1 - Σ(nᵢ/N)²` where nᵢ is the count of videos in cluster i and N is total videos.

---

## Features

- Local ML inference — all-MiniLM-L6-v2 embeddings via ONNX/Transformers.js, running in a sandboxed Offscreen Document
- Automatic echo chamber detection after 5 watched videos
- Red badge alert (`!`) when diversity score drops below configurable threshold (default: 0.6)
- AI-generated escape queries — 3 alternative search topics to break the echo chamber
- One-click copy to clipboard for each escape query
- Three popup states: **Calibrating** → **Healthy** → **Alert**
- IndexedDB persistence across browser sessions
- No analytics, no telemetry, no external tracking during normal use

---

## Installation (Development)

### Prerequisites
- Node.js 18+ (tested on Node 24)
- A free [OpenRouter](https://openrouter.ai/) account and API key
- Google Chrome 120+

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/Speedylo/EchoAware.git
cd EchoAware

# 2. Install dependencies
npm install

# 3. Set up your environment
cp .env.example .env
# Edit .env and add your key:
# OPENROUTER_API_KEY=sk-or-...

# 4. Build the extension
npm run build

# 5. Load in Chrome
1. Open  chrome://extensions
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the EchoAware project root (the folder containing manifest.json, NOT the dist/ folder)
5. The EchoAware icon appears in your toolbar
```

Browse YouTube normally — EchoAware will start calibrating after your first video.

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Production build (minified) |
| `npm run build:watch` | Rebuild automatically on file changes |
| `npm run lint` | ESLint across `src/` and `tests/` |
| `npm run test` | Run the full Vitest test suite |
| `npm run test:watch` | Interactive test watcher |

---

## Privacy

- **Watch history stays local.** All video metadata and 384-dimensional embeddings are stored only in the browser's IndexedDB.
- **OpenRouter receives only titles.** When an echo chamber is detected, representative titles from the dominant cluster are sent to OpenRouter to generate escape queries. No URLs, no user identity, no full history.
- **No background tracking.** The extension is entirely event-driven — it only activates when you navigate to a YouTube video page.

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| Extension platform | Chrome Manifest V3 |
| Bundler | esbuild 0.24 |
| ML embeddings | Transformers.js 2.17 · all-MiniLM-L6-v2 (384-dim, ONNX) |
| Clustering | hdbscanjs 1.0 |
| Storage | IndexedDB · `chrome.storage.local` |
| External inference | OpenRouter API (alert state only) |
| Testing | Vitest 2.0 · fake-indexeddb · jsdom |
| Linting | ESLint 9.0 |
| CI | GitHub Actions (Node 24) |

---

## Configuration

All settings are stored in `chrome.storage.local` and can be adjusted programmatically via `src/storage/configStore.js`:

| Key | Default | Description |
|-----|---------|-------------|
| `thresholdD` | `0.7` | Diversity score below which an alert is triggered |
| `minVideos` | `5` | Number of videos required before scoring begins |
| `chatModel` | `openrouter/auto` | OpenRouter model used for escape query generation |
| `openRouterApiKey` | _(from `.env`)_ | Injected at build time |

---

## Current Limitations (v0.1.0)

This is an MVP scoped to validate the core pipeline:

- **Popup UI** — HTML structure is ready; JavaScript wiring is in progress
- **Session data** — All videos are retained; no rolling-window eviction
- **Diversity score** — Unweighted Simpson's Index; no time-based decay
- **Escape queries** — Must be copied manually; no auto-paste into the YouTube search bar
- **Inference** — Single OpenRouter endpoint; no offline fallback

---

## Contributing

1. Fork the repository and create a feature branch
2. Make your changes
3. Run `npm run lint && npm run test` — both must pass
4. Open a pull request; CI will run automatically

---

## License

MIT — see [LICENSE](LICENSE) for details.