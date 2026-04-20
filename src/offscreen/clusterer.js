import Hdbscan from 'hdbscanjs';
import { ClusteringStrategy } from './clusteringStrategy.js';

const MIN_CLUSTER_SIZE = 2;

export class HDBSCANStrategy extends ClusteringStrategy {
  async cluster(embeddings) {
    if (embeddings.length === 0) return [];
    if (embeddings.length === 1) return [{ videoIndex: 0, clusterId: 0 }];

    const dataset = embeddings.map((emb, i) => ({ data: emb, opt: i }));
    const hdbscan = new Hdbscan(dataset, Hdbscan.distFunc.euclidean);
    const tree = hdbscan.getTree();

    const assignments = [];
    let nextClusterId = 0;

    function traverse(node) {
      if (node.isLeaf) {
        assignments.push({ videoIndex: node.opt[0], clusterId: nextClusterId++ });
        return;
      }
      const leftSize = node.left?.data.length ?? 0;
      const rightSize = node.right?.data.length ?? 0;
      if (leftSize >= MIN_CLUSTER_SIZE && rightSize >= MIN_CLUSTER_SIZE) {
        traverse(node.left);
        traverse(node.right);
      } else {
        const cId = nextClusterId++;
        for (const idx of node.opt) assignments.push({ videoIndex: idx, clusterId: cId });
      }
    }

    traverse(tree);
    return assignments;
  }
}

export const defaultStrategy = new HDBSCANStrategy();

export async function runClustering(embeddings) {
  return defaultStrategy.cluster(embeddings);
}
