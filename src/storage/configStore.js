import { CONFIG_STORE_KEY } from '../shared/constants.js';

export const DEFAULTS = {
  thresholdD: 0.7,
  inferenceEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
  chatModel: 'openai/gpt-oss-120b:free',
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? '',
};

/** @returns {Promise<typeof DEFAULTS>} */
export function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_STORE_KEY, (result) => {
      resolve({ ...DEFAULTS, ...(result[CONFIG_STORE_KEY] ?? {}) });
    });
  });
}
