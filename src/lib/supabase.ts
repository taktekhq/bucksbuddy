import { createClient } from "@supabase/supabase-js";

// Accepts either VITE_ or NEXT_PUBLIC_ env var names (see vite.config.ts).
const env = import.meta.env as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
    // OAuth (Google/Apple) redirects back with a PKCE `?code=` in the query
    // string; detectSessionInUrl exchanges it for a session on load. PKCE keeps
    // the code in the query string (not the hash), so it never collides with
    // our hash-based router (see src/lib/router.ts).
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
