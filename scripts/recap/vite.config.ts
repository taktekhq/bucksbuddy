import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [react()],
  // Prevent application env files from entering this fictional fixture.
  envDir: resolve("scripts/recap"),
  resolve: {
    alias: [
      { find: "@/lib/store", replacement: resolve("scripts/recap/store.ts") },
      {
        find: "@/lib/supabase",
        replacement: resolve("scripts/recap/supabase.ts"),
      },
      { find: "@", replacement: resolve("src") },
    ],
  },
  optimizeDeps: { entries: ["scripts/recap/index.html"] },
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: { ignored: ["**/coverage/**"] },
  },
});
