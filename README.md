# EchoAware

[![Version](https://img.shields.io/badge/version-0.2.0-informational)](manifest.json)
[![CI](https://github.com/Speedylo/EchoAware/actions/workflows/test.yml/badge.svg)](https://github.com/Speedylo/EchoAware/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> A Chrome extension that detects YouTube echo chambers and helps you break out of them — everything runs locally in your browser.

---

## What is EchoAware?

YouTube's recommendation algorithm is very good at keeping you watching similar content. Over time, you can end up in an **echo chamber** — a loop of videos on the same narrow topic, with no exposure to alternative perspectives.

EchoAware runs quietly in the background as you browse YouTube. It watches which videos you visit, groups them by topic, and calculates how diverse your viewing habits are. When things get too one-sided, it shows a badge alert and suggests three **escape queries** — alternative search terms to help you discover something new.

Everything happens inside your browser. Your watch history never leaves your device.

---

## How It Works

1. **Calibration** — EchoAware silently observes the first 5 videos you watch to build a baseline.
2. **Scoring** — After that, every new video triggers a fresh diversity score. Videos are grouped into topic clusters; the more evenly spread they are, the higher the score.
3. **Alert** — If your score drops below the threshold, the extension icon shows a red `!` badge and the popup reveals the dominant topic along with three escape queries to copy and search.

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
- Three AI-generated search queries to broaden your feed when an alert fires
- One-click copy for each escape query
- Badge icon that reflects your feed health at all times
- No ads, no analytics, no external tracking during normal use

---

## Getting Started

### What you need

- **Google Chrome** (version 120 or newer)
- A free **[OpenRouter](https://openrouter.ai/)** account and API key — this is only used to generate escape queries when an echo chamber is detected

### Step 1 — Get an OpenRouter API key

1. Go to [openrouter.ai](https://openrouter.ai/) and create a free account.
2. Navigate to **Keys** in your dashboard and create a new key.
3. Copy the key — you will paste it into the extension settings later.

### Step 2 — Build the extension

```bash
git clone https://github.com/Speedylo/EchoAware.git
cd EchoAware
npm install
cp .env.example .env
```

Open the `.env` file and paste your OpenRouter API key:

```
OPENROUTER_API_KEY=sk-or-...
```

Then build:

```bash
npm run build
```

### Step 3 — Load it into Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `EchoAware` folder (the one that contains `manifest.json`)
5. The EchoAware icon will appear in your Chrome toolbar

That's it. Browse YouTube as you normally would — EchoAware will start calibrating automatically.

---

## Privacy

- **Your watch history never leaves the browser.** All video data and the ML models that analyse it run entirely on your device.
- **OpenRouter only receives video titles.** When an echo chamber is detected, a short list of representative titles from the dominant cluster is sent to generate escape queries. No URLs, no account information, no full history.
- **No background activity.** The extension only runs when you navigate to a YouTube video page — it is completely idle the rest of the time.

---

## License

MIT — see [LICENSE](LICENSE) for details.
