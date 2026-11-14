import type { Reading } from './settings.svelte';

/** BCP 47 tags for each Unihan reading field's romanization or script. */
export const READING_LANG: Record<Reading, string> = {
  cmn: 'zh-Latn-pinyin',
  yue: 'yue-Latn-jyutping',
  jpn: 'ja',
  kor: 'ko',
  vie: 'vi',
  tang: 'ltc-Latn', // Late Middle Chinese, romanized
  fq: '', // 反切 are Han characters: tagged with the glyph locale instead
};
