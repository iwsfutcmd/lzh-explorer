<script lang="ts">
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { analysis, app, model } from '../lib/state.svelte';
  import { cumulativeShare, logSample, perMillion, type Freq } from '../lib/stats';
  import LineChart, { type Series } from './LineChart.svelte';
  import FunctionHeatmap from './FunctionHeatmap.svelte';

  const isChars = $derived(app.view === 'chars');
  let open = $state(true);

  function coverageSeries(f: Freq, id: string, label: string, color: string): Series {
    const cum = cumulativeShare(f);
    const items = analysis.matrix!.items;
    return {
      id,
      label,
      color,
      points: logSample(f.order.length).map((p) => ({ x: p + 1, y: cum[p], note: items[f.order[p]] })),
    };
  }

  function zipfSeries(f: Freq, id: string, label: string, color: string): Series {
    const items = analysis.matrix!.items;
    return {
      id,
      label,
      color,
      points: logSample(f.order.length).map((p) => ({
        x: p + 1,
        y: perMillion(f.count[f.order[p]], f.sel.total),
        note: items[f.order[p]],
      })),
    };
  }

  const coverage = $derived.by(() => {
    if (!open || !isChars || !analysis.freq) return [];
    const s = [coverageSeries(analysis.freq, 'corpus', t('charts.corpus'), 'var(--series-1)')];
    if (analysis.refFreq) s.push(coverageSeries(analysis.refFreq, 'ref', t('charts.reference'), 'var(--series-2)'));
    return s;
  });

  const zipf = $derived.by(() => {
    if (!open || !analysis.freq) return [];
    const s = [zipfSeries(analysis.freq, 'corpus', t('charts.corpus'), 'var(--series-1)')];
    if (analysis.refFreq) s.push(zipfSeries(analysis.refFreq, 'ref', t('charts.reference'), 'var(--series-2)'));
    return s;
  });

  const rankFmt = (x: number) => (x >= 1000 ? i18n.format(x, { notation: 'compact' }) : i18n.int(x));
</script>

<details class="charts" bind:open>
  <summary><h2>{t('charts.heading')}</h2></summary>
  <div class="grid">
    {#if isChars}
      <div class="card">
        <h3>{t('charts.coverage')}</h3>
        <p class="small muted">{t('charts.coverage.desc')}</p>
        <LineChart
          series={coverage}
          xLog
          yMin={0}
          yMax={1}
          formatX={rankFmt}
          formatY={(y) => i18n.pct(y, 0)}
          label={t('charts.coverage')}
          xLabel={t('charts.rank')}
        />
      </div>
    {/if}
    <div class="card">
      <h3>{t('charts.zipf')}</h3>
      <p class="small muted">{t('charts.zipf.desc')}</p>
      <LineChart
        series={zipf}
        xLog
        yLog
        formatX={rankFmt}
        formatY={(y) => (y >= 1000 ? i18n.format(y, { notation: 'compact' }) : i18n.rate(y))}
        label={t('charts.zipf')}
        xLabel={t('charts.rank')}
      />
    </div>
    {#if isChars && model.fw && open}
      <div class="card wide">
        <FunctionHeatmap />
      </div>
    {/if}
  </div>
</details>

<style>
  .charts > summary { cursor: pointer; list-style-position: inside; }
  .charts > summary h2 { display: inline; font-size: 0.95rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 0.75rem;
    margin-block-start: 0.5rem;
  }
  .card { padding-block-end: 0.5rem; }
  .wide { grid-column: 1 / -1; min-inline-size: 0; }
  h3 { margin: 0; }
  p { margin-block: 0 0.4rem; }
</style>
