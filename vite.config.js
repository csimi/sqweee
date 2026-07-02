import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Base path. On GitHub Pages this deploys to a PROJECT page (…github.io/sqweee/),
// so the built assets must be served from '/sqweee/'. Everywhere else — local dev,
// preview, LAN, installed PWA — we serve from the host root '/'. We key off the
// GITHUB_ACTIONS env (set only in CI) so local `build`+`preview` still work at '/'.
// A relative base is avoided: it makes the injected manifest link resolve to a
// subpath where the SPA fallback returns index.html → "Manifest: Syntax error".
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/sqweee/' : '/',
  server: { host: '0.0.0.0' },   // expose on the LAN so you can open it on your phone
  preview: { host: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        // Stable install identity. Without an explicit id the browser keys the
        // install off start_url, so a base/URL change spawns a DUPLICATE icon
        // instead of updating. Keep this constant forever.
        id: '/sqweee/',
        name: 'sqweee',
        short_name: 'sqweee',
        description: 'Endless roll & absorb blob game.',
        theme_color: '#0d1b2a',
        background_color: '#0d1b2a',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',      // follow the device — the HUD adapts to landscape (don't lock to portrait)
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Never let the SPA navigate-fallback answer a manifest request with
        // index.html (which would make the manifest fail to parse).
        navigateFallbackDenylist: [/\.webmanifest$/],
      },
    }),
  ],
});
