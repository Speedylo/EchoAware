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

// Turn an OpenRouter error payload into a short user-facing reason.
// Why: the raw body is JSON with nested fields that nobody can read in a popup.
function friendlyOpenRouterError(status, rawBody) {
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch { parsed = null; }
  const message = parsed?.error?.message ?? parsed?.message ?? rawBody ?? '';

  if (status === 429 || /rate.?limit/i.test(message)) {
    return 'Rate limit reached — free-tier daily quota exhausted. Try again tomorrow or add credits to your OpenRouter account.';
  }
  if (status === 401 || status === 403) {
    return 'OpenRouter rejected the API key. Check that it is valid in the extension settings.';
  }
  if (status >= 500) {
    return 'OpenRouter service error — please try again in a moment.';
  }
  return message ? `OpenRouter error: ${message}` : `OpenRouter returned HTTP ${status}.`;
}

export async function callOpenRouter(representativeTitles) {
  const config = await getConfig();
  if (!config.openRouterApiKey) {
    throw new Error('No OpenRouter API key configured. Set one in the extension settings.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response;
  try {
    response = await fetch(config.inferenceEndpoint, {
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
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('OpenRouter request timed out — the service took too long to respond.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(friendlyOpenRouterError(response.status, await response.text()));
  }
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response.');
  try {
    return JSON.parse(content);
  } catch {
    // Some models wrap JSON in ```json fences despite instructions — strip and retry once.
    const stripped = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    return JSON.parse(stripped);
  }
}
