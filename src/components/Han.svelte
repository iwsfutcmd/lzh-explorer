<script lang="ts">
  // Han-script content: tagged with the selected glyph locale so the browser
  // picks regional glyph forms and an appropriate font.
  import type { Snippet } from 'svelte';
  import { settings } from '../lib/settings.svelte';

  let {
    text = '',
    vertical = false,
    class: className = '',
    children,
  }: { text?: string; vertical?: boolean; class?: string; children?: Snippet } = $props();
</script>

<span class="han {className}" class:vertical lang={settings.resolvedHanLang}
  >{#if children}{@render children()}{:else}{text}{/if}</span
>
