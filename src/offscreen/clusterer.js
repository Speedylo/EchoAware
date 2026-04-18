import { ClusteringStrategy } from './clusteringStrategy.js';
// import HDBSCAN from 'hdbscanjs';

export class HDBSCANStrategy extends ClusteringStrategy {
  async cluster(embeddings) {
    // TODO: instantiate HDBSCAN with minClusterSize, run on embeddings
    throw new Error('Not implemented');
  }
}

export const defaultStrategy = new HDBSCANStrategy();

export async function runClustering(embeddings) {
  return defaultStrategy.cluster(embeddings);
}
