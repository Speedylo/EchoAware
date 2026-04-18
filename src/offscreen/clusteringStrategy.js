/**
 * ClusteringStrategy interface.
 * Concrete implementations (e.g. HDBSCANStrategy) extend this class.
 * Swap algorithms by injecting a different subclass — no changes to offscreen.js needed.
 */
export class ClusteringStrategy {
  /**
   * @param {number[][]} embeddings  Array of 384-float vectors
   * @returns {Promise<Array<{videoIndex: number, clusterId: number}>>}
   */
  async cluster(embeddings) {
    throw new Error('ClusteringStrategy.cluster() must be implemented by subclass');
  }
}
