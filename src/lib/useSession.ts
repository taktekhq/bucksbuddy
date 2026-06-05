import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Pull implicit-flow recovery tokens out of the URL hash. Supabase dashboard
// "send password reset" emails always use this format (access_token +
// refresh_token + type=recovery), and the PKCE-configured SDK doesn't
// auto-handle them. Returns null when this isn't a recovery callback. Robust
// to a glued-on app route, e.g. "#/reset#access_token=…".
function parseRecoveryTokens(): { access_token: string; refresh_token: string } | null {
  const hash = window.location.hash;
  if (!hash.includes("type=recovery") || !hash.includes("access_token=")) {
    return null;
  }
  // Slice from "access_token=" forward — that's the start of the URL-encoded
  // param string, regardless of any "/route#" prefix.
  const params = new URLSearchParams(hash.slice(hash.indexOf("access_token=")));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

// Reads the cached session instantly, then listens for auth changes.
//
// `recoveryMode` flips on when Supabase fires PASSWORD_RECOVERY OR when we
// manually exchange the recovery tokens from the hash. App uses it to render
// the Reset screen and lock the user there until they finish (or sign out).
// Without that signal, a normal signed-in user never sees Reset, so they
// can't force-rotate their password from a regular session.
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    const recovery = parseRecoveryTokens();
    if (recovery) {
      // Hand the tokens to the SDK so updateUser({ password }) is authorized
      // by this short-lived recovery session.
      supabase.auth.setSession(recovery).then(({ data, error }) => {
        // Wipe tokens from the URL no matter what — recovery tokens are
        // sensitive and shouldn't linger in browser history. Land on a clean
        // /reset URL so a refresh during the flow doesn't replay them.
        window.history.replaceState(null, "", window.location.pathname + "#/reset");
        if (!error) {
          setSession(data.session);
          setRecoveryMode(true);
        }
        setReady(true);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setReady(true);
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // PASSWORD_RECOVERY is the SDK's own signal — fires when it auto-detects
      // a recovery callback (e.g. PKCE-style ?code= reset links). Cover that
      // case too, so this works whether the email uses implicit or PKCE.
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      else if (event === "SIGNED_OUT") setRecoveryMode(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, ready, recoveryMode };
}
