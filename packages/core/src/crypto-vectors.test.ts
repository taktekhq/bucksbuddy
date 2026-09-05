// Validator #4 (docs/EXPO_MIGRATION.md): the crypto envelope is trusted only
// if three independent implementations agree on it — WebCrypto (web),
// react-native-quick-crypto (native, exercised on-device via
// apps/mobile's crypto-check route), and this pure-JS noble referee, which
// runs right here in CI on every push. When two disagree, this is the one
// that says which is wrong.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSPHRASE,
  decryptString,
  encryptString,
  generateMasterKey,
  unwrapMasterKey,
  wrapMasterKey,
} from "./crypto";
import { CRYPTO_COMPATIBILITY_VECTORS as VECTORS } from "./crypto-vectors";
import {
  nobleDecryptString,
  nobleEncryptString,
  nobleUnwrapMasterKey,
  nobleWrapMasterKey,
} from "./crypto-noble";

describe("crypto vectors: noble referee", () => {
  it("opens the frozen default-passphrase vault", async () => {
    const rawKey = await nobleUnwrapMasterKey(VECTORS.wrappedDefault, DEFAULT_PASSPHRASE);
    expect(nobleDecryptString(rawKey, VECTORS.amount)).toBe(VECTORS.expectedAmount);
    expect(nobleDecryptString(rawKey, VECTORS.note)).toBe(VECTORS.expectedNote);
  });

  it("opens the frozen user-passphrase vault", async () => {
    const rawKey = await nobleUnwrapMasterKey(VECTORS.wrappedPass, VECTORS.passphrase);
    expect(nobleDecryptString(rawKey, VECTORS.amount)).toBe(VECTORS.expectedAmount);
  });

  it("rejects an envelope with an unknown version tag", async () => {
    await expect(
      nobleUnwrapMasterKey(`v2.${VECTORS.wrappedDefault.slice(3)}`, DEFAULT_PASSPHRASE),
    ).rejects.toThrow("Unsupported key version");
  });

  it("decrypts what WebCrypto encrypted, byte-for-byte", async () => {
    const key = await generateMasterKey();
    const blob = await encryptString(key, "three-way agreement, 🥕 $1,234.50");
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    expect(nobleDecryptString(raw, blob)).toBe("three-way agreement, 🥕 $1,234.50");
  });

  it("produces ciphertext WebCrypto can decrypt", async () => {
    const key = await generateMasterKey();
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const blob = nobleEncryptString(raw, "noble-to-webcrypto round trip");
    expect(await decryptString(key, blob)).toBe("noble-to-webcrypto round trip");
  });

  it("wraps a master key that WebCrypto can unwrap", async () => {
    const key = await generateMasterKey();
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const wrapped = await nobleWrapMasterKey(raw, "a shared passphrase");
    const reopened = await unwrapMasterKey(wrapped, "a shared passphrase");
    const blob = await encryptString(reopened, "wrapped by noble, read by WebCrypto");
    expect(await decryptString(reopened, blob)).toBe("wrapped by noble, read by WebCrypto");
  });

  it("unwraps a master key that WebCrypto wrapped", async () => {
    const key = await generateMasterKey();
    const wrapped = await wrapMasterKey(key, "another shared passphrase");
    const raw = await nobleUnwrapMasterKey(wrapped, "another shared passphrase");
    const blob = await encryptString(key, "wrapped by WebCrypto, read by noble");
    expect(nobleDecryptString(raw, blob)).toBe("wrapped by WebCrypto, read by noble");
  });
});
