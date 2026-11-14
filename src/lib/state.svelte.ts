// Application state: loaded data, view state (mirrored in the URL hash), and
// the analysis derived from them.

import { collationPositions } from './collation';
import {
  CORPUS_IDS,
  loadManifest,
  loadMatrix,
  loadUnihan,
  type Manifest,
  type Matrix,
  type Unihan,
} from './data';
import { entryMatches, parseQuery, parseRS, pinyinKey } from './han';
import { settings } from './settings.svelte';
import { aggregate, cumulativeShare, logLikelihood, logRatio, makeSelection, type Freq } from './stats';

// ------------------------------------------------------------------ data ----

class Model {
  manifest = $state.raw<Manifest | null>(null);
  unihan = $state.raw<Unihan | null>(null);
  chars = $state.raw<Matrix | null>(null);
  words = $state.raw<Matrix | null>(null);
  wordsStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  error = $state<string | null>(null);

  tokens = $derived(this.manifest?.texts.map((t) => t.tokens) ?? []);
  textIndex = $derived(new Map(this.manifest?.texts.map((t, i) => [t.id, i]) ?? []));

  async init() {
    try {
      const manifest = await loadManifest();
      const [chars, unihan] = await Promise.all([loadMatrix('chars', manifest), loadUnihan()]);
      this.manifest = manifest;
      this.chars = chars;
      this.unihan = unihan;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async loadWords() {
    if (!this.manifest || this.wordsStatus === 'loading' || this.wordsStatus === 'ready') return;
    this.wordsStatus = 'loading';
    try {
      this.words = await loadMatrix('words', this.manifest);
      this.wordsStatus = 'ready';
    } catch (e) {
      this.wordsStatus = 'error';
      this.error = e instanceof Error ? e.message : String(e);
    }
  }
}

export const model = new Model();

// ------------------------------------------------------------ view state ----

export type View = 'chars' | 'words' | 'about';
export type SortKey = 'count' | 'item' | 'range' | 'dp' | 'refIpm' | 'logRatio' | 'g2';
export type Display = 'table' | 'grid';
export const PRESETS = ['all', ...CORPUS_IDS] as const;

const DEFAULTS = {
  view: 'chars' as View,
  corpus: ['all'],
  ref: [] as string[],
  q: '',
  block: '',
  radical: '',
  strokesMin: null as number | null,
  strokesMax: null as number | null,
  minCount: 1,
  lengths: [2, 3, 4],
  sortKey: 'count' as SortKey,
  sortDir: 'desc' as 'asc' | 'desc',
  display: 'table' as Display,
  sel: null as string | null,
};

const SORT_KEYS: SortKey[] = ['count', 'item', 'range', 'dp', 'refIpm', 'logRatio', 'g2'];

class AppState {
  view = $state(DEFAULTS.view);
  /** corpus tokens: 'all', a corpus id, or text ids (union) */
  corpus = $state<string[]>(DEFAULTS.corpus);
  /** reference tokens; [] = no comparison, 'rest' = texts not in the corpus */
  ref = $state<string[]>(DEFAULTS.ref);
  q = $state(DEFAULTS.q);
  block = $state(DEFAULTS.block);
  radical = $state(DEFAULTS.radical);
  strokesMin = $state(DEFAULTS.strokesMin);
  strokesMax = $state(DEFAULTS.strokesMax);
  minCount = $state(DEFAULTS.minCount);
  lengths = $state(DEFAULTS.lengths);
  sortKey = $state(DEFAULTS.sortKey);
  sortDir = $state(DEFAULTS.sortDir);
  display = $state(DEFAULTS.display);
  sel = $state(DEFAULTS.sel);

  resetFilters() {
    this.block = DEFAULTS.block;
    this.radical = DEFAULTS.radical;
    this.strokesMin = DEFAULTS.strokesMin;
    this.strokesMax = DEFAULTS.strokesMax;
    this.minCount = DEFAULTS.minCount;
    this.lengths = [...DEFAULTS.lengths];
  }

  setSort(key: SortKey) {
    if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.sortKey = key;
      this.sortDir = key === 'item' ? 'asc' : 'desc';
    }
  }

  /** Navigate to an item, switching between the character and word views. */
  open(item: string) {
    const view: View = [...item].length > 1 ? 'words' : 'chars';
    if (view !== this.view) {
      this.view = view;
      this.q = '';
    }
    this.sel = item;
  }

  toHash(): string {
    const p = new URLSearchParams();
    const list = (a: readonly (string | number)[]) => a.join(',');
    if (list(this.corpus) !== list(DEFAULTS.corpus)) p.set('c', list(this.corpus));
    if (this.ref.length) p.set('r', list(this.ref));
    if (this.q) p.set('q', this.q);
    if (this.block) p.set('b', this.block);
    if (this.radical) p.set('rad', this.radical);
    if (this.strokesMin != null || this.strokesMax != null) p.set('s', `${this.strokesMin ?? ''}-${this.strokesMax ?? ''}`);
    if (this.minCount !== DEFAULTS.minCount) p.set('min', String(this.minCount));
    if (list(this.lengths) !== list(DEFAULTS.lengths)) p.set('len', list(this.lengths));
    if (this.sortKey !== DEFAULTS.sortKey || this.sortDir !== DEFAULTS.sortDir)
      p.set('sort', (this.sortDir === 'desc' ? '-' : '') + this.sortKey);
    if (this.display !== DEFAULTS.display) p.set('d', this.display);
    if (this.sel) p.set('sel', this.sel);
    const qs = p.toString();
    return `#/${this.view}${qs ? '?' + qs : ''}`;
  }

  fromHash(hash: string) {
    const m = hash.match(/^#\/(\w+)(?:\?(.*))?$/);
    const view = m?.[1] as View | undefined;
    const p = new URLSearchParams(m?.[2] ?? '');
    const list = (s: string | null) => (s ? s.split(',').filter(Boolean) : null);
    this.view = view && ['chars', 'words', 'about'].includes(view) ? view : DEFAULTS.view;
    this.corpus = list(p.get('c')) ?? [...DEFAULTS.corpus];
    this.ref = list(p.get('r')) ?? [];
    this.q = p.get('q') ?? '';
    this.block = p.get('b') ?? '';
    this.radical = p.get('rad') ?? '';
    const [smin, smax] = (p.get('s') ?? '-').split('-');
    this.strokesMin = smin ? Number(smin) : null;
    this.strokesMax = smax ? Number(smax) : null;
    this.minCount = Math.max(0, Number(p.get('min') ?? DEFAULTS.minCount) || 0);
    const len = list(p.get('len'))?.map(Number).filter((n) => n >= 2 && n <= 4);
    this.lengths = len?.length ? len : [...DEFAULTS.lengths];
    const sort = p.get('sort') ?? '-count';
    const key = sort.replace(/^-/, '') as SortKey;
    this.sortKey = SORT_KEYS.includes(key) ? key : DEFAULTS.sortKey;
    this.sortDir = sort.startsWith('-') ? 'desc' : 'asc';
    this.display = p.get('d') === 'grid' ? 'grid' : 'table';
    this.sel = p.get('sel');
  }
}

export const app = new AppState();

/** Resolve corpus tokens to sorted text indices. */
export function resolveTexts(tokens: readonly string[], target: readonly number[] = []): number[] {
  const manifest = model.manifest;
  if (!manifest) return [];
  const out = new Set<number>();
  for (const tok of tokens) {
    if (tok === 'all') manifest.texts.forEach((_, i) => out.add(i));
    else if (tok === 'rest') {
      const inTarget = new Set(target);
      manifest.texts.forEach((_, i) => inTarget.has(i) || out.add(i));
    } else if ((CORPUS_IDS as readonly string[]).includes(tok)) {
      manifest.texts.forEach((t, i) => t.corpora.includes(tok as never) && out.add(i));
    } else {
      const i = model.textIndex.get(tok);
      if (i !== undefined) out.add(i);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// -------------------------------------------------------------- analysis ----

export interface Keyness {
  refCount: Uint32Array;
  refTotal: number;
  lr: Float32Array;
  g2: Float32Array;
}

class Analysis {
  matrix = $derived(app.view === 'words' ? model.words : app.view === 'chars' ? model.chars : null);
  targetTexts = $derived(resolveTexts(app.corpus));
  refTexts = $derived(app.ref.length ? resolveTexts(app.ref, this.targetTexts) : null);
  overlap = $derived.by(() => {
    if (!this.refTexts) return false;
    const t = new Set(this.targetTexts);
    return this.refTexts.some((i) => t.has(i));
  });

  freq = $derived.by<Freq | null>(() => {
    if (!this.matrix || !this.targetTexts.length) return null;
    return aggregate(this.matrix, makeSelection(this.targetTexts, model.tokens));
  });

  refFreq = $derived.by<Freq | null>(() => {
    if (!this.matrix || !this.refTexts?.length) return null;
    return aggregate(this.matrix, makeSelection(this.refTexts, model.tokens));
  });

  keyness = $derived.by<Keyness | null>(() => {
    const f = this.freq;
    const r = this.refFreq;
    if (!f || !r) return null;
    const n = f.count.length;
    const lr = new Float32Array(n);
    const g2 = new Float32Array(n);
    const n1 = f.sel.total;
    const n2 = r.sel.total;
    for (let i = 0; i < n; i++) {
      const a = f.count[i];
      const b = r.count[i];
      if (a === 0 && b === 0) {
        lr[i] = NaN;
        g2[i] = NaN;
        continue;
      }
      lr[i] = logRatio(a, b, n1, n2);
      g2[i] = logLikelihood(a, b, n1, n2);
    }
    return { refCount: r.count, refTotal: n2, lr, g2 };
  });

  /** Cumulative token share for each item, by its rank position (characters only). */
  cumulative = $derived.by<Float64Array | null>(() => {
    const f = this.freq;
    if (!f || app.view !== 'chars') return null;
    const byPos = cumulativeShare(f);
    const out = new Float64Array(f.count.length).fill(NaN);
    for (let p = 0; p < f.order.length; p++) out[f.order[p]] = byPos[p];
    return out;
  });

  #pinyinKeys: string[] | null = null;
  #pinyinFor: Matrix | null = null;
  pinyinKeys(m: Matrix): string[] {
    if (this.#pinyinFor !== m || !this.#pinyinKeys) {
      const unihan = model.unihan ?? {};
      this.#pinyinKeys = m.items.map((w) => pinyinKey(w, unihan));
      this.#pinyinFor = m;
    }
    return this.#pinyinKeys;
  }

  /** Items passing search and filters, sorted. */
  results = $derived.by<Uint32Array>(() => {
    const m = this.matrix;
    const f = this.freq;
    const unihan = model.unihan;
    const manifest = model.manifest;
    if (!m || !f || !unihan || !manifest) return new Uint32Array();
    const r = this.refFreq;
    const isWords = app.view === 'words';

    // --- search
    const parts = parseQuery(app.q);
    const hanText = parts.flatMap((p) => (p.kind === 'han' ? [p.text] : p.kind === 'codepoint' ? [p.char] : []));
    const other = parts.filter((p) => p.kind !== 'han' && p.kind !== 'codepoint');
    const hanChars = new Set(hanText.flatMap((s) => [...s]));
    const latinJoined = other.flatMap((p) => (p.kind === 'latin' ? [p.folded] : [])).join('');
    const keys = isWords && latinJoined ? this.pinyinKeys(m) : null;
    const searching = parts.length > 0;

    // --- filters
    const block = !isWords && app.block ? manifest.blocks.find((b) => b.name === app.block) : undefined;
    const radical = !isWords && app.radical ? Number(app.radical) : 0;
    const smin = !isWords ? app.strokesMin : null;
    const smax = !isWords ? app.strokesMax : null;
    const lengths = isWords ? new Set(app.lengths) : null;
    const minCount = app.minCount;

    const out: number[] = [];
    for (let i = 0; i < m.items.length; i++) {
      const c = f.count[i] + (r ? r.count[i] : 0);
      if (c === 0 || c < minCount) continue;
      const item = m.items[i];
      if (lengths && !lengths.has(cpLength(item))) continue;
      if (!isWords) {
        if (block) {
          const cp = item.codePointAt(0)!;
          if (cp < block.first || cp > block.last) continue;
        }
        if (radical || smin != null || smax != null) {
          const e = unihan[item];
          if (radical && parseRS(e?.rs)?.number !== radical) continue;
          if (smin != null && !(e?.ts != null && e.ts >= smin)) continue;
          if (smax != null && !(e?.ts != null && e.ts <= smax)) continue;
        }
      }
      if (searching) {
        let hit = false;
        if (isWords) {
          hit = hanText.some((s) => item.includes(s)) || (!!keys && !!latinJoined && keys[i].startsWith(latinJoined));
        } else {
          hit = hanChars.has(item) || other.some((p) => entryMatches(unihan[item], p));
        }
        if (!hit) continue;
      }
      out.push(i);
    }

    // --- sort
    const dir = app.sortDir === 'asc' ? 1 : -1;
    const k = this.keyness;
    let key: ArrayLike<number> | null = null;
    switch (app.sortKey) {
      case 'count':
        key = f.count;
        break;
      case 'range':
        key = f.range;
        break;
      case 'dp':
        key = f.dp;
        break;
      case 'refIpm':
        key = k?.refCount ?? null;
        break;
      case 'logRatio':
        key = k?.lr ?? null;
        break;
      case 'g2':
        key = k?.g2 ?? null;
        break;
      case 'item':
        key = collationPositions(m, settings.collation, unihan);
        break;
    }
    const arr = Uint32Array.from(out);
    if (key) {
      const kk = key;
      arr.sort((a, b) => {
        const x = kk[a];
        const y = kk[b];
        // NaN (undefined statistic) always sorts last
        if (Number.isNaN(x)) return Number.isNaN(y) ? a - b : 1;
        if (Number.isNaN(y)) return -1;
        return (x - y) * dir || a - b;
      });
    }
    return arr;
  });
}

export const analysis = new Analysis();

/** Length in code points (not UTF-16 units), for supplementary-plane Han. */
function cpLength(s: string): number {
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) n--;
  }
  return n;
}

// Frequencies over each predefined corpus, cached per matrix (used for the
// per-corpus comparison in the details panel).
const corpusCache = new WeakMap<Matrix, Map<string, Freq>>();
export function presetFreq(m: Matrix, preset: string): Freq {
  let byPreset = corpusCache.get(m);
  if (!byPreset) corpusCache.set(m, (byPreset = new Map()));
  let f = byPreset.get(preset);
  if (!f) {
    f = aggregate(m, makeSelection(resolveTexts([preset]), model.tokens));
    byPreset.set(preset, f);
  }
  return f;
}

/** Texts in reading order: early texts by pinyin, histories by date, then novels. */
export function textOrder(manifest: Manifest): number[] {
  const coll = new Intl.Collator('en');
  const rank = (i: number) => {
    const c = manifest.texts[i].corpora;
    return c.includes('zhengshi') ? 1 : c.includes('loewe') ? 0 : 2;
  };
  return manifest.texts
    .map((_, i) => i)
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const ta = manifest.texts[a];
      const tb = manifest.texts[b];
      if (ra === 1) return (ta.year ?? 0) - (tb.year ?? 0);
      if (ra === 0) return coll.compare(ta.pinyin, tb.pinyin);
      return a - b;
    });
}
