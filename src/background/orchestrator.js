import { MSG_VIDEO_NAVIGATED } from '../shared/messageTypes.js';
import { runAnalysisPipeline } from './analysisPipeline.js';

export async function handleMessage(message, sender, sendResponse) {
  switch (message.type) {
    case MSG_VIDEO_NAVIGATED:
      await runAnalysisPipeline(message.payload);
      sendResponse({ ok: true });
      break;
    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
  }
}

export async function triggerBadgeAlert(score)             { throw new Error('Not implemented'); }
export async function callOpenRouter(representativeTitles) { throw new Error('Not implemented'); }
