// A cryptographically secure random source, installed on `globalThis.crypto`.
//
// WHY THIS FILE EXISTS
//
// Hermes ships no `crypto` global, and neither React Native 0.86 nor the Expo
// runtime installs one — grep either package for `getRandomValues` and you get
// nothing back. Node has it built in, and jest runs on node, so the whole test
// suite passed at 100% coverage while every write on the device threw.
//
// @noble/hashes reads `globalThis.crypto.getRandomValues` at call time and
// throws "crypto.getRandomValues must be defined" when it is absent. lib/crypto
// reaches for it in three places, and all three are writes:
//
//   * `encryptBytes` — the random IV behind every encrypted value
//   * `wrapMasterKey` — the random salt for a wrapping key
//   * `generateMasterKey` — a new user's master key
//
// Decryption needs no randomness, so reading and unlocking kept working and the
// app looked healthy right up until you tried to save something: adding a
// transaction, adding gold to the Safe, and turning a passphrase on, off or
// changing it all threw.
//
// The polyfill is global rather than a private helper inside lib/crypto on
// purpose. @supabase/auth-js has its own fallback for a missing CSPRNG — it
// builds the PKCE verifier out of `Math.random` (see
// node_modules/@supabase/auth-js/dist/module/lib/helpers.js). That is why
// signing in worked at all, and it means sign-in has been generating guessable
// verifiers. Installing a real source fixes that too.

type Fill = <T extends ArrayBufferView>(array: T) => T;
type RandomSource = { getRandomValues?: unknown };
type Scope = { crypto?: RandomSource };

/**
 * expo-crypto, if this runtime actually has it.
 *
 * Loaded with a lazy `require` rather than a static import, for the same reason
 * lib/pbkdf2 does it: this file runs before anything else in the app, and a
 * static import of a native module that isn't in the binary would throw during
 * module evaluation and stop the app from starting at all. That is not
 * hypothetical — pushing this file to an existing build as an over-the-air
 * update does exactly that, because expo-crypto was not compiled into it.
 * A missing source has to degrade to the old failure, not a worse one.
 */
function loadNativeRandom(): Fill | null {
  try {
    const { getRandomValues } = require("expo-crypto") as typeof import("expo-crypto");
    return getRandomValues as Fill;
  } catch {
    return null;
  }
}

/**
 * Prove the source is really random before trusting it with a master key.
 *
 * A binding that returns zeros would be worse than no binding at all: every key,
 * IV and salt would be predictable, every test would pass, and nothing would
 * look wrong until someone else could read the data. Two draws that come back
 * equal, or all-zero, mean something is broken.
 */
function producesEntropy(fill: Fill): boolean {
  try {
    const a = fill(new Uint8Array(16));
    const b = fill(new Uint8Array(16));
    if (a.every((byte) => byte === 0)) return false;
    return a.some((byte, i) => byte !== b[i]);
  } catch {
    return false;
  }
}

/**
 * Give `scope` a working `crypto.getRandomValues` if it hasn't got one.
 * Returns whether anything was installed, so a caller can tell a runtime that
 * needed the polyfill from one that already had it.
 *
 * Installs nothing at all if no trustworthy source can be found. That leaves
 * encryption throwing a loud, reported "crypto.getRandomValues must be defined"
 * rather than quietly encrypting everything with predictable bytes.
 */
export function installCsprng(scope: Scope = globalThis as Scope): boolean {
  const existing = scope.crypto;
  if (typeof existing?.getRandomValues === "function") return false;

  const fill = loadNativeRandom();
  if (!fill || !producesEntropy(fill)) return false;

  // `defineProperty`, not assignment: a host may expose `crypto` as a getter
  // with no setter, and assigning to that silently does nothing in a release
  // build — which is the same shape of bug this file exists to fix.
  const target: object = existing ?? scope;
  const key = existing ? "getRandomValues" : "crypto";
  Object.defineProperty(target, key, {
    value: existing ? fill : { getRandomValues: fill },
    configurable: true,
    writable: true,
  });
  return true;
}

// Installed as a module side effect, not left to the entry point to call. ES
// module bodies run before any top-level statement, so `import "./lib/random"`
// ahead of the app is the only ordering that is guaranteed to beat a module
// that grabs `crypto` while it is being evaluated.
//
// lib/crypto imports this file too, so the encryption layer cannot end up
// without a random source even if the entry point is tidied up one day. The
// call is idempotent and costs one property lookup once it has run.
installCsprng();
