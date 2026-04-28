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
