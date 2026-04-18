# EchoAware: System Instructions & Project Context

## 1. Project Overview
EchoAware is a Chrome Extension (Manifest V3) designed to detect echo chambers on YouTube and provide "escape queries" to diversify the user's feed

## 2. Core Architectural Principles
- **Privacy-First**: All watch history and raw metadata stay in the browser
- **Local ML**: Vector embeddings and clustering must happen locally in an Offscreen Document.
- **Minimal Cloud Footprint**: External API calls are only made to OpenRouter when an echo chamber (alert state) is detected.

## 3. Simplified Implementation Rules (Current Phase)
Override any conflicting documentation with these deliverable-specific rules:
- **Calibration Phase**: The system remains in a "Calibration" state until exactly **5 videos** are watched (ignore the 15-video requirement in the docs).
- **No Rolling Window**: Do not implement the 2-week eviction logic; keep all session data for this phase.
- **Simplified Diversity**: Calculate the Simpson's Diversity Index ($D = 1 - \sum (n/N)^2$) without applying time-based weights.
- **OpenRouter Only**: Use OpenRouter for all inference; do not implement fallback logic (e.g., compromise.js or secondary endpoints).
- **Manual Escape**: Clicking an escape query copies the text to the clipboard but does **not** auto-paste into the YouTube search bar.

## 4. Tech Stack & Layers
- **Presentation**: Vanilla JS/HTML/CSS for the popup dashboard.
- **Acquisition**: Content script using `yt-navigate-finish` to detect YouTube URL changes.
- **Backend**: MV3 Service Worker (Orchestrator) for message routing and badge alerts.
- **ML Engine**: Offscreen Document running `all-MiniLM-L6-v2` via ONNX/Transformers.js and HDBSCAN for clustering.
- **Storage**: IndexedDB for `VIDEO_ENTRY` and `SESSION_STATE`. `chrome.storage.local` for `CONFIG_STORE`.

## 5. Data Model Constraints
- **VIDEO_ENTRY**: `videoUrl` (PK), `title`, `embedding` (384-float array), `watchedAt`, `clusterId`, `sessionId`.
- **SESSION_STATE**: `sessionId` (PK), `diversityScore`, `alertState`, `calibrationPhase`, `enrichmentStatus`.

## 6. Development Commands
- **Linting**: `npm run lint`
- **Testing**: `npm run test` (Vitest/Jest for DiversityCalculator logic)
- **Build**: `npm run build`