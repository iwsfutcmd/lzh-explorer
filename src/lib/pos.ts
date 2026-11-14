// Part-of-speech profiles: per-form summaries and per-matrix lookup arrays.

import type { Matrix, PosData } from './data';

export interface PosProfile {
  /** tokens of this form in the treebank */
  n: number;
  /** [UPOS tag, count, share] by descending count */
  dist: { tag: string; count: number; share: number }[];
  /**
   * Word-class flexibility: Shannon entropy (bits) of the distribution over
   * tags other than PROPN. Name uses are lexical ambiguity, not flexibility.
   */
  entropy: number;
}

/** Tags left out of flexibility measures. */
const NOT_FLEXIBILITY = new Set(['PROPN']);

export function entropy(counts: readonly number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) h -= (c / n) * Math.log2(c / n);
  return h === 0 ? 0 : h; // avoid -0
}

export function profile(pos: PosData, form: string): PosProfile | null {
  const row = pos.items[form];
  if (!row?.length) return null;
  const n = row.reduce((a, [, c]) => a + c, 0);
  return {
    n,
    dist: row.map(([i, c]) => ({ tag: pos.upos[i], count: c, share: c / n })),
    entropy: entropy(row.filter(([i]) => !NOT_FLEXIBILITY.has(pos.upos[i])).map(([, c]) => c)),
  };
}

export interface PosColumns {
  /** UPOS index of the most frequent tag, -1 if the form is not in the treebank */
  dominant: Int8Array;
  /** share of that tag (NaN if absent) */
  share: Float32Array;
  /** treebank tokens of the form */
  n: Uint32Array;
  /**
   * Share of the most frequent tag among non-PROPN tokens, NaN with fewer
   * than MIN_TOKENS of them (for ranking by flexibility).
   */
  sortShare: Float32Array;
}

/** Fewer treebank tokens than this make a POS distribution too noisy to rank. */
export const MIN_TOKENS = 10;

const cache = new WeakMap<Matrix, PosColumns>();

/** Dominant-POS columns aligned with a matrix's items (cached). */
export function posColumns(m: Matrix, pos: PosData): PosColumns {
  const hit = cache.get(m);
  if (hit) return hit;
  const len = m.items.length;
  const out: PosColumns = {
    dominant: new Int8Array(len).fill(-1),
    share: new Float32Array(len).fill(NaN),
    n: new Uint32Array(len),
    sortShare: new Float32Array(len).fill(NaN),
  };
  m.items.forEach((item, i) => {
    const row = pos.items[item];
    if (!row?.length) return;
    const n = row.reduce((a, [, c]) => a + c, 0);
    out.dominant[i] = row[0][0];
    out.share[i] = row[0][1] / n;
    out.n[i] = n;
    let common = 0;
    let top = 0;
    for (const [t, c] of row) {
      if (NOT_FLEXIBILITY.has(pos.upos[t])) continue;
      common += c;
      top = Math.max(top, c);
    }
    if (common >= MIN_TOKENS) out.sortShare[i] = top / common;
  });
  cache.set(m, out);
  return out;
}
