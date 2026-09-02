// A second, independent AES-GCM/PBKDF2 implementation used only as the
// three-way referee for `crypto.ts`'s envelope format (see Validator #4 in
// docs/EXPO_MIGRATION.md). `@noble/ciphers` + `@noble/hashes` are pure JS —
// no WebCrypto, no native module — so when WebCrypto (web) and
// react-native-quick-crypto (native) ever disagree, this says which one is
// wrong. It is test-only: nothing in `apps/*` imports this module, so it
// never ships in a bundle.
//
// Mirrors the envelope formats from crypto.ts exactly:
//   value blob : "<iv>.<ct>"
//   wrapped key: "v1.<salt>.<iv>.<ct>"

import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

const VERSION = "v1";
const PBKDF2_ITERATIONS = 600_000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function decryptBytes(rawKey: Uint8Array, blob: string): Uint8Array {
  const [ivB64, ctB64] = blob.split(".");
  return gcm(rawKey, fromB64(ivB64)).decrypt(fromB64(ctB64));
}

function encryptBytes(rawKey: Uint8Array, bytes: Uint8Array): string {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = gcm(rawKey, iv).encrypt(bytes);
  return `${toB64(iv)}.${toB64(ct)}`;
}

export function nobleDecryptString(rawKey: Uint8Array, blob: string): string {
  return textDecoder.decode(decryptBytes(rawKey, blob));
}

export function nobleEncryptString(rawKey: Uint8Array, text: string): string {
  return encryptBytes(rawKey, textEncoder.encode(text));
}

async function nobleDeriveWrapKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, textEncoder.encode(passphrase), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
  });
}

/** Recover the raw 256-bit master key from its wrapped form. */
export async function nobleUnwrapMasterKey(
  wrapped: string,
  passphrase: string,
): Promise<Uint8Array> {
  const [version, saltB64, ivB64, ctB64] = wrapped.split(".");
  if (version !== VERSION) throw new Error("Unsupported key version");
  const wrapKey = await nobleDeriveWrapKey(passphrase, fromB64(saltB64));
  return decryptBytes(wrapKey, `${ivB64}.${ctB64}`);
}

/** Wrap a raw 256-bit master key under a passphrase, noble-side. */
export async function nobleWrapMasterKey(
  rawMasterKey: Uint8Array,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapKey = await nobleDeriveWrapKey(passphrase, salt);
  return `${VERSION}.${toB64(salt)}.${encryptBytes(wrapKey, rawMasterKey)}`;
}
