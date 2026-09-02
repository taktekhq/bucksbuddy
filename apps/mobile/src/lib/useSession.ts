import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { configurationError, supabase } from "@/lib/supabase";

type SessionState = {
  loading: boolean;
  session: Session | null;
};

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: configurationError === null,
    session: null,
  });

  useEffect(() => {
    if (configurationError) return;

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ loading: false, session: data.session });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ loading: false, session });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
