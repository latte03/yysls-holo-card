import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cards } from './cards.manifest.js';

const here = import.meta.dirname;

/**
 * Multi-page build: the landing page plus one entry per card. Each card lives at
 * site/<id>/ so its route is /<id>/ — the same paths the published site uses.
 * `cards.manifest.js` is the only place a card is declared, so a new card needs
 * no edit here beyond the manifest entry itself.
 */
export default defineConfig({
  base: '/',
  appType: 'mpa',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        ...Object.fromEntries(
          cards.map((card) => [card.id, resolve(here, card.id, 'index.html')]),
        ),
      },
    },
  },
  server: {
    port: 4173,
    host: '127.0.0.1',
  },
});
