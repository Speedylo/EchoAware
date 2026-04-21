import { MSG_VIDEO_NAVIGATED } from '../shared/messageTypes.js';
import { runAnalysisPipeline } from './analysisPipeline.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MSG_VIDEO_NAVIGATED) return false;
  runAnalysisPipeline(message.payload)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err?.message ?? String(err) }));
  return true; // async response
});
