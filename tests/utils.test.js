import { describe, it, expect } from 'vitest';
import { euclideanDistance } from '../src/shared/utils.js';

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

