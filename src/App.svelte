<script lang="ts">
  import { i18n, t } from './lib/i18n/index.svelte';
  import { settings } from './lib/settings.svelte';
  import { app, model } from './lib/state.svelte';
  import Header from './components/Header.svelte';
  import Browser from './components/Browser.svelte';
  import About from './components/About.svelte';

  // Read the URL before any effect can write it back.
  app.fromHash(location.hash);

  let ready = $state(false);
  settings.init().then(() => {
    ready = true;
    model.init();
  });

  $effect(() => {
    const html = document.documentElement;
    html.lang = i18n.locale;
    html.dir = i18n.dir;
    if (settings.theme === 'system') delete html.dataset.theme;
    else html.dataset.theme = settings.theme;
    html.dataset.typeface = settings.typeface;
    document.title = t('app.title');
  });

  // Persist preferences whenever one changes.
  $effect(() => {
    void [settings.locale, i18n.numerals, settings.hanLang, settings.typeface, settings.theme,
      settings.collation, settings.writingMode, settings.reading];
    if (ready) settings.save();
  });

  // Mirror view state in the URL. Changing section or selection adds a history
  // entry (so Back works); everything else replaces the current one.
  let last = { view: app.view, sel: app.sel };
  $effect(() => {
    const hash = app.toHash();
    if (hash === location.hash) return;
    const push = app.view !== last.view || app.sel !== last.sel;
    last = { view: app.view, sel: app.sel };
    if (push) history.pushState(null, '', hash);
    else history.replaceState(null, '', hash);
  });

  function onPopState() {
    app.fromHash(location.hash);
    last = { view: app.view, sel: app.sel };
  }

  $effect(() => {
    if (app.view === 'words' && model.manifest) model.loadWords();
  });
</script>

<svelte:window onpopstate={onPopState} onhashchange={onPopState} />

{#if ready}
  <a class="skip" href="#results">{t('app.skip')}</a>
  <Header />
  <main id="main">
    {#if model.error}
      <p class="error card" role="alert">{t('error.load', { message: model.error })}</p>
    {:else if !model.manifest || !model.chars || !model.unihan}
      <p class="loading" role="status">{t('loading')}</p>
    {:else if app.view === 'about'}
      <About />
    {:else}
      <Browser />
    {/if}
  </main>
{/if}

<style>
  main {
    padding-inline: clamp(0.5rem, 2vw, 1.5rem);
    padding-block: 1rem 3rem;
  }
  .loading, .error {
    margin: 4rem auto;
    max-inline-size: 40rem;
    text-align: center;
  }
  .skip {
    position: absolute;
    inset-inline-start: 0.5rem;
    inset-block-start: -3rem;
    z-index: 100;
    background: var(--surface);
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
  }
  .skip:focus { inset-block-start: 0.5rem; }
</style>
