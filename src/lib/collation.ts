// Orderings of Han characters (and, character by character, of words).

import type { Matrix, Unihan } from './data';
import { codepoint, parseRS } from './han';
import type { Collation } from './settings.svelte';

const ICU: Partial<Record<Collation, string>> = {
  pinyin: 'zh-u-co-pinyin',
  stroke: 'zh-u-co-stroke',
  zhuyin: 'zh-u-co-zhuyin',
  ko: 'ko',
  ja: 'ja',
};

function charComparator(kind: Collation, unihan: Unihan): (a: string, b: string) => number {
  const icu = ICU[kind];
  if (icu) {
    const collator = new Intl.Collator(icu);
    return (a, b) => collator.compare(a, b) || codepoint(a) - codepoint(b);
  }
  if (kind === 'radical') {
    const key = (c: string) => {
      const rs = parseRS(unihan[c]?.rs);
      return rs ? rs.number * 1000 + rs.residual + 100 : 1e9;
    };
    return (a, b) => key(a) - key(b) || codepoint(a) - codepoint(b);
  }
  return (a, b) => codepoint(a) - codepoint(b);
}

const cache = new WeakMap<Matrix, Map<Collation, Uint32Array>>();

/**
 * Position of every item of `m` in the given order. Words are ordered
 * character by character using the order of single characters. That keeps
 * sorting 200k words fast, and for strings made only of Han characters (each
 * with its own primary weight in these tailorings) it gives ICU's order.
 */
export function collationPositions(m: Matrix, kind: Collation, unihan: Unihan): Uint32Array {
  let byKind = cache.get(m);
  if (!byKind) cache.set(m, (byKind = new Map()));
  const hit = byKind.get(kind);
  if (hit) return hit;

  const n = m.items.length;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  if (kind !== 'frequency') {
    const chars = new Set<string>();
    for (const item of m.items) for (const c of item) chars.add(c);
    const sortedChars = [...chars].sort(charComparator(kind, unihan));
    const charPos = new Map(sortedChars.map((c, i) => [c, i]));
    const keys = m.items.map((item) => Array.from(item, (c) => charPos.get(c)!));
    order.sort((a, b) => {
      const ka = keys[a];
      const kb = keys[b];
      for (let j = 0; j < Math.min(ka.length, kb.length); j++) if (ka[j] !== kb[j]) return ka[j] - kb[j];
      return ka.length - kb.length || a - b;
    });
  }
  const pos = new Uint32Array(n);
  for (let p = 0; p < n; p++) pos[order[p]] = p;
  byKind.set(kind, pos);
  return pos;
}
