import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { parseAuthFragment } from "@/lib/authTokens";
import { supabase } from "@/lib/supabase";

// Mirrors web's supabase.auth.signInWithOAuth({ provider: "google" }) (see
// src/screens/Landing.tsx), adapted for a dev client with no browser address
// bar to redirect: Supabase hands back the Google authorize URL instead of
// navigating to it (skipBrowserRedirect), a system browser tab opens it
// (openAuthSessionAsync), and the final bucksbuddy://auth-callback redirect
// carries the session tokens in its fragment, exactly like the web hash flow.
//
// Requires "bucksbuddy://auth-callback" to be added to the Supabase project's
// Auth > URL Configuration > Redirect URLs allowlist.
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = Linking.createURL("auth-callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { error: error?.message ?? "Could not start Google sign-in." };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") {
    // "cancel"/"dismiss": the user closed the browser tab themselves — not
    // an error worth surfacing.
    return { error: null };
  }

  const tokens = parseAuthFragment(result.url);
  if (!tokens) return { error: "Google sign-in did not return a session." };

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  return { error: sessionError?.message ?? null };
}
