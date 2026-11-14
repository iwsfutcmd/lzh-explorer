<script lang="ts">
  import { FW_CATEGORIES } from '../lib/data';
  import { t, type MessageKey } from '../lib/i18n/index.svelte';
  import { app, model } from '../lib/state.svelte';

  const isWords = $derived(app.view === 'words');
  const manifest = $derived(model.manifest!);

  // Kangxi radicals 1–214 (the unified-ideograph forms).
  const radicals = $derived(
    Object.entries(manifest.radicals)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, ch]) => ({ n: Number(k), ch }))
      .sort((a, b) => a.n - b.n),
  );

  function num(e: Event & { currentTarget: HTMLInputElement }): number | null {
    const v = e.currentTarget.value.trim();
    return v === '' ? null : Math.max(0, Math.floor(Number(v)));
  }

  function toggleLength(n: number, on: boolean) {
    const s = new Set(app.lengths);
    if (on) s.add(n);
    else s.delete(n);
    app.lengths = [...s].sort();
  }

  // Parts of speech that occur as a dominant tag in the treebank.
  const posTags = $derived(model.pos ? model.pos.upos.filter((_, i) => Object.values(model.pos!.items).some((r) => r[0][0] === i)) : []);

  const active = $derived(
    !!app.block || !!app.radical || app.strokesMin != null || app.strokesMax != null || app.minCount !== 1 ||
      app.lengths.length !== 3 || app.cls !== 'all' || !!app.fwCat || !!app.pos,
  );
</script>

<section class="card">
  <h2>{t('filters.heading')}</h2>
  <fieldset>
    <legend>{t('filters.class')}</legend>
    <div class="segmented">
      {#each ['all', 'function', 'content'] as const as c (c)}
        <button type="button" aria-pressed={app.cls === c} onclick={() => (app.cls = c)}>{t(`class.${c}`)}</button>
      {/each}
    </div>
  </fieldset>
  {#if app.cls !== 'content'}
    <label class="field">
      {t('filters.fwCategory')}
      <select bind:value={app.fwCat}>
        <option value="">{t('filters.any')}</option>
        {#each FW_CATEGORIES as c (c)}
          <option value={c}>{t(`fw.${c}`)}</option>
        {/each}
      </select>
    </label>
  {/if}
  <label class="field">
    {t('filters.pos')}
    <select bind:value={app.pos}>
      <option value="">{t('filters.any')}</option>
      {#each posTags as tag (tag)}
        <option value={tag}>{t(`upos.${tag}` as MessageKey)}</option>
      {/each}
    </select>
  </label>
  {#if isWords}
    <fieldset>
      <legend>{t('filters.length')}</legend>
      <div class="lengths">
        {#each [2, 3, 4] as n (n)}
          <label><input type="checkbox" checked={app.lengths.includes(n)} onchange={(e) => toggleLength(n, e.currentTarget.checked)} /> {t('filters.lengthN', { count: n })}</label>
        {/each}
      </div>
    </fieldset>
  {:else}
    <label class="field">
      {t('filters.block')}
      <select bind:value={app.block}>
        <option value="">{t('filters.any')}</option>
        {#each manifest.blocks as b (b.name)}
          <option value={b.name} lang="en">{b.name}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      {t('filters.radical')}
      <select bind:value={app.radical}>
        <option value="">{t('filters.any')}</option>
        {#each radicals as r (r.n)}
          <option value={String(r.n)}>{r.n} {r.ch}</option>
        {/each}
      </select>
    </label>
    <fieldset>
      <legend>{t('filters.strokes')}</legend>
      <div class="range">
        <label class="field">
          {t('filters.min')}
          <input type="number" min="1" max="64" inputmode="numeric" value={app.strokesMin ?? ''} oninput={(e) => (app.strokesMin = num(e))} />
        </label>
        <label class="field">
          {t('filters.max')}
          <input type="number" min="1" max="64" inputmode="numeric" value={app.strokesMax ?? ''} oninput={(e) => (app.strokesMax = num(e))} />
        </label>
      </div>
    </fieldset>
  {/if}
  <label class="field">
    {t('filters.minCount')}
    <input type="number" min="0" inputmode="numeric" value={app.minCount} oninput={(e) => (app.minCount = num(e) ?? 0)} />
  </label>
  {#if active}
    <button class="btn" onclick={() => app.resetFilters()}>{t('filters.reset')}</button>
  {/if}
</section>

<style>
  section { display: grid; gap: 0.6rem; }
  h2 { font-size: 0.95rem; font-weight: 650; margin: 0; }
  fieldset { border: 0; padding: 0; margin: 0; }
  legend { font-size: 0.875rem; color: var(--ink-2); padding: 0; margin-block-end: 0.2rem; }
  .range { display: flex; gap: 0.5rem; }
  .segmented { display: flex; inline-size: 100%; }
  .segmented > button { flex: 1 1 auto; padding-inline: 0.4rem; font-size: 0.875rem; }
  .lengths { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; }
  select { inline-size: 100%; }
  .btn { justify-self: start; }
</style>
