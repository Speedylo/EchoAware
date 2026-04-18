export const DEFAULTS = {
  thresholdD: 0.6,
  minVideos: 5,
  windowDays: 14,
  inferenceEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
  modelVersion: 'all-MiniLM-L6-v2',
  userConsent: false,
};

export async function getConfig()        { throw new Error('Not implemented'); }
export async function setConfig(partial) { throw new Error('Not implemented'); }
