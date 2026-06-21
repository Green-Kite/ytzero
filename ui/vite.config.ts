import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "YT Zero",
        short_name: "YT Zero",
        description: "Self-hosted YouTube subscriptions reader",
        theme_color: "#0f0f0f",
        background_color: "#0f0f0f",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // Explicitly disable the plugin's default navigateFallback ("index.html").
        // Serving the *precached* index.html
        // for navigations strands iOS clients after a redeploy — the cached
        // shell points at hashed bundles the server has since deleted, so the
        // app never boots ("no content"). This is a self-hosted, online-first
        // reader, so let navigations hit the network (the server's catch-all
        // always returns a fresh index.html with valid asset refs). Even a
        // stale, stuck service worker then can't trap the user on a dead shell.
        navigateFallback: null as unknown as string,
        runtimeCaching: [
          {
            // Images go through /api/img?u=… — cache those aggressively.
            // (The previous /imgcache/ pattern never matched anything.)
            urlPattern: ({ url }) => url.pathname.startsWith("/api/img"),
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
