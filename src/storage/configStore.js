import { CONFIG_STORE_KEY } from '../shared/constants.js';

// Build-time constant injected by build.js; defaults to staging during dev.
const WORKER_URL =
  (typeof process !== 'undefined' && process.env?.WORKER_URL) ||
  'https://echoaware-api-staging.younes-rahati.workers.dev/v1/escape-queries';

export const DEFAULTS = {
  thresholdD: 0.7,
  inferenceEndpoint: WORKER_URL,
  installToken: '',
};

/**
 * Reads config, generating and persisting an installToken on first read.
 * @returns {Promise<typeof DEFAULTS>}
 */
export function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_STORE_KEY, (result) => {
      const stored = result[CONFIG_STORE_KEY] ?? {};
      const merged = { ...DEFAULTS, ...stored };

      if (!merged.installToken) {
        merged.installToken = crypto.randomUUID();
        chrome.storage.local.set(
          { [CONFIG_STORE_KEY]: { ...stored, installToken: merged.installToken } },
          () => resolve(merged),
        );
        return;
      }
      resolve(merged);
    });
  });
}
