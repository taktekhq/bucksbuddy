// WebCrypto primitives for BucksBuddy's optional end-to-end encryption.
//
// Design (see the long discussion that produced it):
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

const VERSION = "v1";
// PBKDF2 work factor. WebCrypto has no Argon2; PBKDF2-SHA-256 at this count is
// a pragmatic, dependency-free choice (OWASP's 2023 floor). The wrapped-key
// envelope is version-tagged so this can move to Argon2id later.
const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_PLAINTEXT = "bucksbuddy-e2e-ok";

// The public, non-secret wrapper for users who have not set a passphrase.
export const DEFAULT_PASSPHRASE = "bubbles";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// TS 5.7's DOM types require ArrayBuffer-backed views for WebCrypto's
// BufferSource; copy any Uint8Array into a guaranteed ArrayBuffer-backed one.
function ab(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(view.byteLength));
  out.set(view);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", ab(raw), { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ab(bytes)),
  );
  return `${toB64(iv)}.${toB64(ct)}`;
}

async function decryptBytes(key: CryptoKey, blob: string): Promise<Uint8Array> {
  const [ivB64, ctB64] = blob.split(".");
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      key,
      fromB64(ctB64),
    ),
  );
}

export function encryptString(key: CryptoKey, text: string): Promise<string> {
  return encryptBytes(key, textEncoder.encode(text));
}

export async function decryptString(key: CryptoKey, blob: string): Promise<string> {
  return textDecoder.decode(await decryptBytes(key, blob));
}

// Derive an AES wrapping key from a passphrase + salt via PBKDF2.
async function deriveWrapKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    ab(textEncoder.encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: ab(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Encrypt the master key under a passphrase. Returns "v1.<salt>.<iv>.<ct>".
export async function wrapMasterKey(
  masterKey: CryptoKey,
  passphrase: string,
): Promise<string> {
  const salt = randomBytes(16);
  const wrapKey = await deriveWrapKey(passphrase, salt);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", masterKey));
  return `${VERSION}.${toB64(salt)}.${await encryptBytes(wrapKey, raw)}`;
}

// Recover the master key from its wrapped form. Throws if the passphrase is
// wrong (AES-GCM authentication fails) or the version is unknown.
export async function unwrapMasterKey(
  wrapped: string,
  passphrase: string,
): Promise<CryptoKey> {
  const [version, saltB64, ivB64, ctB64] = wrapped.split(".");
  if (version !== VERSION) throw new Error("Unsupported key version");
  const wrapKey = await deriveWrapKey(passphrase, fromB64(saltB64));
  const raw = await decryptBytes(wrapKey, `${ivB64}.${ctB64}`);
  return importAesKey(raw);
}

// A small known-plaintext token, encrypted under the master key, used to tell a
// correct passphrase (which yields a working key) from a wrong one.
export function makeVerifier(masterKey: CryptoKey): Promise<string> {
  return encryptString(masterKey, VERIFIER_PLAINTEXT);
}

export async function checkVerifier(
  masterKey: CryptoKey,
  verifier: string,
): Promise<boolean> {
  try {
    return (await decryptString(masterKey, verifier)) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

// Crude strength signal for the warn-don't-block meter. Entropy, not policy:
// the UI shows it and warns, but never blocks (a user may want something easy
// to remember — at the documented cost that the operator can then crack it).
export type Strength = "weak" | "fair" | "strong";

export function passphraseStrength(passphrase: string): Strength {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
    re.test(passphrase),
  ).length;
  if (passphrase.length >= 12 && classes >= 3) return "strong";
  if (passphrase.length >= 9 && classes >= 2) return "fair";
  return "weak";
}
