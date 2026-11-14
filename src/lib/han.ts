// Unicode / Han-character helpers: code points, radicals, reading search.

import type { BlockInfo, UnihanEntry } from './data';

export const codepoint = (ch: string) => ch.codePointAt(0) ?? 0;
export const cpLabel = (ch: string) => 'U+' + codepoint(ch).toString(16).toUpperCase().padStart(4, '0');

export function blockOf(ch: string, blocks: readonly BlockInfo[]): BlockInfo | undefined {
  const cp = codepoint(ch);
  return blocks.find((b) => b.first <= cp && cp <= b.last);
}

const HAN = /\p{Script=Han}/u;
export const isHan = (ch: string) => HAN.test(ch);

export interface RadicalStroke {
  /** radical number as in kRSUnicode, incl. ' / '' marks for simplified forms */
  key: string;
  /** Kangxi radical number 1–214 */
  number: number;
  /** residual strokes */
  residual: number;
}

export function parseRS(rs: string | undefined): RadicalStroke | undefined {
  const m = rs?.match(/^(\d+)('*)\.(-?\d+)$/);
  if (!m) return undefined;
  return { key: m[1] + m[2], number: Number(m[1]), residual: Number(m[3]) };
}

// ------------------------------------------------------------- search ----

/** Fold a romanization to a comparable key: lowercase, marks stripped. */
export function foldLatin(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/u:|v/g, 'u');
}

const PINYIN_TONES: Record<string, number> = { '̄': 1, '́': 2, '̌': 3, '̀': 4 };

/** "zhī" -> "zhi1", "lǚ" -> "lu3", "zi" -> "zi" (tone-number form). */
export function pinyinNumbered(s: string): string {
  const nfd = s.normalize('NFD');
  let tone = '';
  for (const ch of nfd) if (PINYIN_TONES[ch]) tone = String(PINYIN_TONES[ch]);
  return foldLatin(nfd) + tone;
}

/** Katakana -> hiragana, so either script finds either reading. */
export const foldKana = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export type QueryPart =
  | { kind: 'han'; text: string }
  | { kind: 'codepoint'; char: string }
  | { kind: 'latin'; folded: string; numbered: string | null; raw: string }
  | { kind: 'kana'; folded: string }
  | { kind: 'hangul'; text: string };

/**
 * Split a free-text query into typed parts. Runs of Han characters are kept
 * together (so words can be matched as substrings); everything else is split
 * on whitespace and punctuation.
 */
export function parseQuery(q: string): QueryPart[] {
  const parts: QueryPart[] = [];
  const re = /(\p{Script=Han}+)|((?:U\+|u\+|0x)[0-9A-Fa-f]{4,6})|(\p{Script=Hiragana}|\p{Script=Katakana}|ー)+|(\p{Script=Hangul}+)|([\p{L}\p{M}\d':]+)/gu;
  for (const m of q.normalize('NFC').matchAll(re)) {
    const [whole, han, cp, , hangul, latin] = m;
    if (han) parts.push({ kind: 'han', text: han });
    else if (cp) parts.push({ kind: 'codepoint', char: String.fromCodePoint(parseInt(cp.slice(2), 16)) });
    else if (hangul) parts.push({ kind: 'hangul', text: hangul });
    else if (latin) {
      const hasTone = /[1-6]$/.test(latin) || /[̀́̄̌]/.test(latin.normalize('NFD'));
      parts.push({
        kind: 'latin',
        raw: latin.toLowerCase(),
        folded: foldLatin(latin).replace(/\d/g, ''),
        numbered: hasTone ? (/\d$/.test(latin) ? foldLatin(latin) : pinyinNumbered(latin)) : null,
      });
    } else parts.push({ kind: 'kana', folded: foldKana(whole) });
  }
  return parts;
}

export type ReadingField = 'cmn' | 'yue' | 'jpn' | 'kor' | 'vie';

/** Does a single character's Unihan entry match a non-Han query part? */
export function entryMatches(entry: UnihanEntry | undefined, part: QueryPart): boolean {
  if (!entry) return false;
  switch (part.kind) {
    case 'kana':
      return !!entry.jpn?.some((r) => foldKana(r) === part.folded);
    case 'hangul':
      return !!entry.kor?.includes(part.text);
    case 'latin': {
      const tonal = part.numbered;
      if (entry.cmn?.some((r) => (tonal ? pinyinNumbered(r) === tonal : foldLatin(r) === part.folded))) return true;
      if (entry.yue?.some((r) => (tonal ? r === tonal : r.replace(/\d$/, '') === part.folded))) return true;
      if (entry.vie?.some((r) => (tonal ? false : foldLatin(r) === part.folded) || r.toLowerCase() === part.raw)) return true;
      // English gloss: whole-word match, only for queries long enough to mean something
      if (part.raw.length >= 3 && entry.def) {
        return new RegExp(`(^|[^\\p{L}])${escapeRegExp(part.raw)}($|[^\\p{L}])`, 'iu').test(entry.def);
      }
      return false;
    }
    default:
      return false;
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Toneless first-reading pinyin of a string, e.g. 天下 -> "tianxia". */
export function pinyinKey(word: string, unihan: Record<string, UnihanEntry>): string {
  let out = '';
  for (const ch of word) out += foldLatin(unihan[ch]?.cmn?.[0] ?? '?');
  return out;
}
