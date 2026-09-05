import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import posthog from "@/lib/posthog";

// Pull implicit-flow recovery tokens out of a deep link. Supabase dashboard
// "send password reset" emails always use this format (access_token +
// refresh_token + type=recovery), and the PKCE-configured SDK doesn't
// auto-handle them. Returns null when this isn't a recovery callback.
function parseRecoveryTokens(
  url: string | null,
): { access_token: string; refresh_token: string } | null {
  if (!url) return null;
  const hash = url.slice(url.indexOf("#"));
  if (!hash.includes("type=recovery") || !hash.includes("access_token=")) {
    return null;
  }
  const params = new URLSearchParams(hash.slice(hash.indexOf("access_token=")));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// Reads the cached session instantly, then listens for auth changes.
//
// `recoveryMode` flips on when Supabase fires PASSWORD_RECOVERY OR when we
// manually exchange the recovery tokens from a deep link. App uses it to render
// the Reset screen and lock the user there until they finish (or sign out).
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function handleRecovery(url: string | null): Promise<boolean> {
      const recovery = parseRecoveryTokens(url);
      if (!recovery) return false;
      // Hand the tokens to the SDK so updateUser({ password }) is authorized
      // by this short-lived recovery session.
      const { data, error } = await supabase.auth.setSession(recovery);
      if (cancelled) return true;
      if (!error) {
        setSession(data.session);
        setRecoveryMode(true);
      }
      return true;
    }

    void (async () => {
      const initial = await Linking.getInitialURL();
      if (cancelled) return;
      if (!(await handleRecovery(initial))) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        if (data.session) {
          posthog.identify(data.session.user.id, { email: data.session.user.email });
        }
      }
      setReady(true);
    })();

    // A recovery link opened while the app is already running.
    const linkSub = Linking.addEventListener("url", ({ url }) => {
      void handleRecovery(url);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      else if (event === "SIGNED_OUT") {
        setRecoveryMode(false);
        posthog.reset();
      } else if (event === "SIGNED_IN" && s) {
        posthog.identify(s.user.id, { email: s.user.email });
        posthog.capture("signed_in");
      }
    });

    return () => {
      cancelled = true;
      linkSub.remove();
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, ready, recoveryMode };
}
