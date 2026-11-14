// User preferences, persisted in localStorage. (View state lives in the URL.)

import { i18n, negotiate, NUMERALS, type Numerals } from './i18n/index.svelte';

export const HAN_LANGS = ['zh-Hant-TW', 'zh-Hant-HK', 'zh-Hans-CN', 'ja-JP', 'ko-KR'] as const;
export type HanLang = (typeof HAN_LANGS)[number];

export const COLLATIONS = ['frequency', 'codepoint', 'radical', 'pinyin', 'stroke', 'zhuyin', 'ko', 'ja'] as const;
export type Collation = (typeof COLLATIONS)[number];

export const READINGS = ['cmn', 'yue', 'jpn', 'kor', 'vie', 'tang', 'fq'] as const;
export type Reading = (typeof READINGS)[number];

export type Theme = 'system' | 'light' | 'dark';
export type Typeface = 'serif' | 'sans';
export type WritingMode = 'horizontal' | 'vertical';

const KEY = 'lzh-explorer:settings:v1';

interface Stored {
  locale: string | null;
  numerals: Numerals;
  hanLang: HanLang | 'auto';
  typeface: Typeface;
  theme: Theme;
  collation: Collation;
  writingMode: WritingMode;
  reading: Reading | 'auto';
}

class Settings {
  /** null = follow the browser's language preferences */
  locale = $state<string | null>(null);
  hanLang = $state<HanLang | 'auto'>('auto');
  typeface = $state<Typeface>('serif');
  theme = $state<Theme>('system');
  collation = $state<Collation>('frequency');
  writingMode = $state<WritingMode>('vertical');
  reading = $state<Reading | 'auto'>('auto');

  /** Glyph locale actually applied to Han text. */
  resolvedHanLang = $derived.by<HanLang>(() => {
    if (this.hanLang !== 'auto') return this.hanLang;
    const l = new Intl.Locale(i18n.locale).maximize();
    if (l.language === 'ja') return 'ja-JP';
    if (l.language === 'ko') return 'ko-KR';
    if (l.language === 'zh' && l.script === 'Hans') return 'zh-Hans-CN';
    if (l.language === 'zh' && (l.region === 'HK' || l.region === 'MO')) return 'zh-Hant-HK';
    return 'zh-Hant-TW';
  });

  resolvedReading = $derived.by<Reading>(() => {
    if (this.reading !== 'auto') return this.reading;
    const lang = new Intl.Locale(i18n.locale).language;
    return ({ ja: 'jpn', ko: 'kor', vi: 'vie', yue: 'yue' } as Record<string, Reading>)[lang] ?? 'cmn';
  });

  async init() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Stored>;
        if (typeof s.locale === 'string' || s.locale === null) this.locale = s.locale ?? null;
        if (s.numerals && NUMERALS.includes(s.numerals)) i18n.numerals = s.numerals;
        if (s.hanLang && (s.hanLang === 'auto' || HAN_LANGS.includes(s.hanLang))) this.hanLang = s.hanLang;
        if (s.typeface === 'serif' || s.typeface === 'sans') this.typeface = s.typeface;
        if (s.theme === 'system' || s.theme === 'light' || s.theme === 'dark') this.theme = s.theme;
        if (s.collation && COLLATIONS.includes(s.collation)) this.collation = s.collation;
        if (s.writingMode === 'horizontal' || s.writingMode === 'vertical') this.writingMode = s.writingMode;
        if (s.reading && (s.reading === 'auto' || READINGS.includes(s.reading))) this.reading = s.reading;
      }
    } catch {
      // unreadable or unavailable storage: keep defaults
    }
    await i18n.setLocale(this.locale ?? negotiate(navigator.languages ?? [navigator.language]));
  }

  async setLocale(tag: string | null) {
    this.locale = tag;
    await i18n.setLocale(tag ?? negotiate(navigator.languages ?? [navigator.language]));
  }

  save() {
    const s: Stored = {
      locale: this.locale,
      numerals: i18n.numerals,
      hanLang: this.hanLang,
      typeface: this.typeface,
      theme: this.theme,
      collation: this.collation,
      writingMode: this.writingMode,
      reading: this.reading,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // storage full or disabled
    }
  }
}

export const settings = new Settings();
