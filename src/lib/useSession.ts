import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// Reads the cached session instantly, then listens for auth changes.
//
// `recoveryMode` flips on when Supabase fires PASSWORD_RECOVERY — i.e. the SDK
// just exchanged a recovery token from a reset-password email link for a
// session. App uses it to render the Reset screen and lock the user there
// until they finish (or sign out). Without that event, a normal signed-in
// user never sees Reset, so they can't force-rotate their password from a
// regular session — it's gated on actually holding the token.
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      else if (event === "SIGNED_OUT") setRecoveryMode(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, ready, recoveryMode };
}
