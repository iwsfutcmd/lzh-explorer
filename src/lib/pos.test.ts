import { describe, expect, it } from 'vitest';
import type { Manifest, PosData } from './data';
import { toMatrix } from './data';
import { entropy, posColumns, profile } from './pos';

const pos: PosData = {
  source: 'test',
  upos: ['NOUN', 'VERB', 'PRON', 'SCONJ', 'PROPN'],
  tokens: 10,
  docs: [],
  items: { 之: [[3, 6], [2, 4]], 曰: [[1, 5]], 孟: [[4, 30], [0, 6], [1, 6]] },
  gloss: {},
};

describe('pos', () => {
  it('computes entropy in bits', () => {
    expect(entropy([5])).toBe(0);
    expect(entropy([1, 1])).toBeCloseTo(1, 12);
    expect(entropy([1, 1, 1, 1])).toBeCloseTo(2, 12);
    expect(entropy([])).toBe(0);
  });

  it('summarizes a form', () => {
    const p = profile(pos, '之')!;
    expect(p.n).toBe(10);
    expect(p.dist.map((d) => d.tag)).toEqual(['SCONJ', 'PRON']);
    expect(p.dist[0].share).toBeCloseTo(0.6);
    expect(p.entropy).toBeCloseTo(-(0.6 * Math.log2(0.6) + 0.4 * Math.log2(0.4)), 12);
    expect(profile(pos, '鳥')).toBeNull();
  });

  it('leaves proper-noun uses out of flexibility', () => {
    const p = profile(pos, '孟')!;
    expect(p.dist[0].tag).toBe('PROPN');
    expect(p.entropy).toBeCloseTo(1, 12); // NOUN 6 : VERB 6
  });

  it('aligns dominant tags with matrix items', () => {
    const manifest = { texts: [{ id: 't0', tokens: 10 }] } as unknown as Manifest;
    const m = toMatrix(
      { texts: ['t0'], items: ['之', '鳥', '曰', '孟'], cells: [[0, 1], [0, 1], [0, 1], [0, 1]] },
      manifest,
    );
    const cols = posColumns(m, pos);
    expect(Array.from(cols.dominant)).toEqual([3, -1, 1, 4]);
    expect(cols.share[0]).toBeCloseTo(0.6);
    expect(Number.isNaN(cols.share[1])).toBe(true);
    expect(Array.from(cols.n)).toEqual([10, 0, 5, 42]);
    // ranking share: non-PROPN only, and only with >= 10 such tokens
    expect(cols.sortShare[0]).toBeCloseTo(0.6);
    expect(Number.isNaN(cols.sortShare[2])).toBe(true);
    expect(cols.sortShare[3]).toBeCloseTo(0.5);
  });
});
