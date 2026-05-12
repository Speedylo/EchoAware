# EchoAware

[![Version](https://img.shields.io/badge/version-1.0.0-informational)](manifest.json)
[![CI](https://github.com/Speedylo/EchoAware/actions/workflows/test.yml/badge.svg)](https://github.com/Speedylo/EchoAware/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> A Chrome extension that detects YouTube echo chambers and helps you break out of them — everything you watch stays in your browser.

---

## What is EchoAware?

YouTube's recommendation algorithm is very good at keeping you watching similar content. Over time, you can end up in an **echo chamber** — a loop of videos on the same narrow topic, with no exposure to alternative perspectives.

EchoAware runs quietly in the background as you browse YouTube. It watches which videos you visit, groups them by topic, and calculates how diverse your viewing habits are. When things get too one-sided, it shows a badge alert and suggests three **escape queries** — alternative search terms to help you discover something new.

Your watch history and the ML clustering that analyses it stay inside your browser. Only the *titles* of the dominant cluster are sent for inference, and only when an echo chamber is detected. See the [Privacy](#privacy) section.

---

## How It Works

1. **Calibration** — EchoAware silently observes the first 5 videos you watch to build a baseline.
2. **Scoring** — After that, every new video triggers a fresh diversity score. Videos are grouped into topic clusters with a local ML model (`all-MiniLM-L6-v2` running in an offscreen document); the more evenly spread they are, the higher the score.
3. **Alert** — If your score drops below the threshold, the extension icon shows a red `!` badge and the popup reveals the dominant topic along with three escape queries.

The badge reflects your current state at a glance:

| Badge | Meaning |
|-------|---------|
| _(none)_ | Healthy — your feed is diverse |
| `~` | Borderline — your feed is narrowing |
| `!` | Alert — echo chamber detected |

---

## Features

- Automatic echo chamber detection after 5 watched videos
- Real-time diversity score updated on every new YouTube video
- Three AI-generated search queries calibrated to the echo chamber type:
  - *Neutral-subject* clusters (e.g. cat videos) → suggestions on unrelated subjects
  - *Angle/sentiment* clusters (e.g. anti-AI commentary) → counter-perspectives within the subject for a holistic view
- Badge icon that reflects your feed health at all times
- No ads, no analytics, no external tracking during normal use
- No API key to configure — just install and use

---

## Install

Once published, install from the Chrome Web Store (link TBD).

### Or run from source

```bash
git clone https://github.com/Speedylo/EchoAware.git
cd EchoAware
npm install
npm run build
```

Then in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `EchoAware` folder (the one containing `manifest.json`)
4. The EchoAware icon will appear in your toolbar

That's it. Browse YouTube as you normally would — EchoAware will start calibrating automatically.

---

## Privacy

- **Your watch history never leaves the browser.** Video URLs, embeddings, and clustering all happen locally in an offscreen ML document.
- **Inference is server-assisted, but minimal.** When an echo chamber is detected, EchoAware sends up to 5 video titles from the dominant cluster to a Cloudflare Worker we operate (`echoaware-api.<...>.workers.dev`). The Worker forwards those titles to Cloudflare Workers AI, returns a topic label and 3 escape queries, and persists no logs of the titles.
- **No URLs, no account, no behavioral profile.** Only the titles of the dominant cluster on an alert event. No browsing history, no tab data, no identifying information.
- **One opaque install token** (a random UUID generated on first run) is sent with each inference request to enforce per-install rate limits. It is hashed server-side and cannot be reversed to identify a user.

Full policy: [PRIVACY.md](PRIVACY.md).

---

## Development

```bash
npm install            # install dependencies (downloads the ML model + WASM)
npm run build          # build the extension into dist/
npm run build:watch    # rebuild on file change
npm test               # run the test suite (vitest)
npm run lint           # eslint
npm run package        # produce dist/echoaware.zip for CWS submission
```

The Cloudflare Worker that handles inference lives in [`worker/`](worker/) — see that folder's README for deploy steps and configuration.

---

## License

MIT — see [LICENSE](LICENSE) for details.
