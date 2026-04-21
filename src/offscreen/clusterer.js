import { ClusteringStrategy } from './clusteringStrategy.js';
import { euclideanDistance } from '../shared/utils.js';

// Threshold tuned for L2-normalized MiniLM embeddings.
// euclidean ≈ sqrt(2 - 2·cos); 1.0 ≈ cosine similarity 0.5 — "related topic".
const DISTANCE_THRESHOLD = 1.0;

export class HDBSCANStrategy extends ClusteringStrategy {
  async cluster(embeddings) {
    if (embeddings.length === 0) return [];
    if (embeddings.length === 1) return [{ videoIndex: 0, clusterId: 0 }];

    const parent = embeddings.map((_, i) => i);
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        if (euclideanDistance(embeddings[i], embeddings[j]) < DISTANCE_THRESHOLD) {
          parent[find(i)] = find(j);
        }
      }
    }

    const rootToId = new Map();
    let nextId = 0;
    return embeddings.map((_, i) => {
      const root = find(i);
      if (!rootToId.has(root)) rootToId.set(root, nextId++);
      return { videoIndex: i, clusterId: rootToId.get(root) };
    });
  }
}

export const defaultStrategy = new HDBSCANStrategy();

export async function runClustering(embeddings) {
  return defaultStrategy.cluster(embeddings);
}
