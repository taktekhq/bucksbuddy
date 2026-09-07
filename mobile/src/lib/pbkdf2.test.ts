// lib/pbkdf2 picks between a native derivation and a pure-JS one. The only
// thing that really matters is that the choice is invisible: the same
// passphrase and salt must produce the same bytes either way, because the
// browser opens the same envelopes and a mismatch locks someone out of their
// own money.
//
// Node's crypto stands in for OpenSSL here — it is the same primitive the
// native module calls, which is exactly what makes it a fair stand-in.
import { pbkdf2 as nodePbkdf2 } from "node:crypto";

type Callback = (err: Error | null, key?: Uint8Array) => void;
type NativePbkdf2 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
  callback: Callback
) => void;

/** A stand-in for the native module that really does derive the right bytes. */
const realNative: NativePbkdf2 = (
  password,
  salt,
  iterations,
  keylen,
  digest,
  callback,
) => {
  nodePbkdf2(password, salt, iterations, keylen, digest, (err, key) =>
    callback(err, key ? new Uint8Array(key) : undefined),
  );
};

// `native` is memoized at module scope on purpose — the probe should run once
// per app launch — so every test needs its own copy of the module.
function withNative(pbkdf2: NativePbkdf2 | null) {
  jest.resetModules();
  jest.doMock("react-native-quick-crypto", () => {
    if (!pbkdf2) throw new Error("native module missing");
    return { pbkdf2 };
  });
  return require("@/lib/pbkdf2") as typeof import("@/lib/pbkdf2");
}

const SALT = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
]);

afterEach(() => jest.resetModules());

describe("deriveBits", () => {
  it("derives the same bytes with or without the native module", async () => {
    // The whole point. If these ever diverge, half the fleet writes envelopes
    // the other half cannot open.
    const withIt = await withNative(realNative);
    const withoutIt = await withNative(null);
    const a = await withIt.deriveBits("correct horse", SALT, 1000, 32);
    const b = await withoutIt.deriveBits("correct horse", SALT, 1000, 32);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a).toHaveLength(32);
  });

  it("agrees with the reference implementation, not just with itself", async () => {
    const { deriveBits } = await withNative(null);
    const derived = await deriveBits("bubbles", SALT, 2048, 32);
    const expected = await new Promise<Buffer>((resolve, reject) =>
      nodePbkdf2(Buffer.from("bubbles"), SALT, 2048, 32, "sha256", (err, key) =>
        err ? reject(err) : resolve(key),
      ),
    );
    expect(Buffer.from(derived).toString("hex")).toBe(expected.toString("hex"));
  });

  it("falls back when the native module is there but cannot bind", async () => {
    // Expo Go: the JavaScript half of the package loads fine and only throws
    // when it reaches for a native object that was never linked in.
    const { deriveBits } = await withNative(() => {
      throw new Error("Nitro module 'Pbkdf2' not found");
    });
    await expect(deriveBits("bubbles", SALT, 1000, 32)).resolves.toHaveLength(
      32
    );
  });

  it("reports a native failure instead of handing back a bad key", async () => {
    // The probe already proved the module works, so a later failure is real
    // and must not be mistaken for a wrong passphrase.
    let probed = false;
    const { deriveBits } = await withNative(
      (password, salt, i, len, digest, callback) => {
        if (!probed) {
          probed = true;
          realNative(password, salt, i, len, digest, callback);
        } else callback(new Error("OpenSSL said no"));
      }
    );
    await expect(deriveBits("bubbles", SALT, 1000, 32)).rejects.toThrow(
      "OpenSSL said no"
    );
  });

  it("treats a missing key as a failure rather than an empty one", async () => {
    let probed = false;
    const { deriveBits } = await withNative(
      (password, salt, i, len, digest, callback) => {
        if (!probed) {
          probed = true;
          realNative(password, salt, i, len, digest, callback);
        } else callback(null, undefined);
      }
    );
    await expect(deriveBits("bubbles", SALT, 1000, 32)).rejects.toThrow(
      "PBKDF2 returned no key"
    );
  });

  it("probes once and reuses the answer, including for calls already waiting", async () => {
    let calls = 0;
    const counting: NativePbkdf2 = (...args) => {
      calls += 1;
      realNative(...args);
    };
    const { deriveBits } = await withNative(counting);
    // Fired together, before the first probe has resolved.
    await Promise.all([
      deriveBits("bubbles", SALT, 100, 32),
      deriveBits("bubbles", SALT, 100, 32),
    ]);
    await deriveBits("bubbles", SALT, 100, 32);
    // One probe, then one call per derivation.
    expect(calls).toBe(4);
  });
});
