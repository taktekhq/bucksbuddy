// The crypto primitives behind BucksBuddy's end-to-end encryption, in pure
// JavaScript — the native counterpart of the web's ../src/lib/crypto.ts.
//
// The web uses WebCrypto, which React Native doesn't have. @noble/ciphers and
// @noble/hashes are audited pure-JS implementations of the same primitives, so
// the bytes come out identical: the envelopes below are byte-compatible with
// what the browser wrote, which matters because the rows in Supabase were
// encrypted there.
//
// Design (unchanged from the web):
//   * Each user has one random 256-bit AES-GCM "master key" that actually
//     encrypts their data. We never re-encrypt the data when the secret
//     changes — we only re-wrap the master key, which is cheap.
//   * The master key is stored *wrapped* (encrypted) by a key derived from a
//     passphrase. "Wrapping" never touches the data, only the key.
//   * Users who haven't turned on a personal passphrase get their master key
//     wrapped with the public DEFAULT_PASSPHRASE below, so EVERY row is stored
//     as ciphertext and the read/write paths have no plaintext branch. That
//     constant is NOT a secret — it ships in the client bundle — so default-
//     tier data stays readable by the operator, exactly as it was before
//     encryption existed. Turning on a real passphrase is what locks the
//     operator out.
//
// Envelope formats (dot-separated base64, all version-tagged so the KDF/cipher
// can be upgraded later without a data migration):
//   value blob : "<iv>.<ct>"
//   wrapped key: "v1.<salt>.<iv>.<ct>"
//
// Cost note: deriving a wrapping key is 600k PBKDF2 rounds. lib/pbkdf2 runs
// those natively where it can, which keeps an unlock under a second; the
// pure-JS fallback is tens of seconds. Either way lib/vault caches the
// *unwrapped* master key in the device keystore, so derivation happens when a
// device first unlocks rather than on every launch.
import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
// Relative, not "@/lib/pbkdf2": scripts/crypto-interop.test.mts loads this file
// straight from node, which has no path aliases.
import { deriveBits } from "./pbkdf2.ts";

const VERSION = "v1";
// PBKDF2 work factor. Matches the web exactly — change one and old wrapped
// keys stop opening. (OWASP's 2023 floor for PBKDF2-SHA-256.)
const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_PLAINTEXT = "bucksbuddy-e2e-ok";

/** The public, non-secret wrapper for users who have not set a passphrase. */
export const DEFAULT_PASSPHRASE = "bubbles";

/** Raw 256-bit key material. The web passes a WebCrypto `CryptoKey` around;
 *  here the bytes themselves are the handle. */
export type MasterKeyBytes = Uint8Array;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// btoa/atob aren't guaranteed in Hermes, so base64 is done by hand. Same
// output as the browser's, which is what keeps the envelopes compatible.
function toB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

function fromB64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array((clean.length * 3) >> 2);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((clean[i + 2] ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (clean[i + 3] ? B64.indexOf(clean[i + 3]) : 0);
    out[p++] = (n >> 16) & 255;
    if (clean[i + 2]) out[p++] = (n >> 8) & 255;
    if (clean[i + 3]) out[p++] = n & 255;
  }
  return out.subarray(0, p);
}

const decoder = new TextDecoder();

export function generateMasterKey(): MasterKeyBytes {
  return randomBytes(32);
}

function encryptBytes(key: MasterKeyBytes, bytes: Uint8Array): string {
  const iv = randomBytes(12);
  // noble's GCM appends the 16-byte tag to the ciphertext, which is exactly
  // what WebCrypto's encrypt() returns — so the blobs interoperate.
  const ct = gcm(key, iv).encrypt(bytes);
  return `${toB64(iv)}.${toB64(ct)}`;
}

function decryptBytes(key: MasterKeyBytes, blob: string): Uint8Array {
  const [ivB64, ctB64] = blob.split(".");
  return gcm(key, fromB64(ivB64)).decrypt(fromB64(ctB64));
}

export function encryptString(key: MasterKeyBytes, text: string): string {
  return encryptBytes(key, utf8ToBytes(text));
}

export function decryptString(key: MasterKeyBytes, blob: string): string {
  return decoder.decode(decryptBytes(key, blob));
}

/** Derive an AES wrapping key from a passphrase + salt via PBKDF2. The slow
 *  part — see the cost note at the top of the file, and lib/pbkdf2 for where
 *  the work actually happens. */
function deriveWrapKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  return deriveBits(passphrase, salt, PBKDF2_ITERATIONS, 32);
}

/** Encrypt the master key under a passphrase. Returns "v1.<salt>.<iv>.<ct>". */
export async function wrapMasterKey(
  masterKey: MasterKeyBytes,
  passphrase: string,
): Promise<string> {
  const salt = randomBytes(16);
  const wrapKey = await deriveWrapKey(passphrase, salt);
  return `${VERSION}.${toB64(salt)}.${encryptBytes(wrapKey, masterKey)}`;
}

/** Recover the master key from its wrapped form. Throws if the passphrase is
 *  wrong (AES-GCM authentication fails) or the version is unknown. */
export async function unwrapMasterKey(
  wrapped: string,
  passphrase: string,
): Promise<MasterKeyBytes> {
  const [version, saltB64, ivB64, ctB64] = wrapped.split(".");
  if (version !== VERSION) throw new Error("Unsupported key version");
  const wrapKey = await deriveWrapKey(passphrase, fromB64(saltB64));
  return decryptBytes(wrapKey, `${ivB64}.${ctB64}`);
}

/** A small known-plaintext token, encrypted under the master key, used to tell
 *  a correct passphrase (which yields a working key) from a wrong one — and to
 *  check that a key cached on this device still opens the account's data. */
export function makeVerifier(masterKey: MasterKeyBytes): string {
  return encryptString(masterKey, VERIFIER_PLAINTEXT);
}

export function checkVerifier(masterKey: MasterKeyBytes, verifier: string): boolean {
  try {
    return decryptString(masterKey, verifier) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

/** Base64 of raw key bytes, for handing the key to the device keystore. */
export const keyToB64 = toB64;
export const keyFromB64 = fromB64;
