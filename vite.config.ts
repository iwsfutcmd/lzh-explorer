import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative base so the build works both at https://<user>.github.io/<repo>/
// and from any other static host or sub-path without reconfiguration.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
});
