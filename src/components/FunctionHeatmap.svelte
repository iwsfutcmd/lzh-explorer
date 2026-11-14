<script lang="ts">
  // Texts × function characters of one category. Each cell compares the
  // item's rate in a text with its rate in the whole selection (log2 ratio,
  // diverging scale), which brings out stylistic and diachronic preferences
  // such as 於 vs 于, 吾 vs 我 or 弗 vs 不.
  import { FW_CATEGORIES, type FwCategory } from '../lib/data';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { analysis, app, model, textOrder } from '../lib/state.svelte';
  import Han from './Han.svelte';

  const LIMIT = 10;
  // log2 thresholds between the seven classes: ÷4 ÷2 ÷1.33 | ×1.33 ×2 ×4
  const BREAKS = [-2, -1, -Math.log2(4 / 3), Math.log2(4 / 3), 1, 2];
  const CLASSES = ['less-3', 'less-2', 'less-1', 'mid', 'more-1', 'more-2', 'more-3'];
  let cat = $state<FwCategory>('final');

  const manifest = $derived(model.manifest!);
  const m = $derived(analysis.matrix!);
  const f = $derived(analysis.freq!);

  const rows = $derived.by(() => {
    const sel = new Set(analysis.targetTexts);
    return textOrder(manifest).filter((i) => sel.has(i));
  });

  // Category members present in the selection, most frequent first.
  const members = $derived.by(() => {
    const fw = model.fw;
    if (!fw) return [] as number[];
    const out: number[] = [];
    for (const [item, e] of Object.entries(fw.items)) {
      if (!e.cat.includes(cat)) continue;
      const i = m.index.get(item);
      if (i !== undefined && f.count[i] > 0) out.push(i);
    }
    return out.sort((a, b) => f.count[b] - f.count[a]);
  });
  const columns = $derived(members.slice(0, LIMIT));

  /** per-text counts of one item */
  function perText(i: number): Map<number, number> {
    const out = new Map<number, number>();
    for (let k = m.offsets[i]; k < m.offsets[i + 1]; k++) out.set(m.text[k], m.count[k]);
    return out;
  }

  const grid = $derived.by(() => {
    const cols = columns.map(perText);
    const totals = new Map<number, number>();
    for (const i of members) for (const [ti, n] of perText(i)) totals.set(ti, (totals.get(ti) ?? 0) + n);
    const all = [...cols, totals];
    const values = rows.map((ti) => all.map((c) => ((c.get(ti) ?? 0) / manifest.texts[ti].tokens) * 1000));
    // per-thousand rate of each column over the whole selection
    const total = f.sel.total;
    const base = [
      ...columns.map((i) => (f.count[i] / total) * 1000),
      (members.reduce((n, i) => n + f.count[i], 0) / total) * 1000,
    ];
    return { values, base };
  });

  function cls(v: number, base: number): string {
    if (base <= 0) return 'mid';
    const lr = v > 0 ? Math.log2(v / base) : -Infinity;
    let k = 0;
    while (k < BREAKS.length && lr > BREAKS[k]) k++;
    return CLASSES[k];
  }
</script>

<div class="head">
  <h3>{t('charts.fw')}</h3>
  <label class="field inline">
    {t('charts.fw.category')}
    <select bind:value={cat}>
      {#each FW_CATEGORIES as c (c)}
        <option value={c}>{t(`fw.${c}`)}</option>
      {/each}
    </select>
  </label>
</div>
<p class="small muted">{t('charts.fw.desc')}</p>

{#if columns.length}
  <div class="scroller">
    <table>
      <thead>
        <tr>
          <th scope="col" class="corner"></th>
          {#each columns as i (i)}
            <th scope="col">
              <button type="button" class="item" onclick={() => (app.sel = m.items[i])}><Han text={m.items[i]} /></button>
            </th>
          {/each}
          <th scope="col" class="total small">{t('charts.fw.total')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as ti, r (ti)}
          {@const text = manifest.texts[ti]}
          <tr>
            <th scope="row">
              <Han text={text.title} />
              {#if text.year != null}<span class="small muted">{i18n.year(text.year)}</span>{/if}
            </th>
            {#each grid.values[r] as v, j (j)}
              {@const label = t('charts.fw.cell', {
                text: text.title,
                item: j < columns.length ? m.items[columns[j]] : t('charts.fw.total'),
                value: i18n.rate(v),
              })}
              <td class={cls(v, grid.base[j])} class:total={j === columns.length} title={label} aria-label={label}></td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="legend small secondary" aria-hidden="true">
    <span>÷{i18n.int(4)}</span>
    {#each CLASSES as c (c)}<span class="sw {c}"></span>{/each}
    <span>×{i18n.int(4)}</span>
  </div>
{/if}

<style>
  .head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 0.5rem 1rem; }
  h3 { margin: 0; }
  .inline { grid-auto-flow: column; align-items: center; gap: 0.5rem; }
  p { margin-block: 0.25rem 0.5rem; }
  .scroller { max-block-size: 30rem; overflow: auto; overscroll-behavior: contain; }
  table { border-collapse: separate; border-spacing: 2px; }
  thead th { position: sticky; inset-block-start: 0; z-index: 1; background: var(--surface); font-weight: normal; padding: 0.1rem; }
  thead th.total { color: var(--ink-2); padding-inline: 0.3rem; }
  .item { all: unset; cursor: pointer; font-size: 1.15rem; padding-inline: 0.2rem; border-radius: 4px; }
  .item:focus-visible { outline: 2px solid var(--focus); }
  .item:hover { background: var(--hover); }
  tbody th {
    position: sticky;
    inset-inline-start: 0;
    background: var(--surface);
    font-weight: normal;
    text-align: start;
    white-space: nowrap;
    padding-inline-end: 0.6rem;
    font-size: 0.875rem;
  }
  tbody th .muted { margin-inline-start: 0.3rem; }
  td { inline-size: 2rem; min-inline-size: 2rem; block-size: 1.35rem; border-radius: 3px; }
  td.total { inline-size: 2.4rem; }
  .mid { background: var(--diverge-mid); }
  .more-1 { background: var(--div-more-1); }
  .more-2 { background: var(--div-more-2); }
  .more-3 { background: var(--div-more-3); }
  .less-1 { background: var(--div-less-1); }
  .less-2 { background: var(--div-less-2); }
  .less-3 { background: var(--div-less-3); }
  td.total { box-shadow: inset 0 0 0 1px var(--axis); }
  .legend { display: flex; align-items: center; gap: 2px; margin-block-start: 0.5rem; }
  .legend > span:first-child { margin-inline-end: 0.3rem; }
  .legend > span:last-child { margin-inline-start: 0.3rem; }
  .sw { display: inline-block; inline-size: 1.2rem; block-size: 0.7rem; border-radius: 2px; }
  @media (forced-colors: active) {
    td { forced-color-adjust: none; }
  }
</style>
