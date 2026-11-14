// Corpus statistics computed in the browser from raw per-text counts.
//
// Everything is derived from the sparse item × text matrix and a selection of
// texts, so any sub-corpus a reader assembles gets the same treatment as the
// predefined corpora.

import type { Matrix } from './data';

export interface Selection {
  /** mask[t] = 1 iff text t is selected */
  mask: Uint8Array;
  /** selected text indices, ascending */
  texts: number[];
  /** share of selection tokens contributed by each text (0 if unselected) */
  share: Float64Array;
  /** character tokens in the selection */
  total: number;
  /** smallest share among selected texts (for DP normalization) */
  minShare: number;
}

export function makeSelection(textIndices: Iterable<number>, tokens: readonly number[]): Selection {
  const mask = new Uint8Array(tokens.length);
  for (const t of textIndices) mask[t] = 1;
  const texts: number[] = [];
  let total = 0;
  for (let t = 0; t < tokens.length; t++) {
    if (mask[t]) {
      texts.push(t);
      total += tokens[t];
    }
  }
  const share = new Float64Array(tokens.length);
  let minShare = 1;
  for (const t of texts) {
    share[t] = tokens[t] / total;
    minShare = Math.min(minShare, share[t]);
  }
  return { mask, texts, share, total, minShare };
}

export interface Freq {
  sel: Selection;
  /** occurrences of each item in the selection */
  count: Uint32Array;
  /** number of selected texts in which each item occurs */
  range: Uint16Array;
  /**
   * Gries' deviation of proportions, normalized (DPnorm; Gries 2008,
   * Lijffijt & Gries 2012): 0 = spread exactly like text sizes,
   * 1 = maximally concentrated. NaN when undefined (item absent, or fewer
   * than two texts selected).
   */
  dp: Float32Array;
  /** items with count > 0 */
  types: number;
  /** items with count = 1 */
  hapax: number;
  /** Σ count over all items (= sel.total for characters; larger for overlapping word n-grams) */
  itemTokens: number;
  /** item indices with count > 0, by descending count (ties: global order) */
  order: Uint32Array;
  /** competition rank ("1224") by count; 0 for absent items */
  rank: Uint32Array;
}

export function aggregate(m: Matrix, sel: Selection): Freq {
  const n = m.items.length;
  const count = new Uint32Array(n);
  const range = new Uint16Array(n);
  const dp = new Float32Array(n);
  const { mask, share } = sel;
  const multi = sel.texts.length > 1;
  const dpScale = multi ? 1 / (1 - sel.minShare) : NaN;
  let types = 0;
  let hapax = 0;
  let itemTokens = 0;

  for (let i = 0; i < n; i++) {
    const lo = m.offsets[i];
    const hi = m.offsets[i + 1];
    let f = 0;
    let r = 0;
    for (let k = lo; k < hi; k++) {
      if (mask[m.text[k]]) {
        f += m.count[k];
        r++;
      }
    }
    count[i] = f;
    range[i] = r;
    if (f === 0) {
      dp[i] = NaN;
      continue;
    }
    types++;
    if (f === 1) hapax++;
    itemTokens += f;
    if (!multi) {
      dp[i] = NaN;
      continue;
    }
    // DP = ½ Σ_t |v_t/f − s_t|. Texts without the item contribute s_t each,
    // which together is 1 − Σ_{t∋item} s_t; so only the item's cells are visited.
    let dev = 0;
    let covered = 0;
    for (let k = lo; k < hi; k++) {
      const t = m.text[k];
      if (mask[t]) {
        dev += Math.abs(m.count[k] / f - share[t]);
        covered += share[t];
      }
    }
    dp[i] = Math.min(1, Math.max(0, 0.5 * (dev + (1 - covered)) * dpScale));
  }

  const order = new Uint32Array(types);
  let j = 0;
  for (let i = 0; i < n; i++) if (count[i] > 0) order[j++] = i;
  // Items are stored in global-frequency order, so a stable sort on count
  // gives a deterministic tie-break.
  order.sort((a, b) => count[b] - count[a] || a - b);

  const rank = new Uint32Array(n);
  for (let p = 0; p < order.length; p++) {
    const i = order[p];
    rank[i] = p > 0 && count[order[p - 1]] === count[i] ? rank[order[p - 1]] : p + 1;
  }

  return { sel, count, range, dp, types, hapax, itemTokens, order, rank };
}

/** Occurrences per million tokens. */
export const perMillion = (count: number, total: number) => (total > 0 ? (count / total) * 1e6 : 0);

/**
 * Log-likelihood (G²) for a 2×2 contingency of an item's frequency in a target
 * (a of n1 tokens) vs. a reference (b of n2 tokens); Dunning 1993, Rayson &
 * Garside 2000. Signed: positive when the item is relatively more frequent in
 * the target.
 */
export function logLikelihood(a: number, b: number, n1: number, n2: number): number {
  const total = n1 + n2;
  if (total === 0 || a + b === 0) return 0;
  const e1 = (n1 * (a + b)) / total;
  const e2 = (n2 * (a + b)) / total;
  const g2 = 2 * ((a > 0 ? a * Math.log(a / e1) : 0) + (b > 0 ? b * Math.log(b / e2) : 0));
  return a / n1 >= b / n2 ? g2 : -g2;
}

/**
 * Log Ratio effect size (Hardie 2014): binary log of the ratio of relative
 * frequencies. A zero frequency is replaced by 0.5 so the value stays finite.
 */
export function logRatio(a: number, b: number, n1: number, n2: number): number {
  return Math.log2(((a || 0.5) / n1) / ((b || 0.5) / n2));
}

/** Critical G² values (1 d.f.). */
export const G2_CRITICAL = [
  { p: 0.05, g2: 3.84 },
  { p: 0.01, g2: 6.63 },
  { p: 0.001, g2: 10.83 },
  { p: 0.0001, g2: 15.13 },
] as const;

/**
 * Number of top-ranked items needed to cover each fraction of the tokens.
 * Only meaningful when item tokens partition the text (characters, not
 * overlapping word n-grams).
 */
export function coverage(freq: Freq, fractions: readonly number[]): number[] {
  const out: number[] = [];
  let cum = 0;
  let p = 0;
  const total = freq.itemTokens;
  for (const frac of fractions) {
    while (p < freq.order.length && cum < frac * total) cum += freq.count[freq.order[p++]];
    out.push(cum >= frac * total ? p : NaN);
  }
  return out;
}

/** Cumulative token share at each rank position (for coverage curves). */
export function cumulativeShare(freq: Freq): Float64Array {
  const out = new Float64Array(freq.order.length);
  let cum = 0;
  for (let p = 0; p < freq.order.length; p++) {
    cum += freq.count[freq.order[p]];
    out[p] = cum / freq.itemTokens;
  }
  return out;
}

/** Log-spaced sample of positions 0..n-1 (always includes both ends). */
export function logSample(n: number, points = 240): number[] {
  if (n <= points) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>([0, n - 1]);
  const step = Math.log(n) / points;
  for (let k = 0; k <= points; k++) out.add(Math.min(n - 1, Math.round(Math.exp(k * step)) - 1));
  return [...out].sort((a, b) => a - b);
}
