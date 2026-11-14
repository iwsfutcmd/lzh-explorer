<script lang="ts">
  import { i18n, LOCALES, NUMERALS, t, type MessageKey } from '../lib/i18n/index.svelte';
  import { COLLATIONS, HAN_LANGS, READINGS, settings } from '../lib/settings.svelte';

  let dialog: HTMLDialogElement;

  export function open() {
    dialog.showModal();
  }

  const real = LOCALES.filter((l) => !l.pseudo);
  const pseudo = LOCALES.filter((l) => l.pseudo);
  const PSEUDO_LABEL: Record<string, string> = { 'en-XA': 'Pseudo-accented (en-XA)', 'ar-XB': 'Pseudo-bidi, RTL (ar-XB)' };

  /** A locale's own name for itself, e.g. 日本語, 繁體中文. */
  function autonym(tag: string) {
    return i18n.languageName(tag, tag);
  }

  function numeralSample(n: string) {
    const loc = n === 'auto' ? i18n.locale : `${i18n.locale}-u-nu-${n}`;
    return new Intl.NumberFormat(loc, { useGrouping: false }).format(2025);
  }

  const localeValue = $derived(settings.locale ?? '');
</script>

<dialog bind:this={dialog} aria-labelledby="settings-title" onclick={(e) => e.target === dialog && dialog.close()}>
  <form method="dialog">
    <header>
      <h2 id="settings-title">{t('settings.title')}</h2>
      <button class="btn btn-ghost" value="close" aria-label={t('settings.close')}>✕</button>
    </header>

    <label class="field">
      {t('settings.language')}
      <select value={localeValue} onchange={(e) => settings.setLocale(e.currentTarget.value || null)}>
        <option value="">{t('settings.auto')}</option>
        {#each real as l (l.tag)}
          <option value={l.tag} lang={l.tag}>{autonym(l.tag)}</option>
        {/each}
        <optgroup label={t('settings.testing')}>
          {#each pseudo as l (l.tag)}
            <option value={l.tag} lang="en">{PSEUDO_LABEL[l.tag]}</option>
          {/each}
        </optgroup>
      </select>
    </label>

    <label class="field">
      {t('settings.glyphs')}
      <select bind:value={settings.hanLang}>
        <option value="auto">{t('settings.auto')} — {i18n.languageName(settings.resolvedHanLang)}</option>
        {#each HAN_LANGS as tag (tag)}
          <option value={tag}>{i18n.languageName(tag)}</option>
        {/each}
      </select>
      <span class="small muted">{t('settings.glyphs.help')}</span>
    </label>

    <fieldset>
      <legend>{t('settings.typeface')}</legend>
      <div class="segmented">
        {#each ['serif', 'sans'] as const as face (face)}
          <button type="button" aria-pressed={settings.typeface === face} onclick={() => (settings.typeface = face)}>
            {t(`typeface.${face}`)}
          </button>
        {/each}
      </div>
    </fieldset>

    <label class="field">
      {t('settings.numerals')}
      <select bind:value={i18n.numerals}>
        {#each NUMERALS as n (n)}
          <option value={n}>{t(`numerals.${n}` as MessageKey)} ({numeralSample(n)})</option>
        {/each}
      </select>
    </label>

    <label class="field">
      {t('settings.collation')}
      <select bind:value={settings.collation}>
        {#each COLLATIONS as c (c)}
          <option value={c}>{t(`collation.${c}` as MessageKey)}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      {t('settings.reading')}
      <select bind:value={settings.reading}>
        <option value="auto">{t('settings.auto')} — {t(`reading.${settings.resolvedReading}` as MessageKey)}</option>
        {#each READINGS as r (r)}
          <option value={r}>{t(`reading.${r}` as MessageKey)}</option>
        {/each}
      </select>
    </label>

    <fieldset>
      <legend>{t('settings.writingMode')}</legend>
      <div class="segmented">
        {#each ['horizontal', 'vertical'] as const as mode (mode)}
          <button type="button" aria-pressed={settings.writingMode === mode} onclick={() => (settings.writingMode = mode)}>
            {t(`writingMode.${mode}`)}
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset>
      <legend>{t('settings.theme')}</legend>
      <div class="segmented">
        {#each ['system', 'light', 'dark'] as const as theme (theme)}
          <button type="button" aria-pressed={settings.theme === theme} onclick={() => (settings.theme = theme)}>
            {t(`theme.${theme}`)}
          </button>
        {/each}
      </div>
    </fieldset>
  </form>
</dialog>

<style>
  dialog {
    inline-size: min(32rem, calc(100vw - 2rem));
    max-block-size: calc(100dvh - 2rem);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  }
  dialog::backdrop { background: rgba(0, 0, 0, 0.35); }
  form { display: grid; gap: 1rem; padding: 1.25rem; }
  header { display: flex; align-items: center; justify-content: space-between; }
  header h2 { margin: 0; }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 0.3rem; }
  legend { font-size: 0.875rem; color: var(--ink-2); padding: 0; margin-block-end: 0.3rem; }
  .segmented { flex-wrap: wrap; }
</style>
