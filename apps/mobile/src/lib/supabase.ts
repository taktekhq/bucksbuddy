import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const configurationError =
  !supabaseUrl || !supabaseKey
    ? "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/mobile/.env."
    : null;

// The placeholder endpoint keeps module initialization deterministic while the
// setup screen explains what is missing. No request is made until configured.
export const supabase = createClient(
  supabaseUrl ?? "https://invalid.local",
  supabaseKey ?? "missing-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
