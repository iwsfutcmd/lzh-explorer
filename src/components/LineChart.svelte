<script lang="ts" module>
  export interface Point {
    x: number;
    y: number;
    /** shown in the tooltip next to the value, e.g. the item at this rank */
    note?: string;
  }
  export interface Series {
    id: string;
    label: string;
    /** CSS color, normally a palette variable */
    color: string;
    points: Point[];
  }
</script>

<script lang="ts">
  // Minimal SVG line chart: log or linear axes, crosshair tooltip, keyboard
  // access, mirrored x axis in right-to-left locales. Tick labels are numbers
  // only; titles live in HTML around the chart so they get proper bidi.
  import { i18n } from '../lib/i18n/index.svelte';
  import Han from './Han.svelte';

  let {
    series,
    xLog = false,
    yLog = false,
    formatX,
    formatY,
    height = 220,
    markers = false,
    yMin,
    yMax,
    label,
    xLabel,
  }: {
    series: Series[];
    xLog?: boolean;
    yLog?: boolean;
    formatX: (x: number) => string;
    formatY: (y: number) => string;
    height?: number;
    markers?: boolean;
    yMin?: number;
    yMax?: number;
    label: string;
    xLabel: string;
  } = $props();

  let width = $state(480);
  const rtl = $derived(i18n.dir === 'rtl');
  const M = { start: 52, end: 16, top: 10, bottom: 26 };

  const all = $derived(series.flatMap((s) => s.points));
  const fx = (v: number) => (xLog ? Math.log10(Math.max(v, 1e-9)) : v);
  const fy = (v: number) => (yLog ? Math.log10(Math.max(v, 1e-9)) : v);

  const xDom = $derived.by(() => {
    if (!all.length) return [0, 1];
    let lo = Math.min(...all.map((p) => fx(p.x)));
    let hi = Math.max(...all.map((p) => fx(p.x)));
    if (lo === hi) hi = lo + 1;
    return [lo, hi];
  });
  const yDom = $derived.by(() => {
    if (!all.length) return [0, 1];
    let lo = yMin !== undefined ? fy(yMin) : Math.min(...all.map((p) => fy(p.y)));
    let hi = yMax !== undefined ? fy(yMax) : Math.max(...all.map((p) => fy(p.y)));
    if (yLog) {
      lo = Math.floor(lo);
      hi = Math.ceil(hi);
    }
    if (lo === hi) hi = lo + 1;
    return [lo, hi];
  });

  const plotW = $derived(Math.max(10, width - M.start - M.end));
  const plotH = $derived(height - M.top - M.bottom);
  const px = (v: number) => {
    const t = (fx(v) - xDom[0]) / (xDom[1] - xDom[0]);
    return rtl ? width - M.start - t * plotW : M.start + t * plotW;
  };
  const py = (v: number) => M.top + plotH - ((fy(v) - yDom[0]) / (yDom[1] - yDom[0])) * plotH;

  function niceLinear(lo: number, hi: number, n = 5): number[] {
    const raw = (hi - lo) / n;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const logTicks = (lo: number, hi: number) => {
    const out = [];
    for (let e = Math.ceil(lo - 1e-9); e <= Math.floor(hi + 1e-9); e++) out.push(10 ** e);
    return out;
  };
  const xTicks = $derived(xLog ? logTicks(xDom[0], xDom[1]) : niceLinear(xDom[0], xDom[1], Math.max(2, Math.floor(plotW / 90))));
  const yTicks = $derived(yLog ? logTicks(yDom[0], yDom[1]) : niceLinear(yDom[0], yDom[1], 4));

  const paths = $derived(
    series.map((s) => ({
      ...s,
      d: s.points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(''),
    })),
  );

  // ---- hover / keyboard
  let active = $state<number | null>(null); // index into series[0].points
  const base = $derived(series[0]?.points ?? []);

  function nearest(points: Point[], x: number): number {
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (fx(points[mid].x) < fx(x)) lo = mid;
      else hi = mid;
    }
    return Math.abs(fx(points[lo].x) - fx(x)) <= Math.abs(fx(points[hi].x) - fx(x)) ? lo : hi;
  }

  function onMove(e: PointerEvent) {
    if (!base.length) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const xPix = ((e.clientX - rect.left) / rect.width) * width;
    const t = rtl ? (width - M.start - xPix) / plotW : (xPix - M.start) / plotW;
    const v = xDom[0] + Math.min(1, Math.max(0, t)) * (xDom[1] - xDom[0]);
    active = nearest(base, xLog ? 10 ** v : v);
  }

  function onKey(e: KeyboardEvent) {
    if (!base.length) return;
    const visualRight = e.key === 'ArrowRight';
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const cur = active ?? 0;
    if (e.key === 'Home') active = 0;
    else if (e.key === 'End') active = base.length - 1;
    else {
      const forward = rtl ? !visualRight : visualRight;
      active = Math.min(base.length - 1, Math.max(0, cur + (forward ? step : -step)));
    }
  }

  const readout = $derived.by(() => {
    if (active === null || !base[active]) return null;
    const x = base[active].x;
    return {
      x,
      left: px(x),
      rows: series.map((s) => {
        const p = s.points.length ? s.points[nearest(s.points, x)] : undefined;
        return { s, p: p && Math.abs(fx(p.x) - fx(x)) < 1e-9 ? p : p && !markers ? p : undefined };
      }),
    };
  });
</script>

<figure class="chart">
  <div class="plot" bind:clientWidth={width}>
    <!-- Focusable so the crosshair can be moved with the arrow keys. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      viewBox="0 0 {width} {height}"
      width="100%"
      {height}
      role="img"
      aria-label={label}
      tabindex="0"
      onpointermove={onMove}
      onpointerleave={() => (active = null)}
      onkeydown={onKey}
      onblur={() => (active = null)}
    >
      <g class="grid">
        {#each yTicks as v (v)}
          <line x1={M.start} x2={width - M.end} y1={py(v)} y2={py(v)} transform={rtl ? `translate(${M.end - M.start} 0)` : undefined} />
        {/each}
      </g>
      <g class="ticks">
        {#each yTicks as v (v)}
          <text x={rtl ? width - M.start + 6 : M.start - 6} y={py(v)} dy="0.32em" text-anchor={rtl ? 'start' : 'end'}>{formatY(v)}</text>
        {/each}
        {#each xTicks as v (v)}
          <text x={px(v)} y={height - 6} text-anchor="middle">{formatX(v)}</text>
        {/each}
      </g>
      <line class="baseline" x1={rtl ? M.end : M.start} x2={rtl ? width - M.start : width - M.end} y1={M.top + plotH} y2={M.top + plotH} />
      {#each paths as p (p.id)}
        <path d={p.d} fill="none" stroke={p.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        {#if markers}
          {#each p.points as pt, i (i)}
            <circle cx={px(pt.x)} cy={py(pt.y)} r="4" fill={p.color} stroke="var(--surface)" stroke-width="2" />
          {/each}
        {/if}
      {/each}
      {#if readout}
        <line class="crosshair" x1={readout.left} x2={readout.left} y1={M.top} y2={M.top + plotH} />
        {#each readout.rows as r (r.s.id)}
          {#if r.p}
            <circle cx={px(r.p.x)} cy={py(r.p.y)} r="4.5" fill={r.s.color} stroke="var(--surface)" stroke-width="2" />
          {/if}
        {/each}
      {/if}
    </svg>
    {#if readout}
      <div class="tooltip" style="left: {Math.min(Math.max(readout.left, 90), width - 90)}px" role="status">
        <div class="tt-x small secondary">{xLabel} {formatX(readout.x)}</div>
        {#each readout.rows as r (r.s.id)}
          {#if r.p}
            <div class="tt-row">
              <span class="key" style="background: {r.s.color}"></span>
              <strong>{formatY(r.p.y)}</strong>
              {#if r.p.note}<Han text={r.p.note} />{/if}
              {#if series.length > 1}<span class="small secondary">{r.s.label}</span>{/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
  {#if series.length > 1}
    <figcaption class="legend small secondary">
      {#each series as s (s.id)}
        <span class="legend-item"><span class="key" style="background: {s.color}"></span>{s.label}</span>
      {/each}
    </figcaption>
  {/if}
</figure>

<style>
  figure { margin: 0; }
  .plot { position: relative; }
  svg { display: block; overflow: visible; touch-action: pan-y; }
  svg:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
  .grid line { stroke: var(--grid); stroke-width: 1; }
  .baseline { stroke: var(--axis); stroke-width: 1; }
  .crosshair { stroke: var(--muted); stroke-width: 1; }
  .ticks text {
    font-size: 11px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
    direction: ltr;
    unicode-bidi: isolate;
  }
  .tooltip {
    position: absolute;
    inset-block-start: 0;
    translate: -50% 0;
    pointer-events: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding-block: 0.35rem;
    padding-inline: 0.6rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
    white-space: nowrap;
    font-size: 0.8125rem;
    z-index: 2;
  }
  .tt-row { display: flex; align-items: center; gap: 0.4rem; }
  .key { display: inline-block; inline-size: 14px; block-size: 2px; border-radius: 1px; flex: none; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; margin-block-start: 0.35rem; }
  .legend-item { display: inline-flex; align-items: center; gap: 0.35rem; }
</style>
