<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { analysis, app, model } from '../lib/state.svelte';
  import { downloadCSV } from '../lib/export';
  import CorpusPanel from './CorpusPanel.svelte';
  import Filters from './Filters.svelte';
  import Summary from './Summary.svelte';
  import Charts from './Charts.svelte';
  import FreqTable from './FreqTable.svelte';
  import ItemGrid from './ItemGrid.svelte';
  import Detail from './Detail.svelte';

  const isWords = $derived(app.view === 'words');
  const ready = $derived(!!analysis.matrix);

  // Debounce typing into the search box (word search scans 200k items).
  let query = $state(app.q);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    query = app.q;
  });
  function onInput(e: Event & { currentTarget: HTMLInputElement }) {
    query = e.currentTarget.value;
    clearTimeout(timer);
    timer = setTimeout(() => (app.q = query), isWords ? 250 : 120);
  }

  let searchInput: HTMLInputElement | undefined = $state();
  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    const typing = target.closest('input, textarea, select, [contenteditable]');
    if (e.key === '/' && !typing) {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.select();
    } else if (e.key === 'Escape' && app.sel && !target.closest('dialog')) {
      app.sel = null;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="layout" class:has-detail={!!app.sel}>
  <aside class="sidebar" aria-label={t('corpus.heading')}>
    <CorpusPanel />
    <Filters />
  </aside>

  <section class="content" id="results" aria-busy={!ready}>
    {#if !ready}
      <p class="card loading" role="status">
        {isWords && model.wordsStatus === 'loading' ? t('loading.words') : t('loading')}
      </p>
    {:else}
      <Summary />
      <Charts />

      <div class="toolbar">
        <div class="search">
          <label for="search" class="visually-hidden">{t('search.label')}</label>
          <input
            id="search"
            type="search"
            bind:this={searchInput}
            value={query}
            oninput={onInput}
            placeholder={t(isWords ? 'search.placeholder.words' : 'search.placeholder.chars')}
            aria-describedby="search-help"
            autocomplete="off"
            spellcheck="false"
          />
          <kbd class="hint" aria-hidden="true">/</kbd>
        </div>
        <span class="count small secondary" role="status" aria-live="polite">
          {t('results.count', { shown: analysis.results.length, total: analysis.freq?.types ?? 0 })}
        </span>
        <div class="segmented" role="group" aria-label={t('view.label')}>
          {#each ['table', 'grid'] as const as d (d)}
            <button type="button" aria-pressed={app.display === d} onclick={() => (app.display = d)}>{t(`view.${d}`)}</button>
          {/each}
        </div>
        <button class="btn" onclick={() => downloadCSV()}>{t('export.csv')}</button>
      </div>
      <p id="search-help" class="small muted help">{t(isWords ? 'search.help.words' : 'search.help.chars')}</p>

      {#if analysis.results.length === 0}
        <p class="card empty">{t('results.empty')}</p>
      {:else if app.display === 'grid'}
        <ItemGrid />
      {:else}
        <FreqTable />
      {/if}
    {/if}
  </section>

  {#if app.sel && ready}
    <Detail />
  {/if}
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
    gap: 1.25rem;
    align-items: start;
  }
  .layout.has-detail {
    grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr) minmax(22rem, 28rem);
  }
  .sidebar {
    position: sticky;
    inset-block-start: calc(var(--header-h) + 1rem);
    max-block-size: calc(100dvh - var(--header-h) - 2rem);
    overflow-y: auto;
    display: grid;
    gap: 1rem;
    align-content: start;
    padding-inline-end: 0.25rem;
  }
  /* minmax(0, 1fr): never let the table's min-content width widen the column. */
  .content { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.75rem; min-inline-size: 0; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; }
  .search { position: relative; flex: 1 1 18rem; }
  .search input { inline-size: 100%; padding-inline-end: 2rem; font-size: 1rem; }
  .hint {
    position: absolute;
    inset-inline-end: 0.5rem;
    inset-block-start: 50%;
    translate: 0 -50%;
    font-size: 0.75rem;
    color: var(--muted);
    border: 1px solid var(--axis);
    border-radius: 4px;
    padding-inline: 0.3rem;
    pointer-events: none;
  }
  .help { margin-block: -0.4rem 0; }
  .count { margin-inline-end: auto; }
  .loading, .empty { text-align: center; padding-block: 3rem; }

  @media (max-width: 1280px) {
    .layout.has-detail { grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr); }
  }
  @media (max-width: 860px) {
    .layout, .layout.has-detail { grid-template-columns: minmax(0, 1fr); }
    .sidebar { position: static; max-block-size: none; overflow: visible; }
  }
</style>
