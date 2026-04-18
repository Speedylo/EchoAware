import { describe, it, expect } from 'vitest';
import { calculateSimpsonsDiversity } from '../src/background/diversityCalculator.js';

describe('calculateSimpsonsDiversity', () => {
  it('returns 0 for a single cluster', () => {
    expect(calculateSimpsonsDiversity([{ clusterId: 0, size: 10 }])).toBe(0);
  });
  it('returns ~0.8 for 5 equal-sized clusters', () => {
    const c = Array.from({ length: 5 }, (_, i) => ({ clusterId: i, size: 2 }));
    expect(calculateSimpsonsDiversity(c)).toBeCloseTo(0.8, 5);
  });
  it('returns 0 for empty input', () => {
    expect(calculateSimpsonsDiversity([])).toBe(0);
  });
});
