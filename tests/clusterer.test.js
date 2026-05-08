import { describe, it, expect } from 'vitest';
import { HDBSCANStrategy, runClustering } from '../src/offscreen/clusterer.js';

const strategy = new HDBSCANStrategy();

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a 3-D unit vector pointing toward `angle` degrees in the XY plane. */
function unitVec(angleDeg) {
  const r = (angleDeg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), 0];
}

/** Slightly perturb a vector to simulate near-duplicate points. */
function jitter(vec, amount = 0.01) {
  return vec.map(x => x + (Math.random() - 0.5) * amount);
}

// ── edge cases ────────────────────────────────────────────────────────────────

describe('HDBSCANStrategy.cluster — edge cases', () => {
  it('returns [] for empty input', async () => {
    expect(await strategy.cluster([])).toEqual([]);
  });

  it('assigns the single point to cluster 0', async () => {
    expect(await strategy.cluster([[1, 0, 0]])).toEqual([{ videoIndex: 0, clusterId: 0 }]);
  });

  it('assigns every point exactly once (no duplicates or gaps)', async () => {
    const embeddings = Array.from({ length: 5 }, (_, i) => [i * 0.1, 0, 0]);
    const result = await strategy.cluster(embeddings);
    const indices = result.map(r => r.videoIndex).sort((a, b) => a - b);
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('each result has videoIndex and clusterId properties', async () => {
    const result = await strategy.cluster([[1, 0], [0, 1]]);
    for (const r of result) {
      expect(r).toHaveProperty('videoIndex');
      expect(r).toHaveProperty('clusterId');
      expect(typeof r.videoIndex).toBe('number');
      expect(typeof r.clusterId).toBe('number');
    }
  });
});

// ── cluster structure ─────────────────────────────────────────────────────────

describe('HDBSCANStrategy.cluster — cluster structure', () => {
  it('puts tightly clustered points into the same cluster', async () => {
    // 4 points very close together, then 1 well-separated point
    const base = unitVec(0);
    const close = [jitter(base), jitter(base), jitter(base), jitter(base)];
    const far = [unitVec(180)];
    const embeddings = [...close, ...far];

    const result = await strategy.cluster(embeddings);
    const closeIds = result.slice(0, 4).map(r => r.clusterId);
    expect(new Set(closeIds).size).toBe(1);
  });

  it('separates two clearly distinct groups into different clusters', async () => {
    // Group A near angle=0°, Group B near angle=180°
    const groupA = [unitVec(0), jitter(unitVec(0)), jitter(unitVec(0))];
    const groupB = [unitVec(180), jitter(unitVec(180)), jitter(unitVec(180))];
    const embeddings = [...groupA, ...groupB];

    const result = await strategy.cluster(embeddings);
    expect(result).toHaveLength(6);

    const idsA = result.filter(r => r.videoIndex < 3).map(r => r.clusterId);
    const idsB = result.filter(r => r.videoIndex >= 3).map(r => r.clusterId);

    expect(new Set(idsA).size).toBe(1);
    expect(new Set(idsB).size).toBe(1);
    expect(idsA[0]).not.toBe(idsB[0]);
  });

  it('produces stable output for the same input', async () => {
    const embeddings = [unitVec(0), unitVec(90), unitVec(180), unitVec(270)];
    const r1 = await strategy.cluster(embeddings);
    const r2 = await strategy.cluster(embeddings);
    expect(r1).toEqual(r2);
  });
});

// ── runClustering ─────────────────────────────────────────────────────────────

describe('runClustering', () => {
  it('delegates to the default strategy and returns well-formed assignments', async () => {
    const result = await runClustering([unitVec(0), unitVec(90)]);
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r).toHaveProperty('videoIndex');
      expect(r).toHaveProperty('clusterId');
    }
  });
});
