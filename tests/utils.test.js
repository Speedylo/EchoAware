import { describe, it, expect } from 'vitest';
import { computeCentroid, euclideanDistance } from '../src/shared/utils.js';

// ── euclideanDistance ─────────────────────────────────────────────────────────

describe('euclideanDistance', () => {
  it('returns 0 for identical vectors', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('returns correct distance for 3-4-5 right triangle', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5, 10);
  });

  it('is symmetric', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(euclideanDistance(a, b)).toBeCloseTo(euclideanDistance(b, a), 10);
  });

  it('handles high-dimensional vectors (384-d)', () => {
    const a = new Array(384).fill(0);
    const b = new Array(384).fill(0);
    b[0] = 1;
    expect(euclideanDistance(a, b)).toBeCloseTo(1, 10);
  });

  it('handles vectors of all zeros', () => {
    expect(euclideanDistance([0, 0, 0], [0, 0, 0])).toBe(0);
  });
});

// ── computeCentroid ───────────────────────────────────────────────────────────

describe('computeCentroid', () => {
  it('returns the single vector unchanged', () => {
    expect(computeCentroid([[1, 2, 3]])).toEqual([1, 2, 3]);
  });

  it('averages two vectors', () => {
    expect(computeCentroid([[0, 0], [2, 4]])).toEqual([1, 2]);
  });

  it('averages three vectors correctly', () => {
    const result = computeCentroid([[1, 2], [3, 4], [5, 6]]);
    expect(result[0]).toBeCloseTo(3, 10);
    expect(result[1]).toBeCloseTo(4, 10);
  });

  it('output dimension matches input dimension', () => {
    const result = computeCentroid([[1, 2, 3, 4], [5, 6, 7, 8]]);
    expect(result).toHaveLength(4);
  });

  it('centroid of identical vectors is that vector', () => {
    const v = [0.5, 0.3, 0.2];
    const result = computeCentroid([v, v, v]);
    result.forEach((x, i) => expect(x).toBeCloseTo(v[i], 10));
  });

  it('centroid lies between opposite unit vectors', () => {
    const result = computeCentroid([[1, 0], [-1, 0]]);
    expect(result[0]).toBeCloseTo(0, 10);
    expect(result[1]).toBeCloseTo(0, 10);
  });
});
