// The storage seam store.tsx/cache.ts/e2e.ts talk through instead of a
// hardcoded localStorage call (see docs/EXPO_MIGRATION.md's CryptoPort for
// the same idea applied to crypto). Async because it has to be honest about
// both backends: web's localStorage is synchronous, but native's AsyncStorage
// genuinely isn't — a sync interface would either lie about native or force
// a synchronous-only subset that can't be implemented there at all. Every
// call site already awaits these; on web that resolves in the same
// microtask, so the cost is real but negligible.
export type StoragePort = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};
