// Native counterpart to src/lib/store.tsx — same shared core
// (@bucksbuddy/core/store), different injected supabase client and
// StoragePort.
import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { StoreProvider as CoreStoreProvider, useStore } from "@bucksbuddy/core/store";
import type { StoragePort } from "@bucksbuddy/core/storagePort";
import { supabase } from "@/lib/supabase";

export { useStore };

const nativeStorage: StoragePort = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  // Unlike web's shim, there's no synchronous read available here —
  // AsyncStorage is genuinely async — so this always starts loading rather
  // than pre-painting from a cached snapshot. See
  // packages/core/src/store.tsx's initialCache doc comment.
  return (
    <CoreStoreProvider userId={userId} supabase={supabase} storage={nativeStorage} initialCache={null}>
      {children}
    </CoreStoreProvider>
  );
}
