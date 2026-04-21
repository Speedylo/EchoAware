import { DOM_SELECTORS } from './domAdapter.js';

export function scrapeMetadata() {
  const titleEl = document.querySelector(DOM_SELECTORS.videoTitle);
  const channelEl = document.querySelector(DOM_SELECTORS.channelName);
  const descEl = document.querySelector(DOM_SELECTORS.description);

  return {
    title: titleEl?.textContent?.trim() ?? '',
    channelName: channelEl?.textContent?.trim() ?? '',
    description: descEl?.textContent?.trim() ?? '',
  };
}

// YouTube's SPA fires yt-navigate-finish before repainting <h1>. Poll briefly
// until the title populates so we never embed an empty string.
export async function scrapeMetadataWhenReady({ timeoutMs = 3000, intervalMs = 80 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = scrapeMetadata();
    if (m.title) return m;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return scrapeMetadata();
}
