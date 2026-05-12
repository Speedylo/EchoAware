# Chrome Web Store Submission — Reviewer Notes

This document contains the listing copy, permission justifications, and data-handling answers for EchoAware's Chrome Web Store submission. Paste each section into the corresponding CWS field at submission time.

---

## Listing copy

### Single-purpose description (one sentence)

> Detects YouTube echo chambers in your viewing pattern and suggests alternative search queries to broaden your feed.

### Detailed description (long form, ~1200 chars)

> EchoAware watches the YouTube videos you visit, groups them into topic clusters using a local AI model, and calculates how diverse your viewing has been. When your feed becomes one-sided, the extension icon shows an alert badge and the popup reveals three "escape queries" — alternative search terms picked to broaden your perspective.
>
> Everything that involves your viewing history runs inside your browser. The local clustering uses `all-MiniLM-L6-v2`, an open-source sentence embedding model that runs entirely offline on WASM/ONNX. No watch history, no URLs, and no Google account data ever leaves your device.
>
> When an echo chamber is detected, EchoAware sends only the titles of the dominant cluster (up to 5 titles per alert) to our Cloudflare Worker, which generates the escape queries using Cloudflare Workers AI. No logs are kept of these titles. See our privacy policy for details: https://github.com/Speedylo/EchoAware/blob/dev/PRIVACY.md.
>
> EchoAware works passively. No setup, no API keys, no account required — just install and browse YouTube normally.

### Category

Productivity

### Language

English

---

## Single purpose

> EchoAware has a single purpose: detect and surface echo chambers in the user's YouTube viewing pattern, and suggest alternative search queries when one is detected. Every permission and every host listed below is in direct service of this purpose.

---

## Permission justifications

Paste each into the corresponding "Permission justification" field.

### `storage`

> Required to persist video records, ML embeddings, session state, and the user's diversity score across browser restarts. All stored data is local to the user's device (`chrome.storage.local` and IndexedDB) and is never transmitted off-device. The data is what powers the echo-chamber detection — without persistent storage, the extension would forget every video as soon as the tab closes.

### `activeTab`

> Required so the popup can open a new YouTube search tab when the user clicks one of the suggested "escape queries." The extension does not read or modify the active tab's content using this permission — it only uses `chrome.tabs.create()` / `chrome.tabs.update()` to navigate to a YouTube search URL when the user explicitly clicks a query.

### `scripting`

> Required to inject the content script onto YouTube pages so the extension can detect when the user navigates to a new video (via YouTube's SPA `yt-navigate-finish` event) and read the public video title from the page DOM. No DOM modifications are made; the content script is read-only.

### `offscreen`

> Required by Chrome MV3 to run the local ML model. The `all-MiniLM-L6-v2` embedding model is loaded via WASM/ONNX in an offscreen document because service workers in MV3 cannot use `OffscreenCanvas`, `Worker`, or other DOM APIs needed by the runtime. All inference happens inside this offscreen document; nothing is sent off-device.

### Host: `*://*.youtube.com/*`

> Required so the content script can detect navigation events on YouTube and read the public video title from the page. The extension is functionally inert on every other website.

### Host: `https://echoaware-api.younes-rahati.workers.dev/*`

> Required to send the titles of the dominant cluster to our Cloudflare Worker when an echo chamber is detected. The Worker forwards those titles to Cloudflare Workers AI to generate the escape queries. See the privacy policy for the exact data sent and the no-log policy.

---

## Data handling disclosures (Privacy Practices tab)

These map to the CWS "Privacy practices" form. Fill in each section verbatim.

### Single purpose

> Detects echo chambers in the user's YouTube viewing pattern and suggests alternative search queries to diversify their feed.

### What user data does your extension collect or use?

Check the following categories:

| Category | Selected? | Notes |
|---|---|---|
| Personally identifiable information | No | |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | No | |
| Personal communications | No | |
| Location | No | |
| Web history | No | We do not collect *general* web history. We observe `*.youtube.com` URLs only, and they never leave the device. |
| User activity | **Yes** | YouTube video titles and the user's local cluster assignments are processed. Titles of the dominant cluster only (up to 5 at a time) are sent to our Cloudflare Worker on alert events. |
| Website content | **Yes** | Public YouTube video titles are read from the watch page DOM. |

### Required certifications

Tick all three:

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases.
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

> https://github.com/Speedylo/EchoAware/blob/dev/PRIVACY.md
>
> _Currently points at the `dev` branch. After merging dev → main, update to `https://github.com/Speedylo/EchoAware/blob/main/PRIVACY.md`_

---

## Reviewer-only justification (the "for the reviewer" textbox)

Use this for the freeform "Tell us more" prompt that often appears under permission justifications:

> EchoAware uses Cloudflare Workers AI (a developer-operated server, not a third-party SaaS) to generate "escape queries" only when an echo chamber is detected. The data sent is limited to a maximum of 5 YouTube video titles per alert (each truncated to 120 chars), an opaque random install token (UUID, for rate limiting), and the extension version. No URLs, no full history, no account data, no IP-correlated identifiers from our side. The Worker has a strict no-log policy enforced by a unit test (no `console.*` references to titles in the Worker source). Detailed disclosure is in our privacy policy.

---

## Screenshots needed (1280×800)

Capture one of each, with the popup open over a representative YouTube context:

1. **Calibrating** — popup showing "X of 5 videos watched" gauge in blue
2. **Healthy** — green gauge, score ≥ 80%, "Healthy" badge
3. **Borderline** — amber gauge, score 60-79%, "Borderline" badge
4. **Alert** — red gauge, topicLabel + 3 escape queries visible

Tips:
- Use a fresh Chrome profile so the popup is uncluttered
- For the Alert shot, the new prompt produces good labels — e.g. watch 5 cat videos → "cat humor" + 3 unrelated-subject suggestions
- The CWS supports up to 5 screenshots and 1 promotional tile (440×280)

---

## Files to attach

- `dist/echoaware.zip` (built via `npm run package`)
- 4 screenshots (PNG, 1280×800)
- An optional 440×280 promotional tile

---

## Pre-submission checklist

- [ ] `npm run build && npm run package` produces `dist/echoaware.zip` cleanly
- [ ] Grep `dist/background.js` for `OPENROUTER_API_KEY` / `Bearer sk-` / `openrouter.ai` → zero hits
- [ ] Privacy policy is live and reachable at the URL substituted into https://github.com/Speedylo/EchoAware/blob/dev/PRIVACY.md above
- [ ] `manifest.json` version is `1.0.0`
- [ ] `homepage_url` in `manifest.json` points at the GitHub repo
- [ ] `host_permissions` lists the **production** Worker URL (not staging) — swap during Phase 5
- [ ] All 4 screenshots captured at 1280×800
- [ ] Listing copy and permission justifications reviewed for typos
