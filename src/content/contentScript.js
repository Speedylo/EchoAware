import { urlDetector } from './urlDetector.js';
import { scrapeMetadataWhenReady } from './metadataScraper.js';
import { MSG_VIDEO_NAVIGATED } from '../shared/messageTypes.js';

urlDetector.init(async (resolvedUrl) => {
  const metadata = await scrapeMetadataWhenReady();
  if (!metadata.title) return;
  chrome.runtime.sendMessage({
    type: MSG_VIDEO_NAVIGATED,
    payload: { url: resolvedUrl, ...metadata },
  }).catch(() => {});
});
