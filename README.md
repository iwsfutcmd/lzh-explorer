# Classical Chinese Explorer (lzh-explorer)

Corpus-linguistic and NLP tools for exploring Classical / Literary Chinese
(文言, ISO 639-3 `lzh`), as a static site on GitHub Pages:
**<https://iwsfutcmd.github.io/lzh-explorer/>**

The first tool is a **frequency explorer** for characters and words across
94 texts (31.8 million characters) in three corpora:

| Corpus | Texts | Characters |
|---|---:|---:|
| Early texts — pre-Qin and Han works described in Loewe (ed.), *Early Chinese Texts* (1993) | 65 | 4.9 M |
| Official histories — the 24 dynastic histories (正史) + 清史稿 | 25 | 25.5 M |
| Six classic novels — as in C. T. Hsia, *The Classic Chinese Novel* (1968) | 6 | 3.1 M |

(史記 and 漢書 belong to both of the first two corpora; they are counted once.)

## What it does

- **Any sub-corpus.** All statistics are computed in the browser from raw
  per-text counts, so the presets, or any hand-picked set of texts, get the
  same treatment.
- **Per item:** count, per-million frequency, rank, range (number of texts),
  dispersion (Gries’ DP, normalized), and cumulative coverage.
- **Keyness:** compare the corpus with a reference (another corpus, or "all
  other texts") using Log Ratio (Hardie 2014) and signed log-likelihood G²
  (Dunning 1993).
- **Charts:** coverage by rank, rank–frequency (Zipf) plots, a per-text
  distribution, and a diachronic view across the official histories by date of
  completion.
- **Character data** from Unihan 18.0:
  - radical and stroke counts;
  - Mandarin, Cantonese, Japanese (kana), Korean (hangul), Vietnamese and Tang
    readings;
  - 廣韻 反切, Karlgren GSR numbers, English glosses, and variants.
- **Search across scripts:**
  - paste a passage (to list its characters), or search by code point (`U+4E4B`);
  - pinyin with or without tones (`zhi`, `zhi1`, `zhī`), jyutping, kana,
    hangul or Vietnamese;
  - English gloss.
- **Filters:** Unicode block, radical, stroke count, minimum count, and word
  length.
- **Sorting:** by any column, with a choice of character collation (code point,
  radical-stroke, ICU pinyin / stroke / zhuyin, Korean, Japanese).
- **Shareable URLs** for every view (corpus, comparison, search, filters and
  selection), and **CSV export** of any result list.

## Internationalization

The site was designed to be multilingual and multi-script from the start:

- **UI languages:** English, 繁體中文, 简体中文, 日本語, 한국어, Tiếng Việt.
  - Messages live in typed catalogs (`src/lib/i18n/locales/*.ts`), so a locale
    missing a key fails the type check.
  - Plurals use CLDR rules.
  - Interpolated values are wrapped in Unicode bidi isolates (FSI…PDI).
- **Right-to-left:**
  - Text direction comes from the locale's likely script.
  - Layout uses CSS logical properties only, so the whole UI mirrors (charts
    included).
  - Two pseudo-locales are available under *Settings → Testing*: `ar-XB`
    (bidi, RTL) and `en-XA` (accented, expanded). They exercise RTL and text
    expansion without a real translation.
- **Vertical text (直排 / 縦書き):** the grid view and the headword in the
  details panel can be set top-to-bottom, with columns running right to left.
- **Han glyph style:** Han text is tagged with a selectable language
  (zh-Hant-TW, zh-Hant-HK, zh-Hans-CN, ja-JP, ko-KR), so fonts render the
  regional glyph forms. You can also choose a serif (Song/Ming) or sans-serif
  (Hei/Gothic) typeface.
- **Numerals:** the language default, Western, Chinese (〇一二三), full-width,
  or Arabic-Indic.

Adding a UI language means copying `src/lib/i18n/locales/en.ts`, translating it,
and registering it in `LOCALES` in `src/lib/i18n/index.svelte.ts`.

## Data

| Source | Used for | License |
|---|---|---|
| Tilman Schalmey (2021), *Raw frequency data: Thoughts on "Reliable" Learner's Vocabularies for Classical and Literary Chinese*, Zenodo, [doi:10.5281/zenodo.5638882](https://doi.org/10.5281/zenodo.5638882) | per-text character and word counts | CC BY 4.0 |
| Unicode Character Database 18.0.0 (Unihan, CJKRadicals, Blocks) | readings, glosses, radicals, variants, blocks | Unicode License v3 |

See [`public/data/LICENSE.md`](public/data/LICENSE.md) for the attribution
and the list of changes. Things to keep in mind when interpreting the numbers:

- **"Words"** are counts of every 2–4-character sequence that is a headword
  of the *Hanyu da cidian* (漢語大詞典). They are *not* the output of
  segmentation, and overlapping matches are all counted.
- **The 漢書 text includes Yan Shigu's 顏師古 commentary**, which inflates
  items such as 師古 and 曰.
- **The e-texts come from various digital editions** (the per-text source is
  on the About page), and character forms follow those editions. A few
  non-Han items occur (々, two CJK Radicals Supplement characters).
- **Some text titles in the dataset are corrected** (e.g. 漢詩外傳 → 韓詩外傳,
  宴子春秋 → 晏子春秋). Each correction is documented in
  [`pipeline/texts.toml`](pipeline/texts.toml).

## Development

Requires Node 22+ and, for regenerating the data, [uv](https://docs.astral.sh/uv/).

```sh
npm install
npm run dev        # local server with hot reload
npm run check      # svelte-check / TypeScript
npm test           # unit tests (statistics, search, Unicode helpers)
npm run build      # static site in dist/

npm run data       # re-download sources (checksum-pinned) and rebuild public/data/
cd pipeline && uv run pytest
```

The generated data in `public/data/` is committed, so the site builds without
network access. The pipeline is deterministic: rebuilding from the pinned
sources reproduces those files byte for byte.

### Layout

```
pipeline/             Python (stdlib only): download, verify, normalize, emit JSON
  texts.toml          curated text metadata (ids, normalized titles, English titles)
  lzh_pipeline/       schalmey.py (dataset reader), unihan.py, sources.py, build.py
public/data/          generated data served with the site
src/lib/              data loading, statistics, search, collation, i18n, state
src/components/       Svelte 5 UI
.github/workflows/    CI and GitHub Pages deployment
```

### Deployment

`.github/workflows/pages.yml` builds and deploys on every push to `main`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub
Actions**.

## References

- Dunning, T. (1993). Accurate methods for the statistics of surprise and coincidence. *Computational Linguistics* 19(1).
- Gries, S. Th. (2008). Dispersions and adjusted frequencies in corpora. *International Journal of Corpus Linguistics* 13(4).
- Hardie, A. (2014). Log Ratio: an informal introduction. CASS, Lancaster University.
- Lijffijt, J. & Gries, S. Th. (2012). Correction to Stefan Th. Gries’ "Dispersions and adjusted frequencies in corpora". *IJCL* 17(1).
- Rayson, P. & Garside, R. (2000). Comparing corpora using frequency profiling. *Workshop on Comparing Corpora*, ACL.
- Schalmey, T. (2013). Corpus-driven creation of a reliable learner’s vocabulary for Classical Chinese. *Taiwan Journal of Chinese as a Second Language* 7(2), 109–137.
