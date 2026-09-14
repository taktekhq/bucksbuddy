import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // Accept both VITE_ and the existing NEXT_PUBLIC_ env vars so the Vercel
  // configuration you already set keeps working without renaming anything.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/apple-touch-icon.png",
        "icons/icon-192.png",
        "fonts/grobold.woff2",
        "fonts/grobold.ttf",
      ],
      // Never cache Supabase auth/data — always go to the network.
      workbox: {
        navigateFallbackDenylist: [/^\/sw\.js$/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith("supabase.co"),
            handler: "NetworkOnly",
          },
        ],
      },
      manifest: {
        name: "BucksBuddy",
        short_name: "BucksBuddy",
        description: "What's up, Doc? Your dead-simple money tracker.",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F2F2F7",
        theme_color: "#F2F2F7",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
