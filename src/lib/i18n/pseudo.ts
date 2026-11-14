// Pseudo-locales for layout QA, generated from the English catalog:
//
//   en-XA  accented and ~40% longer, in brackets: catches hard-coded strings,
//          truncation and fixed-width layouts.
//   ar-XB  every word wrapped in RIGHT-TO-LEFT OVERRIDE, page direction rtl:
//          exercises mirroring and bidi handling without needing a real
//          translation (the same scheme as Android and Chromium).

import type { Messages } from './locales/en';
import type { Message } from './types';

const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Apply `fn` to the literal text of a message, leaving {placeholders} intact. */
function mapText(s: string, fn: (text: string) => string): string {
  return s
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? part : fn(part)))
    .join('');
}

function mapMessage(m: Message, fn: (s: string) => string): Message {
  if (typeof m === 'string') return fn(m);
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, fn(v!)])) as Message;
}

function accent(s: string): string {
  const body = mapText(s, (text) => text.replace(/[A-Za-z]/g, (c) => ACCENTS[c] ?? c));
  const pad = '·'.repeat(Math.ceil(s.length * 0.4));
  return `⟦${body}${pad}⟧`;
}

const RLO = '‮';
const PDF = '‬';
const RLM = '‏';

function bidi(s: string): string {
  return RLM + mapText(s, (text) => text.replace(/[A-Za-z][A-Za-z'’]*/g, (w) => RLO + w + PDF));
}

function transform(messages: Messages, fn: (s: string) => string): Messages {
  return Object.fromEntries(
    Object.entries(messages).map(([k, m]) => [k, mapMessage(m, fn)]),
  ) as Messages;
}

export const pseudoAccent = (m: Messages) => transform(m, accent);
export const pseudoBidi = (m: Messages) => transform(m, bidi);
