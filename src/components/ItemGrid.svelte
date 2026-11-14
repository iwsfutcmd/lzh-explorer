<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { settings } from '../lib/settings.svelte';
  import { analysis, app } from '../lib/state.svelte';
  import Han from './Han.svelte';

  const PAGE = 400;
  let shown = $state(PAGE);
  $effect(() => {
    void analysis.results;
    shown = PAGE;
  });

  const vertical = $derived(settings.writingMode === 'vertical');
  const items = $derived(Array.from(analysis.results.subarray(0, shown)));
  const m = $derived(analysis.matrix!);
  const f = $derived(analysis.freq!);
  const isWords = $derived(app.view === 'words');
</script>

<div class="card">
  <!-- In vertical mode the scroller itself is vertical-rl, so scrolling
       starts at the right edge, where the first column is. -->
  <div class="scroller" class:vertical>
    <ul class="tiles" class:words={isWords}>
      {#each items as i (i)}
        {@const item = m.items[i]}
        <li>
          <button
            type="button"
            class="tile"
            aria-current={app.sel === item ? 'true' : undefined}
            onclick={() => (app.sel = item)}
            title="{t('col.rank')} {f.rank[i] ? i18n.int(f.rank[i]) : '—'} · {t('col.count')} {i18n.int(f.count[i])}"
          >
            <Han text={item} class="glyph" vertical={vertical && isWords} />
            <span class="rank small muted">{f.rank[i] ? i18n.int(f.rank[i]) : '—'}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
  {#if shown < analysis.results.length}
    <button class="btn more" onclick={() => (shown += PAGE)}>{t('results.more')}</button>
  {/if}
</div>

<style>
  .scroller.vertical {
    writing-mode: vertical-rl;
    inline-size: min(34rem, 70vh);
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .tiles {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .tile {
    writing-mode: horizontal-tb;
    display: grid;
    justify-items: center;
    inline-size: 3.6rem;
    padding-block: 0.3rem 0.15rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    cursor: pointer;
  }
  .words .tile { inline-size: auto; min-inline-size: 3.6rem; padding-inline: 0.5rem; }
  /* Vertical mode: tiles stay horizontal boxes; only the word is set vertically. */
  .vertical .words .tile { min-inline-size: 3.6rem; padding-inline: 0.3rem; }
  .vertical .words .tile :global(.glyph) { writing-mode: vertical-rl; display: block; inline-size: max-content; }
  .tile:hover { background: var(--hover); }
  .tile[aria-current='true'] { background: var(--selected); border-color: var(--focus); }
  .tile :global(.glyph) { font-size: 1.75rem; line-height: 1.2; }
  .rank { font-variant-numeric: tabular-nums; }
  .more { margin-block-start: 0.75rem; }
</style>
