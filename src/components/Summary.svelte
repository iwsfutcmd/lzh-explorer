<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { analysis, app, model } from '../lib/state.svelte';
  import { coverage } from '../lib/stats';

  const FRACTIONS = [0.5, 0.8, 0.9, 0.95, 0.99];
  const f = $derived(analysis.freq);
  const isChars = $derived(app.view === 'chars');
  const cov = $derived(f && isChars ? coverage(f, FRACTIONS) : []);

  // Share of character tokens that are listed function characters.
  const fwShare = $derived.by(() => {
    const m = analysis.matrix;
    const fw = model.fw;
    if (!f || !m || !fw || !isChars || !f.sel.total) return NaN;
    let n = 0;
    for (const item of Object.keys(fw.items)) {
      const i = m.index.get(item);
      if (i !== undefined) n += f.count[i];
    }
    return n / f.sel.total;
  });
</script>

{#if f}
  <section aria-label={t('summary.label')}>
    <dl class="tiles">
      <div class="tile">
        <dt>{t('summary.tokens')}</dt>
        <dd>{i18n.int(f.sel.total)}</dd>
      </div>
      {#if !isChars}
        <div class="tile">
          <dt>{t('summary.wordTokens')}</dt>
          <dd>{i18n.int(f.itemTokens)}</dd>
        </div>
      {/if}
      <div class="tile">
        <dt>{t(isChars ? 'summary.types.chars' : 'summary.types.words')}</dt>
        <dd>{i18n.int(f.types)}</dd>
      </div>
      <div class="tile">
        <dt>{t('summary.hapax')}</dt>
        <dd>{i18n.int(f.hapax)}</dd>
      </div>
      {#if !Number.isNaN(fwShare)}
        <div class="tile" title={t('summary.functionShare.title')}>
          <dt>{t('summary.functionShare')}</dt>
          <dd>{i18n.pct(fwShare, 1)}</dd>
        </div>
      {/if}
      {#each FRACTIONS as frac, k (frac)}
        {#if isChars && frac >= 0.8}
          <div class="tile">
            <dt>{t('summary.coverage', { pct: i18n.pct(frac, 0) })}</dt>
            <dd>{Number.isNaN(cov[k]) ? '—' : i18n.int(cov[k])}</dd>
          </div>
        {/if}
      {/each}
    </dl>
  </section>
{/if}

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.5rem;
    margin: 0;
  }
  .tile {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    padding-block: 0.6rem;
    padding-inline: 0.8rem;
  }
  dt { font-size: 0.8125rem; color: var(--ink-2); }
  dd { margin: 0; font-size: 1.35rem; font-weight: 600; }
</style>
