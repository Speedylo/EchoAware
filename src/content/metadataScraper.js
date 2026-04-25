import { DOM_SELECTORS } from './domAdapter.js';

export function scrapeMetadata() {
  const titleEl = document.querySelector(DOM_SELECTORS.videoTitle);
  return {
    title: titleEl?.textContent?.trim() ?? '',
  };
}

// YouTube's SPA fires yt-navigate-finish before repainting <h1>. Poll briefly
// until the title populates so we never embed an empty string.
export async function scrapeMetadataWhenReady({ timeoutMs = 5000, intervalMs = 80 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = scrapeMetadata();
    if (m.title) return m;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return scrapeMetadata();
}
