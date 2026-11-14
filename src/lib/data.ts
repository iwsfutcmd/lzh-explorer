// Types for, and loaders of, the files written by pipeline/lzh_pipeline/build.py.

export interface SourceInfo {
  id: string;
  creator: string;
  title: string;
  publisher: string;
  year: number;
  doi?: string;
  url: string;
  license: string;
  licenseUrl: string;
  changes: string;
}

export type CorpusId = 'loewe' | 'zhengshi' | 'xiaoshuo';
export const CORPUS_IDS: readonly CorpusId[] = ['loewe', 'zhengshi', 'xiaoshuo'];

export interface CorpusInfo {
  id: CorpusId;
  texts: string[];
  source: string;
}

export interface TextInfo {
  id: string;
  /** Normalized traditional-character title. */
  title: string;
  /** Title exactly as in the upstream dataset. */
  sourceTitle: string;
  pinyin: string;
  en: string;
  corpora: CorpusId[];
  /** Character tokens in this text. */
  tokens: number;
  /** Distinct characters in this text. */
  types: number;
  year?: number;
  origin?: string;
  note?: string;
}

export interface BlockInfo {
  first: number;
  last: number;
  name: string;
}

export interface Manifest {
  schema: number;
  unicodeVersion: string;
  sources: SourceInfo[];
  corpora: CorpusInfo[];
  texts: TextInfo[];
  blocks: BlockInfo[];
  radicals: Record<string, string>;
}

export interface UnihanEntry {
  rs?: string;
  ts?: number;
  def?: string;
  gsr?: string;
  core?: string;
  cmn?: string[];
  yue?: string[];
  jpn?: string[];
  kor?: string[];
  vie?: string[];
  tang?: string[];
  fq?: string[];
  trad?: string[];
  simp?: string[];
  sem?: string[];
  spec?: string[];
  z?: string[];
  compat?: string[];
}
export type Unihan = Record<string, UnihanEntry>;

/**
 * Sparse item × text count matrix in CSR layout.
 * Cells of item i are [offsets[i], offsets[i+1]) in `text` / `count`.
 */
export interface Matrix {
  items: string[];
  index: Map<string, number>;
  offsets: Uint32Array;
  text: Uint8Array;
  count: Uint32Array;
}

interface RawMatrix {
  texts: string[];
  items: string[];
  cells: number[][];
}

const base = import.meta.env.BASE_URL;

async function getJSON<T>(name: string): Promise<T> {
  const res = await fetch(`${base}data/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function toMatrix(raw: RawMatrix, manifest: Manifest): Matrix {
  const expected = manifest.texts.map((t) => t.id);
  if (raw.texts.length !== expected.length || raw.texts.some((id, i) => id !== expected[i])) {
    throw new Error('data files are out of sync: text order differs from manifest.json');
  }
  if (expected.length > 255) throw new Error('more than 255 texts: widen Matrix.text');
  let cells = 0;
  for (const row of raw.cells) cells += row.length / 2;
  const offsets = new Uint32Array(raw.items.length + 1);
  const text = new Uint8Array(cells);
  const count = new Uint32Array(cells);
  let k = 0;
  raw.cells.forEach((row, i) => {
    offsets[i] = k;
    for (let j = 0; j < row.length; j += 2) {
      text[k] = row[j];
      count[k] = row[j + 1];
      k++;
    }
  });
  offsets[raw.items.length] = k;
  const index = new Map<string, number>();
  raw.items.forEach((item, i) => index.set(item, i));
  return { items: raw.items, index, offsets, text, count };
}

export const loadManifest = () => getJSON<Manifest>('manifest.json');
export const loadUnihan = () => getJSON<Unihan>('unihan.json');
export async function loadMatrix(kind: 'chars' | 'words', manifest: Manifest): Promise<Matrix> {
  return toMatrix(await getJSON<RawMatrix>(`${kind}.json`), manifest);
}
