// Runtime i18n: locale negotiation, messages with plurals and bidi isolation,
// locale-aware number formatting, writing direction.

import en, { type MessageKey, type Messages } from './locales/en';
import { pseudoAccent, pseudoBidi } from './pseudo';

export type { MessageKey };

export interface LocaleOption {
  tag: string;
  /** QA-only pseudo-locale */
  pseudo?: boolean;
  load: () => Promise<Messages>;
}

export const LOCALES: LocaleOption[] = [
  { tag: 'en', load: async () => en },
  { tag: 'zh-Hant', load: () => import('./locales/zh-Hant').then((m) => m.default) },
  { tag: 'zh-Hans', load: () => import('./locales/zh-Hans').then((m) => m.default) },
  { tag: 'ja', load: () => import('./locales/ja').then((m) => m.default) },
  { tag: 'ko', load: () => import('./locales/ko').then((m) => m.default) },
  { tag: 'vi', load: () => import('./locales/vi').then((m) => m.default) },
  { tag: 'en-XA', pseudo: true, load: async () => pseudoAccent(en) },
  { tag: 'ar-XB', pseudo: true, load: async () => pseudoBidi(en) },
];

export type Numerals = 'auto' | 'latn' | 'hanidec' | 'fullwide' | 'arab';
export const NUMERALS: Numerals[] = ['auto', 'latn', 'hanidec', 'fullwide', 'arab'];

// Scripts written right to left (ISO 15924), for engines without
// Intl.Locale#getTextInfo.
const RTL_SCRIPTS = new Set([
  'Adlm', 'Arab', 'Aran', 'Armi', 'Avst', 'Chrs', 'Cprt', 'Elym', 'Hatr', 'Hebr', 'Hung', 'Khar', 'Lydi',
  'Mand', 'Mani', 'Mend', 'Merc', 'Mero', 'Narb', 'Nbat', 'Nkoo', 'Orkh', 'Ougr', 'Palm', 'Phli', 'Phlp',
  'Phnx', 'Prti', 'Rohg', 'Samr', 'Sarb', 'Sogd', 'Sogo', 'Syrc', 'Thaa', 'Yezi',
]);

export function directionOf(tag: string): 'ltr' | 'rtl' {
  try {
    const loc = new Intl.Locale(tag) as Intl.Locale & {
      getTextInfo?: () => { direction?: string };
      textInfo?: { direction?: string };
    };
    const info = loc.getTextInfo?.() ?? loc.textInfo;
    if (info?.direction === 'rtl' || info?.direction === 'ltr') return info.direction;
    const script = loc.maximize().script;
    return script && RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

/** Best available UI locale for the user's language preferences. */
export function negotiate(preferred: readonly string[]): string {
  const real = LOCALES.filter((l) => !l.pseudo);
  for (const want of preferred) {
    let loc: Intl.Locale;
    try {
      loc = new Intl.Locale(want).maximize();
    } catch {
      continue;
    }
    // Match on language + script, so zh-TW → zh-Hant and zh-CN → zh-Hans.
    const hit = real.find((l) => {
      const cand = new Intl.Locale(l.tag).maximize();
      return cand.language === loc.language && cand.script === loc.script;
    });
    if (hit) return hit.tag;
  }
  return 'en';
}

// Bidi isolates around interpolated values, so a Latin, Han or numeric value
// never reorders the surrounding text (UAX #9, "Unicode Bidirectional
// Algorithm", §2.7).
// Built at runtime so no literal bidi controls appear in the (transpiled)
// source, which the Svelte compiler rightly flags.
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

export type Params = Record<string, string | number>;

class I18n {
  locale = $state('en');
  numerals = $state<Numerals>('auto');
  messages = $state.raw<Messages>(en);

  dir = $derived(directionOf(this.locale));
  numberLocale = $derived(this.numerals === 'auto' ? this.locale : `${this.locale}-u-nu-${this.numerals}`);
  #plural = $derived(new Intl.PluralRules(this.locale));
  #formats = new Map<string, Intl.NumberFormat>();

  async setLocale(tag: string) {
    const option = LOCALES.find((l) => l.tag === tag) ?? LOCALES[0];
    this.messages = await option.load();
    this.locale = option.tag;
  }

  /** Translate `key`, interpolating `params` (numbers are formatted). */
  t = (key: MessageKey, params?: Params): string => {
    const msg = this.messages[key] ?? en[key];
    const template =
      typeof msg === 'string'
        ? msg
        : (msg[this.#plural.select(Number(params?.count ?? 0))] ?? msg.other);
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
      const v = params[name];
      if (v === undefined) return whole;
      return FSI + (typeof v === 'number' ? this.int(v) : v) + PDI;
    });
  };

  format(n: number, options: Intl.NumberFormatOptions = {}): string {
    // Chinese positional numerals (〇一二三) are written without digit grouping.
    if (this.numerals === 'hanidec' && options.notation !== 'compact') options = { useGrouping: false, ...options };
    const key = this.numberLocale + JSON.stringify(options);
    let f = this.#formats.get(key);
    if (!f) {
      f = new Intl.NumberFormat(this.numberLocale, options);
      this.#formats.set(key, f);
    }
    return f.format(n);
  }

  int = (n: number) => this.format(n, { maximumFractionDigits: 0 });

  /** Significant-figure formatting for rates such as per-million values. */
  rate = (n: number) =>
    n >= 100
      ? this.format(n, { maximumFractionDigits: 0 })
      : this.format(n, { maximumSignificantDigits: 3, minimumSignificantDigits: 1 });

  fixed = (n: number, digits: number) =>
    this.format(n, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  pct = (fraction: number, digits = 1) =>
    this.format(fraction, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits });

  signed = (n: number, digits: number) =>
    this.format(n, { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: 'exceptZero' });

  /** A year, negative = BCE. */
  year = (y: number) =>
    this.t(y < 0 ? 'year.bce' : 'year.ce', { year: this.format(Math.abs(y), { useGrouping: false }) });

  /** A language tag's name in the UI language, e.g. zh-Hant-TW. */
  languageName(tag: string, inLocale = this.locale): string {
    try {
      return new Intl.DisplayNames([inLocale], { type: 'language' }).of(tag) ?? tag;
    } catch {
      return tag;
    }
  }
}

export const i18n = new I18n();
export const t = i18n.t;
