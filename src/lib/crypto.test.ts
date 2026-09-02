import { describe, it, expect } from "vitest";
import {
  DEFAULT_PASSPHRASE,
  checkVerifier,
  configureCryptoPort,
  decryptString,
  encryptString,
  generateMasterKey,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";
import { CRYPTO_COMPATIBILITY_VECTORS as VECTORS } from "@bucksbuddy/core/crypto-vectors";

describe("crypto", () => {
  it("supports an explicitly injected WebCrypto provider", async () => {
    configureCryptoPort(globalThis.crypto);
    try {
      await expect(generateMasterKey()).resolves.toBeDefined();
    } finally {
      configureCryptoPort(null);
    }
  });

  it("fails clearly when a provider has no subtle crypto implementation", () => {
    configureCryptoPort({} as Crypto);
    try {
      expect(() => generateMasterKey()).toThrow(
        "A WebCrypto-compatible provider is required",
      );
    } finally {
      configureCryptoPort(null);
    }
  });

  it("round-trips a (unicode) string through encrypt/decrypt", async () => {
    const key = await generateMasterKey();
    const blob = await encryptString(key, "héllo, 🥕 $1,234.50");
    expect(blob).not.toContain("héllo"); // actually encrypted
    expect(blob).toContain("."); // iv.ct envelope
    expect(await decryptString(key, blob)).toBe("héllo, 🥕 $1,234.50");
  });

  it("wraps and unwraps the master key with the right passphrase", async () => {
    const mk = await generateMasterKey();
    const wrapped = await wrapMasterKey(mk, "correct horse battery");
    const recovered = await unwrapMasterKey(wrapped, "correct horse battery");
    // Same key: it can read what the original wrote.
    const blob = await encryptString(mk, "secret");
    expect(await decryptString(recovered, blob)).toBe("secret");
  });

  it("fails to unwrap with the wrong passphrase", async () => {
    const mk = await generateMasterKey();
    const wrapped = await wrapMasterKey(mk, "right");
    await expect(unwrapMasterKey(wrapped, "wrong")).rejects.toThrow();
  });

  it("rejects an unknown wrapped-key version", async () => {
    const mk = await generateMasterKey();
    const wrapped = await wrapMasterKey(mk, "p");
    const tampered = `v2${wrapped.slice(2)}`;
    await expect(unwrapMasterKey(tampered, "p")).rejects.toThrow(
      "Unsupported key version",
    );
  });

  it("works with the public default passphrase", async () => {
    const mk = await generateMasterKey();
    const wrapped = await wrapMasterKey(mk, DEFAULT_PASSPHRASE);
    await expect(unwrapMasterKey(wrapped, DEFAULT_PASSPHRASE)).resolves.toBeDefined();
  });

  it("verifier passes only for the matching key", async () => {
    const mk = await generateMasterKey();
    const other = await generateMasterKey();
    const verifier = await makeVerifier(mk);
    expect(await checkVerifier(mk, verifier)).toBe(true);
    expect(await checkVerifier(other, verifier)).toBe(false);
  });
});

// --- stored-format contract ------------------------------------------------
// These envelopes were produced by this implementation and are checked in as
// data. They pin the three constants that are not implementation details but
// promises to already-stored rows: the version tag, the public default
// passphrase, and the verifier plaintext. Change any of them and every
// existing user's vault stops opening — which round-trip tests alone cannot
// catch, since they re-encrypt with whatever the constant currently says.
//
// They are also the seed of the web/native compatibility vectors the Expo port
// needs: a second implementation must decrypt exactly these bytes.
describe("stored-format compatibility", () => {
  it("opens a vault wrapped under the shipped default passphrase", async () => {
    const key = await unwrapMasterKey(VECTORS.wrappedDefault, DEFAULT_PASSPHRASE);
    expect(await decryptString(key, VECTORS.amount)).toBe(VECTORS.expectedAmount);
    expect(await decryptString(key, VECTORS.note)).toBe(VECTORS.expectedNote);
  });

  it("opens the same vault under a user passphrase", async () => {
    const key = await unwrapMasterKey(VECTORS.wrappedPass, VECTORS.passphrase);
    expect(await decryptString(key, VECTORS.amount)).toBe(VECTORS.expectedAmount);
  });

  it("still recognises a verifier written by an earlier build", async () => {
    const key = await unwrapMasterKey(VECTORS.wrappedDefault, DEFAULT_PASSPHRASE);
    expect(await checkVerifier(key, VECTORS.verifier)).toBe(true);
  });

  it("tags new envelopes with the version the readers expect", async () => {
    const wrapped = await wrapMasterKey(await generateMasterKey(), "pw");
    expect(wrapped.startsWith("v1.")).toBe(true);
  });

  it("can re-wrap a key recovered from storage", async () => {
    // Re-wrapping is how a passphrase change works, and it exports the key —
    // so a key recovered by unwrapping must come back extractable.
    const key = await unwrapMasterKey(VECTORS.wrappedDefault, DEFAULT_PASSPHRASE);
    const rewrapped = await wrapMasterKey(key, "a new passphrase");
    const reopened = await unwrapMasterKey(rewrapped, "a new passphrase");
    expect(await decryptString(reopened, VECTORS.amount)).toBe(VECTORS.expectedAmount);
  });
});
