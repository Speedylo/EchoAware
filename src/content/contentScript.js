import { urlDetector } from './urlDetector.js';
import { scrapeMetadata } from './metadataScraper.js';
import { MSG_VIDEO_NAVIGATED } from '../shared/messageTypes.js';

urlDetector.init((resolvedUrl) => {
  const metadata = scrapeMetadata();
  chrome.runtime.sendMessage({ type: MSG_VIDEO_NAVIGATED, payload: { url: resolvedUrl, ...metadata } });
});
