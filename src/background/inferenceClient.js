import { getConfig } from '../storage/configStore.js';

const CLIENT_VERSION = '0.3.0';

function friendlyError(status, parsed) {
  const error = parsed?.error ?? '';
  const message = parsed?.message ?? '';

  if (status === 429) {
    const scope = parsed?.scope === 'token' ? 'this install' : 'this network';
    return `Rate limit reached for ${scope} — try again tomorrow.`;
  }
  if (status === 503 && error === 'budget_exhausted') {
    return message || 'Daily inference budget exhausted. Try again tomorrow.';
  }
  if (status === 503 && error === 'service_disabled') {
    return 'EchoAware suggestions are temporarily disabled. Please try again later.';
  }
  if (status === 503 && error === 'upstream_error') {
    return 'Inference service is having trouble — please try again in a moment.';
  }
  if (status === 426) {
    return 'This extension version is no longer supported. Please update EchoAware.';
  }
  if (status === 401) {
    return 'EchoAware install token was rejected. Try reinstalling the extension.';
  }
  if (status >= 500) {
    return 'Inference service error — please try again in a moment.';
  }
  return `Inference request failed (HTTP ${status}).`;
}

// Tries 3 JSON-recovery strategies — same fallbacks the old OpenRouter client
// used, kept because Workers AI can still ignore json_schema on some models.
function parseLooseJson(content) {
  try { return JSON.parse(content); } catch {}

  const stripped = content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(stripped); } catch {}

  const block = stripped.match(/\{[\s\S]*\}/)?.[0];
  if (block) {
    const repaired = block.replace(/"([^"]+)"\s*=\s*/g, '"$1": ');
    try { return JSON.parse(repaired); } catch {}
  }
  throw new Error('Inference response could not be parsed as JSON.');
}

export async function callInference(representativeTitles) {
  const config = await getConfig();
  if (!config.installToken) {
    throw new Error('Install token missing — extension storage is misconfigured.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response;
  try {
    response = await fetch(config.inferenceEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Install-Token': config.installToken,
        'X-Client-Version': CLIENT_VERSION,
      },
      body: JSON.stringify({
        titles: representativeTitles,
        clientVersion: CLIENT_VERSION,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Inference request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let parsed;
    try { parsed = await response.json(); } catch { parsed = null; }
    throw new Error(friendlyError(response.status, parsed));
  }

  // Worker already returns { topicLabel, escapeQueries: [{ queryText }, …] }
  // — but keep the JSON-repair safety net in case a future contract emits text.
  const ct = response.headers.get('Content-Type') ?? '';
  if (ct.includes('application/json')) {
    return await response.json();
  }
  return parseLooseJson(await response.text());
}
