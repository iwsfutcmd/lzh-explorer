import { describe, expect, it } from 'vitest';
import { cpLabel, entryMatches, foldKana, parseQuery, parseRS, pinyinNumbered } from './han';

describe('han helpers', () => {
  it('labels code points, including the supplementary planes', () => {
    expect(cpLabel('之')).toBe('U+4E4B');
    expect(cpLabel('\u{20000}')).toBe('U+20000');
  });

  it('parses kRSUnicode', () => {
    expect(parseRS('85.5')).toEqual({ key: '85', number: 85, residual: 5 });
    expect(parseRS("120'.3")).toEqual({ key: "120'", number: 120, residual: 3 });
    expect(parseRS('5.-1')).toEqual({ key: '5', number: 5, residual: -1 });
  });

  it('normalizes pinyin tones', () => {
    expect(pinyinNumbered('zhī')).toBe('zhi1');
    expect(pinyinNumbered('lǚ')).toBe('lu3');
    expect(pinyinNumbered('de')).toBe('de');
  });

  it('folds katakana to hiragana', () => {
    expect(foldKana('シ')).toBe('し');
  });

  it('splits queries by script', () => {
    const parts = parseQuery('天下 U+4E4B zhi1 xué し 지');
    expect(parts.map((p) => p.kind)).toEqual(['han', 'codepoint', 'latin', 'latin', 'kana', 'hangul']);
  });

  it('matches readings', () => {
    const zhi = { cmn: ['zhī'], yue: ['zi1'], jpn: ['シ', 'の'], kor: ['지'], vie: ['chi'], def: 'it, him; go to' };
    const q = (s: string) => parseQuery(s)[0];
    expect(entryMatches(zhi, q('zhi'))).toBe(true);
    expect(entryMatches(zhi, q('zhi1'))).toBe(true);
    expect(entryMatches(zhi, q('zhī'))).toBe(true);
    expect(entryMatches(zhi, q('zhi2'))).toBe(false);
    expect(entryMatches(zhi, q('zi1'))).toBe(true);
    expect(entryMatches(zhi, q('し'))).toBe(true);
    expect(entryMatches(zhi, q('ノ'))).toBe(true);
    expect(entryMatches(zhi, q('지'))).toBe(true);
    expect(entryMatches(zhi, q('chi'))).toBe(true);
    expect(entryMatches(zhi, q('him'))).toBe(true);
    expect(entryMatches(zhi, q('hi'))).toBe(false);
  });
});
