<script lang="ts">
  import { tick } from 'svelte';
  import { i18n, t, type MessageKey } from '../lib/i18n/index.svelte';
  import { READING_LANG } from '../lib/readings';
  import { settings } from '../lib/settings.svelte';
  import { analysis, app, model, type SortKey } from '../lib/state.svelte';
  import { perMillion } from '../lib/stats';
  import { MIN_TOKENS, posColumns } from '../lib/pos';
  import Han from './Han.svelte';

  interface Col {
    id: string;
    label: MessageKey;
    title?: MessageKey;
    sort?: SortKey;
    num?: boolean;
  }

  const isChars = $derived(app.view === 'chars');
  const k = $derived(analysis.keyness);
  const showFw = $derived(app.cls === 'function' || !!app.fwCat);
  const posCols = $derived(model.pos && analysis.matrix ? posColumns(analysis.matrix, model.pos) : null);

  function fwLabel(item: string): string {
    const e = model.fw?.items[item];
    if (!e) return '';
    const cats = e.cat.map((c) => t(`fw.${c}`)).join(', ');
    return e.vernacular ? `${cats} (${t('fw.vernacular')})` : cats;
  }
  const cols = $derived<Col[]>([
    { id: 'rank', label: 'col.rank', sort: 'count', num: true },
    { id: 'item', label: isChars ? 'col.char' : 'col.word', sort: 'item' },
    ...(isChars
      ? [
          { id: 'reading', label: `reading.${settings.resolvedReading}` as MessageKey },
          { id: 'gloss', label: 'col.gloss' as MessageKey },
        ]
      : []),
    ...(showFw ? [{ id: 'fw', label: 'col.fw' as MessageKey }] : []),
    ...(posCols ? [{ id: 'pos', label: 'col.pos' as MessageKey, title: 'col.pos.title' as MessageKey, sort: 'pos' as SortKey }] : []),
    { id: 'count', label: 'col.count', sort: 'count', num: true },
    { id: 'ipm', label: 'col.ipm', title: 'col.ipm.title', sort: 'count', num: true },
    { id: 'range', label: 'col.range', title: 'col.range.title', sort: 'range', num: true },
    { id: 'dp', label: 'col.dp', title: 'col.dp.title', sort: 'dp', num: true },
    ...(isChars ? [{ id: 'cum', label: 'col.cum' as MessageKey, title: 'col.cum.title' as MessageKey, sort: 'count' as SortKey, num: true }] : []),
    ...(k
      ? [
          { id: 'refIpm', label: 'col.refIpm' as MessageKey, sort: 'refIpm' as SortKey, num: true },
          { id: 'lr', label: 'col.logRatio' as MessageKey, title: 'col.logRatio.title' as MessageKey, sort: 'logRatio' as SortKey, num: true },
          { id: 'g2', label: 'col.g2' as MessageKey, title: 'col.g2.title' as MessageKey, sort: 'g2' as SortKey, num: true },
        ]
      : []),
  ]);

  // ---- virtual scrolling against the window
  let tbody: HTMLTableSectionElement | undefined = $state();
  let rowH = $state(36);
  let first = $state(0);
  let last = $state(60);
  const OVERSCAN = 12;

  function update() {
    if (!tbody) return;
    const top = tbody.getBoundingClientRect().top;
    const n = analysis.results.length;
    first = Math.max(0, Math.min(n, Math.floor(-top / rowH) - OVERSCAN));
    last = Math.max(first, Math.min(n, Math.ceil((innerHeight - top) / rowH) + OVERSCAN));
  }

  $effect(() => {
    void analysis.results;
    void cols.length;
    tick().then(() => {
      const row = tbody?.querySelector<HTMLTableRowElement>('tr.row');
      if (row && row.offsetHeight) rowH = row.offsetHeight;
      update();
    });
  });

  const rows = $derived(Array.from(analysis.results.subarray(first, last)));
  // Roving tabindex: one row button is in the tab order — the selected row
  // if it is rendered, otherwise the first rendered row.
  const tabPos = $derived.by(() => {
    const idx = app.sel ? analysis.matrix?.index.get(app.sel) : undefined;
    const pos = idx === undefined ? -1 : analysis.results.indexOf(idx);
    return pos >= first && pos < last ? pos : first;
  });
  const m = $derived(analysis.matrix!);
  const f = $derived(analysis.freq!);
  const unihan = $derived(model.unihan!);

  function ariaSort(c: Col) {
    if (!c.sort || c.sort !== app.sortKey) return undefined;
    if (c.sort === 'count' && c.id !== 'count') return undefined;
    return app.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  // ---- keyboard navigation between rows
  async function onKeydown(e: KeyboardEvent) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pos]');
    if (!btn) return;
    const n = analysis.results.length;
    const pos = Number(btn.dataset.pos);
    const page = Math.max(1, Math.floor(innerHeight / rowH) - 3);
    const next =
      e.key === 'ArrowDown' ? pos + 1
      : e.key === 'ArrowUp' ? pos - 1
      : e.key === 'PageDown' ? pos + page
      : e.key === 'PageUp' ? pos - page
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    const target = Math.min(n - 1, Math.max(0, next));
    app.sel = m.items[analysis.results[target]];
    // keep the row in view below the sticky headers
    const top = tbody!.getBoundingClientRect().top + scrollY + target * rowH;
    const headH = tbody!.parentElement!.querySelector('thead')!.getBoundingClientRect().height;
    const stickyTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) + headH;
    if (top < scrollY + stickyTop) scrollTo({ top: top - stickyTop });
    else if (top + rowH > scrollY + innerHeight) scrollTo({ top: top + rowH - innerHeight });
    update();
    await tick();
    tbody?.querySelector<HTMLButtonElement>(`button[data-pos="${target}"]`)?.focus();
  }

  const lrMax = 4;
</script>

<svelte:window onscroll={update} onresize={update} />

<div class="wrap card" class:has-ref={!!k}>
  <table>
    <thead>
      <tr>
        {#each cols as c (c.id)}
          <th scope="col" class:num={c.num} class="col-{c.id}" aria-sort={ariaSort(c)} title={c.title ? t(c.title) : undefined}>
            {#if c.sort}
              <button type="button" onclick={() => app.setSort(c.id === 'rank' || c.id === 'ipm' || c.id === 'cum' ? 'count' : c.sort!)}>
                {t(c.label)}
                <span class="arrow" aria-hidden="true">{ariaSort(c) === 'ascending' ? '▲' : ariaSort(c) === 'descending' ? '▼' : ''}</span>
              </button>
            {:else}
              {t(c.label)}
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <!-- Delegated arrow-key navigation between the row buttons. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <tbody bind:this={tbody} onkeydown={onKeydown}>
      {#if first > 0}
        <tr class="spacer" aria-hidden="true"><td colspan={cols.length} style="block-size: {first * rowH}px"></td></tr>
      {/if}
      {#each rows as i, j (i)}
        {@const item = m.items[i]}
        {@const e = unihan[item]}
        {@const pos = first + j}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <tr class="row" class:selected={app.sel === item} onclick={() => (app.sel = item)}>
          {#each cols as c (c.id)}
            {#if c.id === 'rank'}
              <td class="num muted rank">{f.rank[i] ? i18n.int(f.rank[i]) : '—'}</td>
            {:else if c.id === 'item'}
              <td class="item">
                <button type="button" data-pos={pos} aria-current={app.sel === item ? 'true' : undefined} tabindex={pos === tabPos ? 0 : -1}>
                  <Han text={item} />
                </button>
              </td>
            {:else if c.id === 'reading'}
              {@const r = settings.resolvedReading}
              <td class="reading">
                {#if r === 'fq'}<Han text={e?.fq?.join('、') ?? ''} />{:else}<span lang={READING_LANG[r]}>{e?.[r]?.join(r === 'jpn' ? '、' : ', ') ?? ''}</span>{/if}
              </td>
            {:else if c.id === 'gloss'}
              <td class="gloss" lang="en" title={e?.def}>{e?.def ?? ''}</td>
            {:else if c.id === 'fw'}
              <td class="fw">{fwLabel(item)}</td>
            {:else if c.id === 'pos' && posCols}
              {@const d = posCols.dominant[i]}
              {#if d >= 0}
                {@const label = t(`upos.${model.pos!.upos[d]}` as MessageKey)}
                <td class="pos" class:low={posCols.n[i] < MIN_TOKENS} title="{label} {i18n.pct(posCols.share[i], 0)} · n = {i18n.int(posCols.n[i])}"
                  >{label} <span class="share">{i18n.pct(posCols.share[i], 0)}</span></td
                >
              {:else}
                <td class="pos low">—</td>
              {/if}
            {:else if c.id === 'count'}
              <td class="num count">{i18n.int(f.count[i])}</td>
            {:else if c.id === 'ipm'}
              <td class="num">{i18n.rate(perMillion(f.count[i], f.sel.total))}</td>
            {:else if c.id === 'range'}
              <td class="num range">{i18n.int(f.range[i])}</td>
            {:else if c.id === 'dp'}
              <td class="num dp">{Number.isNaN(f.dp[i]) ? '—' : i18n.fixed(f.dp[i], 2)}</td>
            {:else if c.id === 'cum'}
              <td class="num cum">{Number.isNaN(analysis.cumulative?.[i] ?? NaN) ? '—' : i18n.pct(analysis.cumulative![i], 1)}</td>
            {:else if c.id === 'refIpm' && k}
              <td class="num">{i18n.rate(perMillion(k.refCount[i], k.refTotal))}</td>
            {:else if c.id === 'lr' && k}
              {@const lr = k.lr[i]}
              <td class="num">
                <span class="lr">
                  <span class="diverge" aria-hidden="true">
                    <span
                      class="bar"
                      class:pos={lr > 0}
                      class:neg={lr < 0}
                      style="inline-size: {(Math.min(Math.abs(lr), lrMax) / lrMax) * 50}%"
                    ></span>
                  </span>
                  {i18n.signed(lr, 2)}
                </span>
              </td>
            {:else if c.id === 'g2' && k}
              <td class="num">{i18n.signed(k.g2[i], 1)}</td>
            {/if}
          {/each}
        </tr>
      {/each}
      {#if last < analysis.results.length}
        <tr class="spacer" aria-hidden="true"><td colspan={cols.length} style="block-size: {(analysis.results.length - last) * rowH}px"></td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  /* overflow: clip (not auto) so the header stays sticky against the window;
     columns that don't fit are dropped by priority instead (below). */
  .wrap { padding: 0; overflow-x: clip; container-type: inline-size; }
  table { inline-size: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.9rem; }
  thead th {
    position: sticky;
    inset-block-start: var(--header-h);
    z-index: 1;
    background: var(--surface);
    border-block-end: 1px solid var(--axis);
    font-weight: 600;
    font-size: 0.8125rem;
    color: var(--ink-2);
    text-align: start;
    padding-block: 0.4rem;
    padding-inline: 0.6rem;
    vertical-align: bottom;
  }
  thead th.num { text-align: end; }
  thead th button {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    gap: 0.25rem;
    align-items: center;
  }
  thead th button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .arrow { font-size: 0.6rem; inline-size: 0.6rem; }
  tbody tr.row { block-size: var(--row-h); cursor: pointer; }
  tbody tr.row:hover { background: var(--hover); }
  tbody tr.row.selected { background: var(--selected); }
  td {
    padding-block: 0;
    padding-inline: 0.6rem;
    border-block-end: 1px solid var(--grid);
    white-space: nowrap;
  }
  .spacer td { padding: 0; border: 0; }
  .item button {
    all: unset;
    cursor: pointer;
    font-size: 1.3rem;
    line-height: 1;
    padding-block: 0.2rem;
    padding-inline: 0.2rem;
    border-radius: 4px;
  }
  .item button:focus-visible { outline: 2px solid var(--focus); }
  .reading { color: var(--ink-2); max-inline-size: 9rem; overflow: hidden; text-overflow: ellipsis; }
  .gloss { color: var(--ink-2); max-inline-size: 18rem; overflow: hidden; text-overflow: ellipsis; }
  .pos, .fw { color: var(--ink-2); max-inline-size: 11rem; overflow: hidden; text-overflow: ellipsis; font-size: 0.8125rem; }
  .pos .share { font-variant-numeric: tabular-nums; color: var(--muted); }
  .pos.low { color: var(--muted); }
  .lr { display: inline-flex; align-items: center; gap: 0.4rem; }
  .diverge { position: relative; inline-size: 3.5rem; block-size: 8px; background: var(--diverge-mid); border-radius: 4px; flex: none; }
  .diverge::after { content: ''; position: absolute; inset-inline-start: 50%; inset-block: -2px; inline-size: 1px; background: var(--axis); }
  .bar { position: absolute; inset-block: 0; }
  .bar.pos { inset-inline-start: 50%; background: var(--series-1); border-start-end-radius: 4px; border-end-end-radius: 4px; }
  .bar.neg { inset-inline-end: 50%; background: var(--series-2); border-start-start-radius: 4px; border-end-start-radius: 4px; }
  /* Drop the least important columns first as the table narrows. Every value
     stays available in the details panel and the CSV export. */
  @container (max-width: 860px) { .col-gloss, td.gloss { display: none; } }
  @container (max-width: 740px) { .col-pos, td.pos { display: none; } }
  @container (max-width: 660px) { .col-cum, td.cum { display: none; } }
  @container (max-width: 580px) { .col-reading, td.reading { display: none; } }
  @container (max-width: 500px) { .col-range, td.range, .col-rank, td.rank { display: none; } }
  @container (max-width: 440px) { .col-fw, td.fw { display: none; } }
  @container (max-width: 1180px) { .has-ref :is(.col-gloss, td.gloss) { display: none; } }
  @container (max-width: 1080px) { .has-ref :is(.col-pos, td.pos) { display: none; } }
  @container (max-width: 980px) { .has-ref :is(.col-cum, td.cum) { display: none; } }
  @container (max-width: 900px) { .has-ref :is(.col-reading, td.reading) { display: none; } }
  @container (max-width: 820px) { .has-ref :is(.col-range, td.range) { display: none; } }
  @container (max-width: 740px) { .has-ref :is(.col-rank, td.rank) { display: none; } }
  @container (max-width: 680px) { .has-ref :is(.col-fw, td.fw) { display: none; } }
  @container (max-width: 620px) { .has-ref :is(.col-dp, td.dp, .col-count, td.count) { display: none; } }
</style>
