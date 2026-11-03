import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Served from https://chrisbuilds.github.io/ai-timeline/
export default defineConfig({
  base: '/ai-timeline/',
  plugins: [svelte()],
})
