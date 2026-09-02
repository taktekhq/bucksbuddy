import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";

import { parseAuthFragment } from "@/lib/authTokens";
import { configurationError, supabase } from "@/lib/supabase";

type SessionState = {
  loading: boolean;
  session: Session | null;
  recoveryMode: boolean;
};

// A password-recovery email link deep-links in as
// "bucksbuddy://reset#access_token=...&refresh_token=...&type=recovery" (see
// authTokens.ts). Exchanging those tokens for a session is what authorizes
// updateUser({ password }) on the Reset screen; recoveryMode locks the app
// there until the user finishes or signs out, mirroring web's useSession.
async function tryConsumeRecoveryLink(
  url: string | null,
  onRecovered: (session: Session) => void,
) {
  if (!url) return;
  const tokens = parseAuthFragment(url);
  if (!tokens || tokens.type !== "recovery") return;

  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (!error && data.session) onRecovered(data.session);
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: configurationError === null,
    session: null,
    recoveryMode: false,
  });

  useEffect(() => {
    if (configurationError) return;

    let active = true;
    const enterRecovery = (session: Session) => {
      if (active) setState({ loading: false, session, recoveryMode: true });
    };

    void Linking.getInitialURL().then((url) => tryConsumeRecoveryLink(url, enterRecovery));
    const linkSub = Linking.addEventListener("url", ({ url }) =>
      void tryConsumeRecoveryLink(url, enterRecovery),
    );

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState((s) => ({ ...s, loading: false, session: data.session }));
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        enterRecovery(session);
      } else if (event === "SIGNED_OUT") {
        setState({ loading: false, session: null, recoveryMode: false });
      } else {
        setState((s) => ({ ...s, loading: false, session }));
      }
    });

    return () => {
      active = false;
      linkSub.remove();
      authSub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
