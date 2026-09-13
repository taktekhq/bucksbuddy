// A dev-only Vite app that renders the Recap card, story and screen from
// fictional rows, so the design can be looked at (and exported through the
// real PNG path) without an account or a backend. Not part of the build or
// the test run. Start it with `npm run recap:preview`.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: HERE,
  publicDir: `${REPO}public`,
  resolve: {
    alias: [
      // The screen reads the store, analytics and Supabase client through
      // these paths; the stand-ins keep everything on this machine.
      { find: "@/lib/store", replacement: `${HERE}fakeStore.tsx` },
      { find: "@/lib/posthog", replacement: `${HERE}fakePosthog.ts` },
      { find: "@/lib/supabase", replacement: `${HERE}fakeSupabase.ts` },
      { find: "@", replacement: `${REPO}src` },
    ],
  },
  // The repo's Tailwind/PostCSS setup, so the screen's classes resolve.
  css: { postcss: REPO },
  server: { port: 5199, fs: { allow: [REPO] } },
  plugins: [react()],
});
