import { createClient } from "@supabase/supabase-js";

// Accepts either VITE_ or NEXT_PUBLIC_ env var names (see vite.config.ts).
const env = import.meta.env as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const OWNER_EMAIL =
  env.VITE_OWNER_EMAIL ?? env.NEXT_PUBLIC_OWNER_EMAIL ?? "";

if (!url || !anonKey) {
  // Surfaced clearly in the console if env vars are missing.
  console.error(
    "Missing Supabase env vars: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or the NEXT_PUBLIC_ equivalents).",
  );
}

// One client for the whole app. Session is cached in localStorage and refreshed
// automatically, so auth checks are instant and local — no per-navigation
// network round-trips.
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
