import { MIN_VIDEOS_CALIBRATION } from '../shared/constants.js';

/**
 * Unweighted Simpson's Diversity Index: D = 1 - Σ(nᵢ/N)²
 *
 * Returns 0 and a Calibration state when total videos < MIN_VIDEOS_CALIBRATION,
 * since there is not enough data for a meaningful score.
 *
 * @param {Array<{clusterId: number, size: number}>} clusterSizes
 * @returns {{ score: number, calibrating: boolean }}
 */
export function calculateSimpsonsDiversity(clusterSizes) {
  const N = clusterSizes.reduce((sum, c) => sum + c.size, 0);

  if (N < MIN_VIDEOS_CALIBRATION) {
    return { score: 0, calibrating: true };
  }

  const sumSquared = clusterSizes.reduce((sum, c) => sum + (c.size / N) ** 2, 0);
  return { score: 1 - sumSquared, calibrating: false };
}
