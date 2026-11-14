<script lang="ts">
  import { CORPUS_IDS } from '../lib/data';
  import { blockOf, cpLabel, parseRS } from '../lib/han';
  import { i18n, t, type MessageKey } from '../lib/i18n/index.svelte';
  import { READING_LANG } from '../lib/readings';
  import { READINGS, settings } from '../lib/settings.svelte';
  import { analysis, app, model, presetFreq, textOrder } from '../lib/state.svelte';
  import { perMillion } from '../lib/stats';
  import Han from './Han.svelte';
  import LineChart, { type Series } from './LineChart.svelte';
  import { profile } from '../lib/pos';
  import type { FwCategory } from '../lib/data';

  const item = $derived(app.sel!);
  const isWord = $derived([...item].length > 1);
  const m = $derived(analysis.matrix!);
  const f = $derived(analysis.freq!);
  const k = $derived(analysis.keyness);
  const manifest = $derived(model.manifest!);
  const unihan = $derived(model.unihan!);
  const idx = $derived(m.index.get(item));
  const entry = $derived(isWord ? undefined : unihan[item]);
  const vertical = $derived(settings.writingMode === 'vertical');

  // ---- per-text counts of this item
  const cells = $derived.by(() => {
    const out = new Map<number, number>();
    if (idx === undefined) return out;
    for (let c = m.offsets[idx]; c < m.offsets[idx + 1]; c++) out.set(m.text[c], m.count[c]);
    return out;
  });

  let textSort = $state<'freq' | 'order'>('freq');
  let showAllTexts = $state(false);
  const order = $derived(textOrder(manifest));
  const byText = $derived.by(() => {
    const rows = analysis.targetTexts
      .filter((ti) => cells.has(ti))
      .map((ti) => ({ ti, count: cells.get(ti)!, ipm: perMillion(cells.get(ti)!, manifest.texts[ti].tokens) }));
    if (textSort === 'freq') rows.sort((a, b) => b.ipm - a.ipm);
    else {
      const pos = new Map(order.map((ti, p) => [ti, p]));
      rows.sort((a, b) => pos.get(a.ti)! - pos.get(b.ti)!);
    }
    return rows;
  });
  const maxIpm = $derived(Math.max(...byText.map((r) => r.ipm), 1e-9));
  const absent = $derived(analysis.targetTexts.length - byText.length);
  const LIMIT = 12;

  // ---- diachronic view over the official histories (fixed, independent of the selection)
  const overTime = $derived.by<Series[]>(() => {
    const byYear = new Map<number, { count: number; tokens: number; titles: string[] }>();
    manifest.texts.forEach((text, ti) => {
      if (!text.corpora.includes('zhengshi') || text.year == null) return;
      const y = byYear.get(text.year) ?? { count: 0, tokens: 0, titles: [] };
      y.count += cells.get(ti) ?? 0;
      y.tokens += text.tokens;
      y.titles.push(text.title);
      byYear.set(text.year, y);
    });
    const points = [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, y]) => ({ x: year, y: perMillion(y.count, y.tokens), note: y.titles.join('・') }));
    return [{ id: 'zhengshi', label: t('corpus.zhengshi'), color: 'var(--series-1)', points }];
  });
  const anyInHistories = $derived(overTime[0].points.some((p) => p.y > 0));

  // ---- by corpus
  const byCorpus = $derived(
    (['all', ...CORPUS_IDS] as const).map((c) => {
      const pf = presetFreq(m, c);
      return {
        c,
        count: idx === undefined ? 0 : pf.count[idx],
        ipm: idx === undefined ? 0 : perMillion(pf.count[idx], pf.sel.total),
        rank: idx === undefined ? 0 : pf.rank[idx],
        types: pf.types,
      };
    }),
  );

  // ---- words containing this character
  let wordsShown = $state(30);
  const containing = $derived.by(() => {
    const w = model.words;
    if (isWord || !w) return null;
    const wf = app.view === 'words' ? f : null;
    // rank words by their frequency in the current corpus
    const counts = wf?.count;
    const out: { word: string; count: number }[] = [];
    const sel = new Uint8Array(manifest.texts.length);
    for (const ti of analysis.targetTexts) sel[ti] = 1;
    for (let i = 0; i < w.items.length; i++) {
      if (!w.items[i].includes(item)) continue;
      let c = 0;
      if (counts) c = counts[i];
      else for (let j = w.offsets[i]; j < w.offsets[i + 1]; j++) if (sel[w.text[j]]) c += w.count[j];
      if (c > 0) out.push({ word: w.items[i], count: c });
    }
    out.sort((a, b) => b.count - a.count);
    return out;
  });

  $effect(() => {
    void item;
    showAllTexts = false;
    wordsShown = 30;
  });

  // ---- external references
  const uiLang = $derived(new Intl.Locale(i18n.locale).language);
  const links = $derived.by(() => {
    const wiki = ['zh', 'ja', 'ko', 'vi'].includes(uiLang) ? uiLang : 'en';
    const enc = encodeURIComponent(item);
    const simplified = new Intl.Locale(i18n.locale).maximize().script === 'Hans';
    const list = [{ name: 'Wiktionary', href: `https://${wiki}.wiktionary.org/wiki/${enc}` }];
    if (!isWord) {
      const cp = item.codePointAt(0)!.toString(16).toUpperCase();
      list.unshift({ name: 'Unihan', href: `https://www.unicode.org/cgi-bin/GetUnihanData.pl?codepoint=${cp}` });
      const ctextIf = uiLang === 'zh' ? (simplified ? 'gb' : 'zh') : 'en';
      list.push({ name: 'ctext.org', href: `https://ctext.org/dictionary.pl?if=${ctextIf}&char=${enc}` });
      list.push({ name: 'zi.tools', href: `https://zi.tools/zi/${enc}` });
    }
    list.push({ name: '漢典 zdic', href: `https://www.zdic.net/${simplified ? 'hans' : 'hant'}/${enc}` });
    return list;
  });

  const rs = $derived(parseRS(entry?.rs));
  const block = $derived(isWord ? undefined : blockOf(item, manifest.blocks));
  const VARIANTS = ['trad', 'simp', 'sem', 'spec', 'z', 'compat'] as const;

  // ---- parts of speech and function-word status
  const pos = $derived(model.pos ? profile(model.pos, item) : null);
  const glosses = $derived(model.pos?.gloss[item] ?? []);
  const fwEntry = $derived(model.fw?.items[item]);
  function filterBy(cat: FwCategory) {
    app.cls = 'function';
    app.fwCat = cat;
  }
</script>

<aside class="detail" aria-label={t('detail.label')}>
  <div class="head">
    <Han text={item} class="headword" vertical={vertical && isWord} />
    <button class="btn btn-ghost close" onclick={() => (app.sel = null)} aria-label={t('detail.close')}>✕</button>
  </div>

  {#if idx === undefined}
    <p class="muted">{t('detail.notInData')}</p>
  {:else}
    <section>
      <h3>{t('detail.frequency')}</h3>
      {#if f.count[idx] === 0}
        <p class="muted small">{t('detail.absent')}</p>
      {/if}
      <dl class="stats">
        <div><dt>{t('col.count')}</dt><dd>{i18n.int(f.count[idx])}</dd></div>
        <div><dt>{t('col.ipm')}</dt><dd>{i18n.rate(perMillion(f.count[idx], f.sel.total))}</dd></div>
        <div><dt>{t('col.rank')}</dt><dd>{f.rank[idx] ? t('detail.ofTotal', { value: f.rank[idx], total: f.types }) : '—'}</dd></div>
        <div><dt title={t('col.range.title')}>{t('col.range')}</dt><dd>{t('detail.ofTotal', { value: f.range[idx], total: f.sel.texts.length })}</dd></div>
        <div><dt title={t('col.dp.title')}>{t('col.dp')}</dt><dd>{Number.isNaN(f.dp[idx]) ? '—' : i18n.fixed(f.dp[idx], 2)}</dd></div>
        {#if k}
          <div><dt>{t('col.refIpm')}</dt><dd>{i18n.rate(perMillion(k.refCount[idx], k.refTotal))}</dd></div>
          <div><dt title={t('col.logRatio.title')}>{t('col.logRatio')}</dt><dd>{i18n.signed(k.lr[idx], 2)}</dd></div>
          <div><dt title={t('col.g2.title')}>{t('col.g2')}</dt><dd>{i18n.signed(k.g2[idx], 1)}</dd></div>
        {/if}
      </dl>
    </section>

    <section>
      <h3>{t('detail.byCorpus')}</h3>
      <table class="small">
        <thead>
          <tr>
            <th scope="col">{t('corpus.heading')}</th>
            <th scope="col" class="num">{t('col.ipm')}</th>
            <th scope="col" class="num">{t('col.rank')}</th>
          </tr>
        </thead>
        <tbody>
          {#each byCorpus as r (r.c)}
            <tr>
              <th scope="row">{t(`corpus.${r.c}` as MessageKey)}</th>
              <td class="num">{i18n.rate(r.ipm)}</td>
              <td class="num">{r.rank ? t('detail.ofTotal', { value: r.rank, total: r.types }) : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if !isWord}
    <section>
      <dl class="facts">
        <div><dt>{t('detail.codepoint')}</dt><dd><code>{cpLabel(item)}</code></dd></div>
        {#if block}<div><dt>{t('detail.block')}</dt><dd lang="en">{block.name}</dd></div>{/if}
        {#if rs}
          <div>
            <dt>{t('detail.radical')}</dt>
            <dd>
              {t('detail.radicalValue', {
                radical: manifest.radicals[rs.key] ?? manifest.radicals[String(rs.number)] ?? '?',
                number: rs.number,
                residual: rs.residual,
              })}
            </dd>
          </div>
        {/if}
        {#if entry?.ts}<div><dt>{t('detail.strokes')}</dt><dd>{i18n.int(entry.ts)}</dd></div>{/if}
      </dl>
    </section>

    {#if entry}
      <section>
        <h3>{t('detail.readings')}</h3>
        <dl class="facts">
          {#each READINGS as r (r)}
            {#if entry[r]?.length}
              <div>
                <dt>{t(`reading.${r}` as MessageKey)}</dt>
                <dd>
                  {#if r === 'fq'}<Han text={entry.fq!.map((s) => s + '切').join('、')} />{:else}<span lang={READING_LANG[r]}>{entry[r]!.join(r === 'jpn' ? '、' : ', ')}</span>{/if}
                </dd>
              </div>
            {/if}
          {/each}
          {#if entry.gsr}<div><dt>{t('detail.gsr')}</dt><dd>{entry.gsr}</dd></div>{/if}
        </dl>
        {#if entry.def}
          <p class="gloss"><span class="small secondary">{t('detail.gloss')}</span><br /><span lang="en">{entry.def}</span></p>
        {/if}
      </section>

      {#if VARIANTS.some((v) => entry[v]?.length)}
        <section>
          <h3>{t('detail.variants')}</h3>
          <dl class="facts">
            {#each VARIANTS as v (v)}
              {#if entry[v]?.length}
                <div>
                  <dt>{t(`variant.${v}`)}</dt>
                  <dd class="chips">
                    {#each entry[v]! as ch (ch)}
                      {#if model.chars?.index.has(ch)}
                        <button class="chip" onclick={() => app.open(ch)}><Han text={ch} /></button>
                      {:else}
                        <span class="chip disabled" title={t('detail.notInData')}><Han text={ch} /></span>
                      {/if}
                    {/each}
                  </dd>
                </div>
              {/if}
            {/each}
          </dl>
        </section>
      {/if}
    {/if}
  {:else}
    <section>
      <h3>{t('detail.components')}</h3>
      <div class="chips">
        {#each [...item] as ch, j (j)}
          <button class="chip" onclick={() => app.open(ch)}>
            <Han text={ch} />
            {#if unihan[ch]?.cmn}<span class="small secondary" lang="zh-Latn-pinyin">{unihan[ch].cmn![0]}</span>{/if}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if fwEntry}
    <section>
      <h3>{t('detail.function')}</h3>
      <div class="chips">
        {#each fwEntry.cat as c (c)}
          <button class="chip small" onclick={() => filterBy(c)}>{t(`fw.${c}`)}</button>
        {/each}
        {#if fwEntry.vernacular}<span class="chip small disabled">{t('fw.vernacular')}</span>{/if}
      </div>
    </section>
  {/if}

  {#if model.pos}
    <section>
      <h3>{t('detail.pos')}</h3>
      {#if pos}
        <p class="small muted">{t('detail.pos.desc', { count: pos.n })}</p>
        <ul class="bars">
          {#each pos.dist as d (d.tag)}
            <li title="{d.tag} · {i18n.int(d.count)}">
              <span class="bar-label">{t(`upos.${d.tag}` as MessageKey)}</span>
              <span class="track"><span class="fill" style="inline-size: {d.share * 100}%"></span></span>
              <span class="num"><strong>{d.share < 0.005 ? '<' + i18n.pct(0.01, 0) : i18n.pct(d.share, 0)}</strong></span>
            </li>
          {/each}
        </ul>
        <dl class="facts">
          <div>
            <dt title={t('detail.pos.entropy.title')}>{t('detail.pos.entropy')}</dt>
            <dd>{t('detail.pos.entropyValue', { value: i18n.fixed(pos.entropy, 2) })}</dd>
          </div>
        </dl>
        {#if glosses.length}
          <div class="glosses">
            <span class="small secondary">{t('detail.glosses')}</span>
            <div class="chips">
              {#each glosses as [g, n] (g)}
                <span class="chip small gloss-chip" lang="en">{g} <span class="muted">{i18n.int(n)}</span></span>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <p class="small muted">{t('detail.pos.none')}</p>
      {/if}
    </section>
  {/if}

  {#if idx !== undefined && byText.length}
    <section>
      <div class="section-head">
        <h3>{t('detail.byText')}</h3>
        <div class="segmented small">
          {#each ['freq', 'order'] as const as s (s)}
            <button type="button" aria-pressed={textSort === s} onclick={() => (textSort = s)}>{t(`detail.sort.${s}`)}</button>
          {/each}
        </div>
      </div>
      <p class="small muted">{t('detail.byText.desc')}</p>
      <ul class="bars">
        {#each showAllTexts ? byText : byText.slice(0, LIMIT) as r (r.ti)}
          {@const text = manifest.texts[r.ti]}
          <li title="{text.en} · {i18n.int(r.count)}">
            <Han text={text.title} class="bar-label" />
            <span class="track"><span class="fill" style="inline-size: {(r.ipm / maxIpm) * 100}%"></span></span>
            <span class="num"><strong>{i18n.rate(r.ipm)}</strong></span>
          </li>
        {/each}
      </ul>
      {#if byText.length > LIMIT}
        <button class="btn btn-ghost small link" onclick={() => (showAllTexts = !showAllTexts)}>
          {showAllTexts ? t('detail.showFewer') : t('detail.showAll', { count: byText.length })}
        </button>
      {/if}
      {#if absent > 0}
        <p class="small muted">{t('detail.absentFrom', { count: absent })}</p>
      {/if}
    </section>
  {/if}

  {#if idx !== undefined && anyInHistories}
    <section>
      <h3>{t('detail.overTime')}</h3>
      <p class="small muted">{t('detail.overTime.desc')}</p>
      <LineChart
        series={overTime}
        markers
        height={180}
        yMin={0}
        formatX={(x) => i18n.year(Math.round(x))}
        formatY={(y) => i18n.rate(y)}
        label={t('detail.overTime')}
        xLabel=""
      />
    </section>
  {/if}

  {#if !isWord}
    <section>
      <h3>{t('detail.words', { item })}</h3>
      {#if containing === null}
        {#if model.wordsStatus === 'loading'}
          <p class="small muted" role="status">{t('loading.words')}</p>
        {:else}
          <button class="btn" onclick={() => model.loadWords()}>{t('detail.loadWords')}</button>
        {/if}
      {:else if containing.length === 0}
        <p class="small muted">{t('detail.noWords')}</p>
      {:else}
        <div class="chips">
          {#each containing.slice(0, wordsShown) as w (w.word)}
            <button class="chip" onclick={() => app.open(w.word)}>
              <Han text={w.word} /><span class="small muted">{i18n.int(w.count)}</span>
            </button>
          {/each}
        </div>
        {#if containing.length > wordsShown}
          <button class="btn btn-ghost small link" onclick={() => (wordsShown = containing.length)}>
            {t('detail.showAll', { count: containing.length })}
          </button>
        {/if}
      {/if}
    </section>
  {/if}

  <section>
    <h3>{t('detail.links')}</h3>
    <ul class="links">
      {#each links as l (l.name)}
        <li><a href={l.href} target="_blank" rel="noopener noreferrer">{l.name}</a></li>
      {/each}
    </ul>
  </section>
</aside>

<style>
  .detail {
    position: sticky;
    inset-block-start: calc(var(--header-h) + 1rem);
    max-block-size: calc(100dvh - var(--header-h) - 2rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: calc(var(--radius) * 1.5);
    padding: 1rem;
    display: grid;
    gap: 1.1rem;
    align-content: start;
  }
  .head { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
  .head :global(.headword) { font-size: 4.5rem; line-height: 1.1; }
  /* An orthogonal-flow box needs an explicit extent, or it overflows its row. */
  .head :global(.headword.vertical) { display: block; inline-size: max-content; font-size: 3.25rem; }
  section { display: grid; gap: 0.4rem; min-inline-size: 0; }
  h3 { margin: 0; font-size: 0.875rem; color: var(--ink-2); font-weight: 600; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
  p { margin: 0; }
  dl { margin: 0; }
  .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); gap: 0.5rem 1rem; }
  .stats dt, .facts dt { font-size: 0.75rem; color: var(--ink-2); }
  .stats dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
  .facts { display: grid; gap: 0.3rem; }
  .facts > div { display: grid; grid-template-columns: minmax(6.5rem, auto) 1fr; gap: 0.75rem; align-items: baseline; }
  .facts dd { margin: 0; overflow-wrap: anywhere; }
  .gloss { margin-block-start: 0.3rem; }
  table { border-collapse: collapse; inline-size: 100%; }
  th, td { padding-block: 0.2rem; padding-inline: 0.4rem; border-block-end: 1px solid var(--grid); text-align: start; font-weight: normal; }
  thead th { color: var(--ink-2); font-size: 0.75rem; }
  th.num, td.num { text-align: end; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    padding-block: 0.15rem;
    padding-inline: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    font-size: 1.05rem;
    cursor: pointer;
  }
  .chip:hover { background: var(--hover); }
  .chip.disabled { cursor: default; color: var(--muted); }
  .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .chip.small { font-size: 0.8125rem; }
  .gloss-chip { cursor: default; }
  .glosses { display: grid; gap: 0.3rem; }
  .bars li { display: grid; grid-template-columns: minmax(4.5rem, 7rem) 1fr auto; gap: 0.5rem; align-items: center; font-size: 0.875rem; }
  .bars :global(.bar-label) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { block-size: 10px; }
  /* Square at the baseline (inline start), rounded at the data end. */
  .fill { display: block; block-size: 100%; min-inline-size: 1px; background: var(--series-1); border-start-end-radius: 4px; border-end-end-radius: 4px; }
  .link { color: var(--link); justify-self: start; padding-inline: 0; }
  .links { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; list-style: none; margin: 0; padding: 0; }

  @media (max-width: 1280px) {
    .detail {
      position: fixed;
      inset-block: 0;
      inset-inline-end: 0;
      z-index: 30;
      inline-size: min(28rem, 100vw);
      max-block-size: none;
      border-radius: 0;
      box-shadow: 0 0 40px rgba(0, 0, 0, 0.25);
    }
  }
</style>
