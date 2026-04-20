import { MSG_VIDEO_NAVIGATED } from '../shared/messageTypes.js';
import { getConfig } from '../storage/configStore.js';
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

export async function triggerBadgeAlert(score) {
  const config = await getConfig();
  if (score < config.thresholdD) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

export async function callOpenRouter(representativeTitles) {
  const config = await getConfig();
  const response = await fetch(config.inferenceEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openRouterApiKey}`,
      'HTTP-Referer': 'chrome-extension://echoaware',
      'X-Title': 'EchoAware',
    },
    body: JSON.stringify({
      models: [config.chatModel, 'openrouter/free'],
      messages: [
        {
          role: 'system',
          content:
            'You detect echo chambers in YouTube viewing patterns and suggest diverse alternative content. Always reply with valid JSON only.',
        },
        {
          role: 'user',
          content:
            `I keep watching videos about these topics: ${representativeTitles.join(', ')}. ` +
            'Identify the main topic and give me 3 search queries to diversify my feed. ' +
            'Reply in this exact JSON shape: ' +
            '{"topicLabel":"...", "escapeQueries":[{"queryText":"..."},{"queryText":"..."},{"queryText":"..."}]}',
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
  const body = await response.json();
  return JSON.parse(body.choices[0].message.content);
}
