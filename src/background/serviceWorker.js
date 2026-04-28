import { MSG_VIDEO_NAVIGATED } from '../shared/messageTypes.js';
import { runAnalysisPipeline } from './analysisPipeline.js';
import { syncBadgeFromState } from './badgeManager.js';

// Without this the badge would be empty after any reload until the next VIDEO_NAVIGATED event reaches the pipeline.
syncBadgeFromState().catch(() => {});
chrome.runtime.onInstalled.addListener(() => { syncBadgeFromState().catch(() => {}); });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MSG_VIDEO_NAVIGATED) return false;
  runAnalysisPipeline(message.payload)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err?.message ?? String(err) }));
  return true;
});
