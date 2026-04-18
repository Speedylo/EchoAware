import { CONFIG_STORE_KEY } from '../shared/constants.js';

export const DEFAULTS = {
  thresholdD: 0.6,
  minVideos: 5,
  windowDays: 14,
  inferenceEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
  modelVersion: 'all-MiniLM-L6-v2',
  userConsent: false,
};

/** @returns {Promise<typeof DEFAULTS>} */
export function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_STORE_KEY, (result) => {
      resolve({ ...DEFAULTS, ...(result[CONFIG_STORE_KEY] ?? {}) });
    });
  });
}

/** @param {Partial<typeof DEFAULTS>} partial */
export async function setConfig(partial) {
  const current = await getConfig();
  const merged = { ...current, ...partial };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CONFIG_STORE_KEY]: merged }, resolve);
  });
}
