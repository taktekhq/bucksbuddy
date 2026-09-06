import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
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

// Sign in with Apple. Apple's guideline 4.8 requires it wherever another
// third-party sign-in is offered, and this app offers Google.
//
// Unlike Google, this never opens a browser: iOS presents the sheet natively
// and hands back an identity token, which Supabase exchanges for a session
// directly. Nothing round-trips through a redirect URL, so no extra
// allow-listing is needed for it.
//
// Two caveats worth knowing:
//   • iOS only. `isAvailableAsync()` is false on Android and on older iOS, so
//     the button is hidden rather than shown broken.
//   • It needs the Apple entitlement, which Expo Go does not carry. The button
//     appears there but sign-in fails until a dev build.
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<{ error: string | null }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) {
      return { error: "Apple didn't return a sign-in token." };
    }
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    return { error: error?.message ?? null };
  } catch (e) {
    // Cancelling the sheet is not an error worth showing, same as dismissing
    // the Google browser.
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") {
      return { error: null };
    }
    return { error: "Couldn't sign in with Apple." };
  }
}
