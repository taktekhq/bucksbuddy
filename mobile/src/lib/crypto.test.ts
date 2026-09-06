// Adapted from the web's ../../../src/lib/crypto.test.ts. The web's assertions
// are kept verbatim where they still apply — passing them is the evidence that
// the pure-JS primitives behave like the browser's WebCrypto ones. Two
// mobile-only additions: the hand-rolled base64 (the web gets it from
// WebCrypto/btoa) is checked byte-for-byte against Node's encoder, and the
// mobile API is synchronous where the web's was promise-returning.
//
// PBKDF2 is 600k rounds of pure JS — seconds per derivation — so every
// wrap/unwrap lives in one test with a raised timeout, and everything else uses
// the cheap primitives.
import {
  DEFAULT_PASSPHRASE,
  checkVerifier,
  decryptString,
  encryptString,
  generateMasterKey,
  keyFromB64,
  keyToB64,
  makeVerifier,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";

// The repo's tsconfig doesn't pull in Node's types (tests aren't part of the
// typecheck), so name the one Node global this file borrows as a reference
// base64 encoder.
declare const Buffer: {
  from(bytes: Uint8Array): { toString(encoding: string): string };
};

const bytes = (n: number) =>
  new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37 + n) & 255));

describe("crypto", () => {
  it("generates a distinct 256-bit key each time", () => {
    const a = generateMasterKey();
    const b = generateMasterKey();
    expect(a).toHaveLength(32);
    expect(keyToB64(a)).not.toBe(keyToB64(b));
  });

  it("encodes base64 exactly like the browser, at every padding length", () => {
    // Byte-identical envelopes are what let the app read rows the web wrote,
    // so compare against a standard encoder rather than only round-tripping.
    for (let len = 0; len <= 8; len++) {
      const raw = bytes(len);
      const b64 = keyToB64(raw);
      expect(b64).toBe(Buffer.from(raw).toString("base64"));
      expect(Array.from(keyFromB64(b64))).toEqual(Array.from(raw));
    }
    // One byte over a group needs "==", two need "=", a full group needs none.
    expect(keyToB64(new Uint8Array([1]))).toBe("AQ==");
    expect(keyToB64(new Uint8Array([1, 2]))).toBe("AQI=");
    expect(keyToB64(new Uint8Array([1, 2, 3]))).toBe("AQID");
    expect(keyToB64(new Uint8Array())).toBe("");
    expect(keyFromB64("")).toHaveLength(0);
  });

  it("ignores characters outside the alphabet when decoding", () => {
    const raw = bytes(5);
    const b64 = keyToB64(raw);
    const dirty = `${b64.slice(0, 3)}\n ${b64.slice(3)}`;
    expect(Array.from(keyFromB64(dirty))).toEqual(Array.from(raw));
  });

  it("round-trips a (unicode) string through encrypt/decrypt", () => {
    const key = generateMasterKey();
    const blob = encryptString(key, "héllo, 🥕 $1,234.50");
    expect(blob).not.toContain("héllo"); // actually encrypted
    expect(blob).toContain("."); // iv.ct envelope
    expect(decryptString(key, blob)).toBe("héllo, 🥕 $1,234.50");
  });

  it("gives a different blob every time (fresh iv) and won't open with another key", () => {
    const key = generateMasterKey();
    const other = generateMasterKey();
    const a = encryptString(key, "same");
    const b = encryptString(key, "same");
    expect(a).not.toBe(b);
    expect(decryptString(key, b)).toBe("same");
    expect(() => decryptString(other, a)).toThrow();
  });

  it("verifier passes only for the matching key", () => {
    const mk = generateMasterKey();
    const other = generateMasterKey();
    const verifier = makeVerifier(mk);
    expect(checkVerifier(mk, verifier)).toBe(true);
    expect(checkVerifier(other, verifier)).toBe(false);
    expect(checkVerifier(mk, "not-even-an-envelope")).toBe(false);
  });

  it(
    "wraps and unwraps the master key, rejecting a wrong passphrase or version",
    async () => {
      const mk = generateMasterKey();
      const wrapped = await wrapMasterKey(mk, "correct horse battery");
      expect(wrapped.split(".")).toHaveLength(4); // v1.salt.iv.ct
      expect(wrapped.startsWith("v1.")).toBe(true);

      const recovered = await unwrapMasterKey(wrapped, "correct horse battery");
      // Same key: it can read what the original wrote.
      const blob = encryptString(mk, "secret");
      expect(decryptString(recovered, blob)).toBe("secret");

      // Wrong passphrase derives a different wrapping key: GCM auth fails.
      await expect(unwrapMasterKey(wrapped, "wrong")).rejects.toThrow();

      const tampered = `v2${wrapped.slice(2)}`;
      await expect(
        unwrapMasterKey(tampered, "correct horse battery"),
      ).rejects.toThrow("Unsupported key version");

      // The public wrapper used by the default tier works the same way.
      const pub = await wrapMasterKey(mk, DEFAULT_PASSPHRASE);
      expect(keyToB64(await unwrapMasterKey(pub, DEFAULT_PASSPHRASE))).toBe(
        keyToB64(mk),
      );
    },
    240_000,
  );
});
