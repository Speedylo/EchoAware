import { getConfig } from '../storage/configStore.js';
import { getStorageManager } from '../storage/StorageManager.js';

const SESSION_ID_KEY = 'echoaware_session_id';

export async function triggerBadgeAlert(score) {
  const config = await getConfig();
  const pct = Math.round(score * 100);
  const thresholdPct = Math.round(config.thresholdD * 100);
  if (pct < thresholdPct) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
    chrome.action.setTitle?.({ title: 'EchoAware — echo chamber detected' });
  } else if (pct < 80) {
    chrome.action.setBadgeText({ text: '~' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
    chrome.action.setBadgeTextColor?.({ color: '#FFFFFF' });
    chrome.action.setTitle?.({ title: 'EchoAware — borderline diversity' });
  } else {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle?.({ title: 'EchoAware' });
  }
}

// Re-applies the toolbar badge from the persisted session state.
// Why: MV3 service workers are torn down at idle and the badge resets when the
// extension is reloaded, so without this the alert cue silently disappears
// until the user watches another video. Called on every Service Worker startup.
export async function syncBadgeFromState() {
  const sessionId = await new Promise((resolve) => {
    chrome.storage.local.get(SESSION_ID_KEY, (r) => resolve(r[SESSION_ID_KEY] ?? null));
  });
  if (!sessionId) return;
  const storage = await getStorageManager();
  const state = await storage.getSessionState(sessionId);
  if (!state || state.alertState === 'calibrating') {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle?.({ title: 'EchoAware' });
    return;
  }
  await triggerBadgeAlert(state.diversityScore);
}

// Display an appropriate message to the user when OpenRouter returns an error
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
        model: config.chatModel,
        messages: [
          {
            role: 'system',
            content:
              'You analyse YouTube echo chambers and suggest alternative content. Always reply with valid JSON only, no markdown fences.',
          },
          {
            role: 'user',
            content:
              `The user keeps watching: ${representativeTitles.map(t => `"${t}"`).join(', ')}. ` +
              'Identify the dominant topic and suggest 3 concise YouTube search queries to diversify their feed. ' +
              'Rules: each query must be 3–7 words, sentence case (capitalise first word only), no trailing punctuation. ' +
              'Reply in this exact JSON shape: ' +
              '{"topicLabel":"...","escapeQueries":[{"queryText":"..."},{"queryText":"..."},{"queryText":"..."}]}',
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

  // Attempt 1: direct parse.
  try { return JSON.parse(content); } catch {}

  // Attempt 2: strip ```json fences some models add despite instructions.
  const stripped = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(stripped); } catch {}

  // Attempt 3: extract the first {...} block, then repair = → : (some models emit
  // Python/JS-style dict syntax instead of JSON).
  const block = stripped.match(/\{[\s\S]*\}/)?.[0];
  if (block) {
    const repaired = block.replace(/"([^"]+)"\s*=\s*/g, '"$1": ');
    try { return JSON.parse(repaired); } catch {}
  }

  throw new Error('OpenRouter returned a response that could not be parsed as JSON.');
}
