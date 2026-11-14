<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { app, type View } from '../lib/state.svelte';
  import Han from './Han.svelte';
  import Settings from './Settings.svelte';

  let settingsDialog: Settings;
  let headerHeight = $state(0);
  // Sticky elements below the header (table heads, side panels) offset by it.
  $effect(() => {
    if (headerHeight) document.documentElement.style.setProperty('--header-h', `${headerHeight}px`);
  });

  const sections: { view: View; key: 'nav.chars' | 'nav.words' | 'nav.about' }[] = [
    { view: 'chars', key: 'nav.chars' },
    { view: 'words', key: 'nav.words' },
    { view: 'about', key: 'nav.about' },
  ];

  function go(view: View) {
    if (app.view === view) return;
    app.view = view;
    app.sel = null;
    window.scrollTo({ top: 0 });
  }
</script>

<header bind:clientHeight={headerHeight}>
  <div class="brand">
    <Han text="文" class="logo" />
    <div>
      <div class="title">{t('app.title')}</div>
      <div class="tagline small secondary">{t('app.tagline')}</div>
    </div>
  </div>
  <nav aria-label={t('nav.label')}>
    {#each sections as s (s.view)}
      <a
        href="#/{s.view}"
        aria-current={app.view === s.view ? 'page' : undefined}
        onclick={(e) => {
          e.preventDefault();
          go(s.view);
        }}>{t(s.key)}</a
      >
    {/each}
  </nav>
  <button class="btn btn-ghost settings" onclick={() => settingsDialog.open()} aria-haspopup="dialog">
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      ><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg
    >
    <span>{t('settings.open')}</span>
  </button>
</header>

<Settings bind:this={settingsDialog} />

<style>
  header {
    position: sticky;
    inset-block-start: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 1rem 1.5rem;
    flex-wrap: wrap;
    min-block-size: var(--header-h);
    padding-block: 0.4rem;
    padding-inline: clamp(0.5rem, 2vw, 1.5rem);
    background: color-mix(in srgb, var(--page) 92%, transparent);
    backdrop-filter: blur(8px);
    border-block-end: 1px solid var(--border);
  }
  .brand { display: flex; align-items: center; gap: 0.6rem; margin-inline-end: auto; min-inline-size: 0; }
  .brand :global(.logo) {
    display: grid;
    place-items: center;
    inline-size: 2.1rem;
    block-size: 2.1rem;
    border-radius: 8px;
    background: var(--link);
    color: var(--surface);
    font-size: 1.35rem;
    line-height: 1;
  }
  .title { font-weight: 650; }
  .tagline { max-inline-size: 42rem; }
  nav { display: flex; gap: 0.25rem; }
  nav a {
    padding-block: 0.35rem;
    padding-inline: 0.75rem;
    border-radius: var(--radius);
    color: var(--ink-2);
    text-decoration: none;
  }
  nav a:hover { background: var(--hover); }
  nav a[aria-current='page'] { color: var(--ink); background: var(--selected); font-weight: 600; }
  @media (max-width: 720px) {
    .tagline { display: none; }
    .settings span { display: none; }
  }
</style>
