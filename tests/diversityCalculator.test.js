import { describe, it, expect } from 'vitest';
import { calculateSimpsonsDiversity } from '../src/background/diversityCalculator.js';

describe('calculateSimpsonsDiversity', () => {
  // ── Calibration (N < 5) ──────────────────────────────────────────────────
  it('returns calibrating=true and score=0 for empty input', () => {
    expect(calculateSimpsonsDiversity([])).toEqual({ score: 0, calibrating: true });
  });

  it('returns calibrating=true when total videos < 5', () => {
    const result = calculateSimpsonsDiversity([{ clusterId: 0, size: 4 }]);
    expect(result).toEqual({ score: 0, calibrating: true });
  });

  it('returns calibrating=false at exactly the 5-video threshold', () => {
    const result = calculateSimpsonsDiversity([{ clusterId: 0, size: 5 }]);
    expect(result.calibrating).toBe(false);
  });

  // ── Single cluster (maximum echo chamber) ───────────────────────────────
  it('returns score=0 for a single cluster (all videos in one topic)', () => {
    const result = calculateSimpsonsDiversity([{ clusterId: 0, size: 10 }]);
    expect(result.score).toBe(0);
    expect(result.calibrating).toBe(false);
  });

  // ── Perfect distribution ─────────────────────────────────────────────────
  it('returns score≈0.8 for 5 equal-sized clusters (10 videos each)', () => {
    const clusters = Array.from({ length: 5 }, (_, i) => ({ clusterId: i, size: 10 }));
    const { score, calibrating } = calculateSimpsonsDiversity(clusters);
    expect(calibrating).toBe(false);
    expect(score).toBeCloseTo(0.8, 10);
  });

  it('returns score≈0.5 for 2 equal-sized clusters', () => {
    const clusters = [{ clusterId: 0, size: 5 }, { clusterId: 1, size: 5 }];
    const { score } = calculateSimpsonsDiversity(clusters);
    expect(score).toBeCloseTo(0.5, 10);
  });

  // ── Uneven distribution ──────────────────────────────────────────────────
  it('returns a low score when one cluster dominates', () => {
    // 9 videos in cluster 0, 1 in cluster 1 → D ≈ 1 - (0.9²+0.1²) = 0.18
    const clusters = [{ clusterId: 0, size: 9 }, { clusterId: 1, size: 1 }];
    const { score } = calculateSimpsonsDiversity(clusters);
    expect(score).toBeCloseTo(0.18, 10);
  });

  // ── Score bounds ─────────────────────────────────────────────────────────
  it('score is always in [0, 1]', () => {
    const cases = [
      [{ clusterId: 0, size: 100 }],
      Array.from({ length: 10 }, (_, i) => ({ clusterId: i, size: 1 })),
      [{ clusterId: 0, size: 99 }, { clusterId: 1, size: 1 }],
    ];
    for (const input of cases) {
      const { score } = calculateSimpsonsDiversity(input);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});
