import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.backends.onnx.wasm.numThreads = 1;

let _extractor = null;

export async function getEmbedding(text) {
  if (!_extractor) {
    _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await _extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
