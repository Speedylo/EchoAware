import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let _extractor = null;

export async function getEmbedding(text) {
  if (!_extractor) {
    _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await _extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
