import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Mon Budget Famille',
        short_name: 'Budget Famille',
        description:
          'Budget familial et gestion d’activité hors ligne, multidevise, en français, anglais et arabe.',
        theme_color: '#14532d',
        background_color: '#f6fdf9',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        lang: 'fr',
        dir: 'ltr',
        categories: ['finance', 'business', 'productivity'],
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Les données vivent dans IndexedDB (Dexie) : le SW ne fait que le cache applicatif.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'open.er-api.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fx-rates',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => /\/api\/v1\/(rates|exchange)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-rates',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
