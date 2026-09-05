import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

// Google sign-in on native. The web app just redirects the page to Google and
// lets Supabase read the PKCE `?code=` back out of the URL. Here there's no
// page: we ask Supabase for the Google URL without redirecting, open it in an
// auth session (SFSafariViewController / Chrome Custom Tab), wait for the
// redirect back to our own deep link, and hand the code to the SDK ourselves.
//
// The redirect URL must be allow-listed in Supabase → Auth → URL
// Configuration. In Expo Go it's an `exp://…` URL that changes with the dev
// server, so the wildcard `exp://**` covers it; the native build uses the
// `bucksbuddy://` scheme from app.json.
WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const redirectTo = Linking.createURL("/");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { error: error?.message ?? "Couldn't start sign-in." };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") {
    // Dismissed / cancelled: not an error worth showing.
    return { error: null };
  }

  const params = Linking.parse(result.url).queryParams ?? {};
  const code = typeof params.code === "string" ? params.code : null;
  if (!code) {
    const desc = params.error_description;
    return { error: typeof desc === "string" ? desc : "Sign-in was interrupted." };
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  return { error: exchangeError?.message ?? null };
}
