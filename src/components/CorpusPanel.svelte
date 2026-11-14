<script lang="ts">
  import { CORPUS_IDS, type CorpusId, type TextInfo } from '../lib/data';
  import { foldLatin } from '../lib/han';
  import { i18n, t, type MessageKey } from '../lib/i18n/index.svelte';
  import { analysis, app, model, PRESETS, resolveTexts } from '../lib/state.svelte';
  import Han from './Han.svelte';

  const manifest = $derived(model.manifest!);
  const preset = $derived(
    app.corpus.length === 1 && (PRESETS as readonly string[]).includes(app.corpus[0]) ? app.corpus[0] : 'custom',
  );
  let pickerOpen = $state(false);
  $effect(() => {
    if (preset === 'custom') pickerOpen = true;
  });

  const selected = $derived(new Set(analysis.targetTexts));
  const tokens = $derived(analysis.targetTexts.reduce((n, i) => n + manifest.texts[i].tokens, 0));
  const refTokens = $derived(analysis.refTexts?.reduce((n, i) => n + manifest.texts[i].tokens, 0) ?? 0);

  // Show English titles only where the UI language is not one that reads
  // the Han titles natively.
  const showGloss = $derived(!['zh', 'ja', 'ko'].includes(new Intl.Locale(i18n.locale).language));

  function choose(p: string) {
    if (p === 'custom') {
      app.corpus = analysis.targetTexts.map((i) => manifest.texts[i].id);
      pickerOpen = true;
    } else app.corpus = [p];
  }

  function toggle(index: number, on: boolean) {
    const ids = new Set(analysis.targetTexts.map((i) => manifest.texts[i].id));
    const id = manifest.texts[index].id;
    if (on) ids.add(id);
    else ids.delete(id);
    // keep the corpus-table order
    app.corpus = manifest.texts.filter((t) => ids.has(t.id)).map((t) => t.id);
  }

  function setGroup(c: CorpusId, on: boolean) {
    const ids = new Set(analysis.targetTexts.map((i) => manifest.texts[i].id));
    for (const text of manifest.texts) if (text.corpora.includes(c)) on ? ids.add(text.id) : ids.delete(text.id);
    app.corpus = manifest.texts.filter((t) => ids.has(t.id)).map((t) => t.id);
  }

  let textFilter = $state('');
  function matches(text: TextInfo) {
    const q = textFilter.trim();
    if (!q) return true;
    const f = foldLatin(q);
    return (
      text.title.includes(q) ||
      text.sourceTitle.includes(q) ||
      foldLatin(text.pinyin).replace(/\s/g, '').includes(f.replace(/\s/g, '')) ||
      foldLatin(text.en).includes(f)
    );
  }

  const groups = $derived(
    CORPUS_IDS.map((c) => {
      const texts = manifest.texts.map((text, index) => ({ text, index })).filter(({ text }) => text.corpora.includes(c));
      if (c === 'loewe') {
        const coll = new Intl.Collator('en');
        texts.sort((a, b) => coll.compare(a.text.pinyin, b.text.pinyin));
      } else if (c === 'zhengshi') texts.sort((a, b) => (a.text.year ?? 0) - (b.text.year ?? 0));
      return { id: c, texts };
    }),
  );

  const refValue = $derived(app.ref.join(','));
  const REF_OPTIONS = ['', 'rest', ...PRESETS];
</script>

<section class="card">
  <h2 id="corpus-h">{t('corpus.heading')}</h2>
  <div role="radiogroup" aria-labelledby="corpus-h" class="presets">
    {#each [...PRESETS, 'custom'] as p (p)}
      <label class="preset" title={p !== 'all' && p !== 'custom' ? t(`corpus.${p}.desc` as MessageKey) : undefined}>
        <input type="radio" name="corpus" value={p} checked={preset === p} onchange={() => choose(p)} />
        <span>{t(`corpus.${p}` as MessageKey)}</span>
      </label>
    {/each}
  </div>
  <p class="small secondary summary">
    {analysis.targetTexts.length
      ? t('corpus.summary', { count: analysis.targetTexts.length, tokens: i18n.int(tokens) })
      : t('corpus.emptySelection')}
  </p>

  <details bind:open={pickerOpen}>
    <summary>{t('corpus.chooseTexts')}</summary>
    <input type="search" class="filter" placeholder={t('corpus.filterTexts')} aria-label={t('corpus.filterTexts')} bind:value={textFilter} />
    {#each groups as g (g.id)}
      <fieldset>
        <legend>
          <span>{t(`corpus.${g.id}`)}</span>
          <span class="group-actions">
            <button type="button" class="btn btn-ghost small" onclick={() => setGroup(g.id, true)}>{t('corpus.selectAll')}</button>
            <button type="button" class="btn btn-ghost small" onclick={() => setGroup(g.id, false)}>{t('corpus.selectNone')}</button>
          </span>
        </legend>
        <ul>
          {#each g.texts.filter(({ text }) => matches(text)) as { text, index } (text.id)}
            <li>
              <label>
                <input type="checkbox" checked={selected.has(index)} onchange={(e) => toggle(index, e.currentTarget.checked)} />
                <span class="text-name">
                  <Han text={text.title} />
                  {#if showGloss}<span class="small muted gloss" lang="en">{text.en}</span>{/if}
                </span>
                <span class="small muted num">{text.year != null ? i18n.year(text.year) : ''}</span>
              </label>
            </li>
          {/each}
        </ul>
      </fieldset>
    {/each}
  </details>
</section>

<section class="card">
  <label class="field">
    <span class="h2">{t('corpus.compare')}</span>
    <select value={refValue} onchange={(e) => (app.ref = e.currentTarget.value ? e.currentTarget.value.split(',') : [])}>
      {#each REF_OPTIONS as r (r)}
        <option value={r}>{t(r ? (`corpus.${r}` as MessageKey) : 'corpus.none')}</option>
      {/each}
      {#if app.ref.length && !REF_OPTIONS.includes(refValue)}
        <option value={refValue}>{t('corpus.custom')}</option>
      {/if}
    </select>
  </label>
  {#if analysis.refTexts}
    <p class="small secondary summary">
      {analysis.refTexts.length
        ? t('corpus.summary', { count: analysis.refTexts.length, tokens: i18n.int(refTokens) })
        : t('corpus.emptySelection')}
    </p>
    {#if analysis.overlap}
      <p class="small warn" role="note">{t('corpus.overlap')}</p>
    {/if}
  {/if}
</section>

<style>
  section { display: grid; gap: 0.5rem; }
  h2, .h2 { font-size: 0.95rem; font-weight: 650; color: var(--ink); margin: 0; }
  .presets { display: grid; gap: 0.15rem; }
  .preset { display: flex; gap: 0.5rem; align-items: center; padding-block: 0.15rem; cursor: pointer; }
  .summary { margin: 0; }
  details summary { cursor: pointer; color: var(--link); font-size: 0.9rem; }
  .filter { inline-size: 100%; margin-block: 0.5rem; }
  fieldset { border: 0; padding: 0; margin: 0 0 0.75rem; }
  legend {
    display: flex;
    align-items: center;
    justify-content: space-between;
    inline-size: 100%;
    font-weight: 600;
    font-size: 0.875rem;
    padding: 0;
    border-block-end: 1px solid var(--grid);
    margin-block-end: 0.25rem;
  }
  .group-actions .btn { padding-inline: 0.35rem; padding-block: 0.1rem; color: var(--link); }
  ul { list-style: none; margin: 0; padding: 0; }
  li label { display: grid; grid-template-columns: auto 1fr auto; gap: 0.4rem; align-items: baseline; padding-block: 0.1rem; cursor: pointer; }
  .text-name { display: flex; flex-wrap: wrap; column-gap: 0.4rem; }
  .gloss { overflow-wrap: anywhere; }
  .warn { margin: 0; padding: 0.4rem 0.6rem; border-inline-start: 3px solid var(--series-2); background: var(--surface-2); border-radius: 4px; }
</style>
