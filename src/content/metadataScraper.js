import { DOM_SELECTORS } from './domAdapter.js';

/**
 * Scrape title and channel name from the current YouTube watch page.
 * Returns empty strings when elements are not yet in the DOM.
 * Title and channelName are stored; description is transient (used only for embedding).
 * @returns {{ title: string, channelName: string, description: string }}
 */
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
