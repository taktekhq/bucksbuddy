import { describe, it, expect } from "vitest";
import {
  DEFAULT_PASSPHRASE,
  checkVerifier,
  decryptString,
  encryptString,
  generateMasterKey,
  makeVerifier,
  passphraseStrength,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";

describe("crypto", () => {
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

  it("rates passphrase strength across all bands", () => {
    expect(passphraseStrength("abc")).toBe("weak"); // too short
    expect(passphraseStrength("abcdefghi")).toBe("weak"); // long enough, one class
    expect(passphraseStrength("abcdefghijkl")).toBe("weak"); // 12 chars, one class
    expect(passphraseStrength("abcd1234e")).toBe("fair"); // 9 chars, two classes
    expect(passphraseStrength("Abcd1234!xyz")).toBe("strong"); // 12 chars, four
  });
});
