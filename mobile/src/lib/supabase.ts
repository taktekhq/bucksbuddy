import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Expo inlines EXPO_PUBLIC_* at bundle time (the RN twin of Vite's VITE_*).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced clearly in the console if env vars are missing.
  console.error(
    "Missing Supabase env vars: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.",
  );
}

// One client for the whole app. The session is cached in AsyncStorage (the
// native stand-in for localStorage) and refreshed automatically, so auth checks
// are instant and local — no per-navigation network round-trips.
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // There's no page URL to read a PKCE code out of on native; the OAuth
    // flow (lib/oauth.ts) exchanges the code explicitly instead.
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});
