// Temporary web compatibility wrapper while the rest of src/lib moves into
// the shared package. Same pattern as crypto.ts, except store.tsx (unlike
// the pure modules) needs real injected dependencies — the supabase client
// and a StoragePort — rather than just a re-export, so this wires those up
// once here instead of every call site doing it.
import { useMemo, type ReactNode } from "react";

import {
  StoreProvider as CoreStoreProvider,
  useStore,
} from "@bucksbuddy/core/store";
import { CACHE_KEY, parseCacheSnapshot } from "@bucksbuddy/core/cache";
import type { StoragePort } from "@bucksbuddy/core/storagePort";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";

export { useStore };

// localStorage is synchronous, so this wrapper wraps it in resolved promises
// rather than adopting an async StoragePort throughout — no behavior change,
// same interface the shared core expects.
const webStorage: StoragePort = {
  async get(key) {
    return localStorage.getItem(key);
  },
  async set(key, value) {
    localStorage.setItem(key, value);
  },
  async remove(key) {
    localStorage.removeItem(key);
  },
};

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  // Read synchronously here (not through the async StoragePort above) so the
  // very first frame can show real numbers instead of a loading flash — see
  // packages/core/src/store.tsx's initialCache doc comment.
  const initialCache = useMemo(
    () => parseCacheSnapshot(localStorage.getItem(CACHE_KEY(userId))),
    [userId],
  );

  return (
    <CoreStoreProvider
      userId={userId}
      supabase={supabase}
      storage={webStorage}
      initialCache={initialCache}
      // The auth listener in App flips back to the login screen once the
      // session ends; this just resets the hash so the URL doesn't stay
      // stuck on the page they signed out from.
      onSignedOut={() => navigate("/")}
    >
      {children}
    </CoreStoreProvider>
  );
}
