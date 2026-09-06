// Run with: node --experimental-strip-types scripts/crypto-interop.test.mts
//
// The rows in Supabase were encrypted by the browser, so the native crypto has
// to produce and consume the same bytes. This drives the web's WebCrypto
// algorithm (node has the same API) against lib/crypto and checks both
// directions, including the cold-start path: a master key wrapped by the web,
// unwrapped here.
// Round-trip the mobile (noble) crypto against the web's WebCrypto, using the
// web's exact algorithm, to prove the envelopes interoperate.
import {
  encryptString, decryptString, wrapMasterKey, unwrapMasterKey,
  makeVerifier, checkVerifier, generateMasterKey, DEFAULT_PASSPHRASE,
} from "../src/lib/crypto.ts";

const enc = new TextEncoder();
const ITER = 600_000;
const toB64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

// --- the web's implementation (../src/lib/crypto.ts), verbatim in spirit ---
async function webImportKey(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}
async function webEncrypt(key: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
  return `${toB64(iv)}.${toB64(ct)}`;
}
async function webDecrypt(key: CryptoKey, blob: string) {
  const [iv, ct] = blob.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, key, fromB64(ct)),
  );
}
async function webDeriveWrap(pass: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"],
  );
}
let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
};

// 1. web encrypts a value → mobile decrypts it
const master = generateMasterKey();
const webKey = await webImportKey(master);
const webBlob = await webEncrypt(webKey, "12345");
check("web value blob → mobile decrypts", decryptString(master, webBlob) === "12345");

// 2. mobile encrypts a value → web decrypts it
const mobBlob = encryptString(master, "hello, doc");
check("mobile value blob → web decrypts", (await webDecrypt(webKey, mobBlob)) === "hello, doc");

// 3. web wraps the master key → mobile unwraps it (the cold-start path)
const salt = crypto.getRandomValues(new Uint8Array(16));
const wrapKey = await webDeriveWrap(DEFAULT_PASSPHRASE, salt);
const wrappedByWeb = `v1.${toB64(salt)}.${await webEncrypt(wrapKey, "")}`;
// wrap the raw key bytes properly:
const rawWrapped = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv: fromB64(wrappedByWeb.split(".")[2]) }, wrapKey, master);
const webWrappedKey = `v1.${toB64(salt)}.${wrappedByWeb.split(".")[2]}.${toB64(new Uint8Array(rawWrapped))}`;
const unwrapped = await unwrapMasterKey(webWrappedKey, DEFAULT_PASSPHRASE);
check("web-wrapped master key → mobile unwraps", Buffer.compare(Buffer.from(unwrapped), Buffer.from(master)) === 0);

// 4. mobile wraps → mobile unwraps (self round-trip)
const mobWrapped = await wrapMasterKey(master, "hunter2");
const back = await unwrapMasterKey(mobWrapped, "hunter2");
check("mobile wrap → mobile unwrap", Buffer.compare(Buffer.from(back), Buffer.from(master)) === 0);

// 5. wrong passphrase must fail, not silently return junk
let threw = false;
try { await unwrapMasterKey(mobWrapped, "wrong"); } catch { threw = true; }
check("wrong passphrase rejected", threw);

// 6. verifier round-trips both ways
check("mobile verifier checks", checkVerifier(master, makeVerifier(master)));
check("web-made verifier checks in mobile", checkVerifier(master, await webEncrypt(webKey, "bucksbuddy-e2e-ok")));

process.exit(failures ? 1 : 0);
