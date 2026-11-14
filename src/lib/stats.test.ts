import { describe, expect, it } from 'vitest';
import type { Manifest } from './data';
import { toMatrix } from './data';
import { aggregate, coverage, logLikelihood, logRatio, makeSelection } from './stats';

const texts = (sizes: number[]) =>
  ({ texts: sizes.map((tokens, i) => ({ id: `t${i}`, tokens })) }) as unknown as Manifest;

function matrix(rows: Record<string, number[]>, sizes: number[]) {
  const items = Object.keys(rows);
  const cells = items.map((k) => rows[k].flatMap((n, t) => (n ? [t, n] : [])));
  return toMatrix({ texts: sizes.map((_, i) => `t${i}`), items, cells }, texts(sizes));
}

describe('aggregate', () => {
  // Gries (2008: 415): a word occurring 1,2,3,4,5 times in five corpus parts
  // of 9,10,10,10,11 words has DP = 0.18.
  const sizes = [9, 10, 10, 10, 11];
  const m = matrix({ a: [1, 2, 3, 4, 5], b: [0, 0, 0, 0, 7], c: [9, 10, 10, 10, 11] }, sizes);

  it('computes Gries DP (normalized)', () => {
    const f = aggregate(m, makeSelection([0, 1, 2, 3, 4], sizes));
    expect(f.count[0]).toBe(15);
    expect(f.range[0]).toBe(5);
    expect(f.dp[0]).toBeCloseTo(0.18 / (1 - 0.18), 6);
    // perfectly proportional -> 0
    expect(f.dp[2]).toBeCloseTo(0, 6);
    // confined to the largest part: DP = 1 - 0.22, normalized by 1 - 0.18
    expect(f.dp[1]).toBeCloseTo(0.78 / 0.82, 6);
  });

  it('restricts to the selected texts', () => {
    const f = aggregate(m, makeSelection([0, 1], sizes));
    expect(f.sel.total).toBe(19);
    expect(Array.from(f.count)).toEqual([3, 0, 19]);
    expect(f.types).toBe(2);
    expect(Number.isNaN(f.dp[1])).toBe(true);
  });

  it('ranks with ties sharing a rank', () => {
    const m2 = matrix({ x: [5], y: [3], z: [3], w: [1] }, [12]);
    const f = aggregate(m2, makeSelection([0], [12]));
    expect(Array.from(f.rank)).toEqual([1, 2, 2, 4]);
    expect(Array.from(f.order)).toEqual([0, 1, 2, 3]);
    expect(f.hapax).toBe(1);
    // DP is undefined for a single text
    expect(Number.isNaN(f.dp[0])).toBe(true);
    expect(coverage(f, [0.5, 1])).toEqual([2, 4]);
  });
});

describe('keyness', () => {
  it('log-likelihood is zero for equal relative frequencies and signed otherwise', () => {
    expect(logLikelihood(10, 100, 1000, 10000)).toBeCloseTo(0, 9);
    expect(logLikelihood(20, 100, 1000, 10000)).toBeGreaterThan(0);
    expect(logLikelihood(5, 100, 1000, 10000)).toBeLessThan(0);
    // matches the closed form for a hand-checked case
    const a = 20, b = 100, n1 = 1000, n2 = 10000;
    const e1 = (n1 * (a + b)) / (n1 + n2), e2 = (n2 * (a + b)) / (n1 + n2);
    expect(logLikelihood(a, b, n1, n2)).toBeCloseTo(2 * (a * Math.log(a / e1) + b * Math.log(b / e2)), 9);
  });

  it('log ratio doubles per unit and survives zeros', () => {
    expect(logRatio(20, 10, 1000, 1000)).toBeCloseTo(1, 9);
    expect(logRatio(0, 8, 1000, 1000)).toBeCloseTo(-4, 9);
  });
});
