<script lang="ts">
  import { i18n, t, type MessageKey } from '../lib/i18n/index.svelte';
  import { model, textOrder } from '../lib/state.svelte';
  import Han from './Han.svelte';

  const manifest = $derived(model.manifest!);
  const texts = $derived(textOrder(manifest).map((i) => manifest.texts[i]));
  const REPO = 'https://github.com/iwsfutcmd/lzh-explorer';
</script>

<article class="about">
  <h1>{t('about.heading')}</h1>
  <p>{t('about.intro')}</p>

  <h2>{t('about.data')}</h2>
  <p>{t('about.data.body')}</p>
  <ul class="sources">
    {#each manifest.sources as s (s.id)}
      <li class="card">
        <!-- Bibliographic data stays in its original language. -->
        <p lang="en">
          {s.creator} ({s.year}). <cite>{s.title}</cite>. {s.publisher}.
          {#if s.doi}<a href={s.url}>doi:{s.doi}</a>{:else}<a href={s.url}>{s.url}</a>{/if}
        </p>
        <p class="small">
          <span class="secondary">{t('about.license')}:</span> <a href={s.licenseUrl} lang="en">{s.license}</a>
        </p>
        <p class="small"><span class="secondary">{t('about.changes')}:</span> <span lang="en">{s.changes}</span></p>
      </li>
    {/each}
  </ul>

  <h2>{t('about.caveats')}</h2>
  <ul>
    {#each ['words', 'hanshu', 'shared', 'editions'] as c (c)}
      <li>{t(`about.caveat.${c}` as MessageKey)}</li>
    {/each}
  </ul>

  <h2>{t('about.methods')}</h2>
  <ul>
    {#each ['ipm', 'dp', 'keyness'] as c (c)}
      <li>{t(`about.method.${c}` as MessageKey)}</li>
    {/each}
  </ul>

  <h2>{t('about.keyboard')}</h2>
  <dl class="keys">
    <div><dt><kbd>/</kbd></dt><dd>{t('about.key.search')}</dd></div>
    <div><dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>PgUp</kbd> <kbd>PgDn</kbd> <kbd>Home</kbd> <kbd>End</kbd></dt><dd>{t('about.key.move')}</dd></div>
    <div><dt><kbd>Esc</kbd></dt><dd>{t('about.key.close')}</dd></div>
  </dl>

  <h2>{t('about.texts')}</h2>
  <div class="card table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">{t('about.col.title')}</th>
          <th scope="col">{t('about.col.corpora')}</th>
          <th scope="col" class="num">{t('about.col.tokens')}</th>
          <th scope="col" class="num">{t('about.col.year')}</th>
          <th scope="col">{t('about.col.edition')}</th>
          <th scope="col">{t('about.col.note')}</th>
        </tr>
      </thead>
      <tbody>
        {#each texts as text (text.id)}
          <tr>
            <th scope="row">
              <Han text={text.title} />
              <span class="small secondary"><span lang="zh-Latn-pinyin">{text.pinyin}</span> · <span lang="en">{text.en}</span></span>
            </th>
            <td class="small">{text.corpora.map((c) => t(`corpus.${c}`)).join(', ')}</td>
            <td class="num">{i18n.int(text.tokens)}</td>
            <td class="num">{text.year != null ? i18n.year(text.year) : ''}</td>
            <td class="small" lang="en">{text.origin ?? ''}</td>
            <td class="small" lang="en">{text.note ?? ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <p class="small secondary source">{t('about.source')}: <a href={REPO}>{REPO.replace('https://', '')}</a></p>
</article>

<style>
  .about { max-inline-size: 72rem; margin-inline: auto; }
  h1 { font-size: 1.4rem; }
  h2 { margin-block-start: 1.75rem; }
  .sources { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
  .sources p { margin: 0 0 0.25rem; }
  .keys { display: grid; gap: 0.3rem; }
  .keys div { display: flex; gap: 1rem; }
  .keys dt { min-inline-size: 14rem; }
  .keys dd { margin: 0; }
  kbd { border: 1px solid var(--axis); border-radius: 4px; padding-inline: 0.3rem; font-size: 0.8125rem; background: var(--surface); }
  .table-wrap { padding: 0; overflow-x: auto; }
  table { border-collapse: collapse; inline-size: 100%; font-size: 0.9rem; }
  th, td { padding-block: 0.35rem; padding-inline: 0.6rem; border-block-end: 1px solid var(--grid); text-align: start; vertical-align: baseline; }
  thead th { color: var(--ink-2); font-size: 0.8125rem; font-weight: 600; white-space: nowrap; }
  tbody th { font-weight: normal; }
  tbody th :global(.han) { font-size: 1.1rem; margin-inline-end: 0.4rem; }
  .num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .source { margin-block-start: 2rem; }
</style>
