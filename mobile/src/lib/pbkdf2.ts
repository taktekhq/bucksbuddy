// Key derivation — the one expensive step in the encryption path, and the
// reason the unlock button used to sit on "Saving…" long enough to look broken.
//
// 600k PBKDF2 rounds is ~1.2M SHA-256 compressions. WebCrypto runs that in
// native code in a few hundred milliseconds, which is why the web can afford to
// derive on every page load. Hermes has no JIT, so the same loop written in
// JavaScript takes tens of seconds on a phone — and a wrong passphrase costs
// exactly as much as a right one, because the key has to exist before it can be
// checked.
//
// react-native-quick-crypto hands the loop to OpenSSL on a background thread,
// where it belongs. It is a native module, so it exists in a real build and not
// under jest or in Expo Go; when it is missing we fall back to the audited
// pure-JS implementation rather than failing. The two produce identical bytes,
// which is not a nicety — the browser opens the same envelopes, so a difference
// would lock people out of their own data.
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

type Derive = (
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
) => Promise<Uint8Array>;

/** PBKDF2-HMAC-SHA256 in JavaScript. Correct everywhere, slow on a phone. */
const deriveInJs: Derive = (passphrase, salt, iterations, dkLen) =>
  pbkdf2Async(sha256, utf8ToBytes(passphrase), salt, { c: iterations, dkLen });

async function loadNative(): Promise<Derive | null> {
  try {
    // A lazy `require`, not a static import: the package binds several native
    // objects the moment its module body runs, so pulling it in at the top of
    // the file would take the whole bundle down wherever those are missing.
    const { pbkdf2 } =
      require("react-native-quick-crypto") as typeof import("react-native-quick-crypto");
    const deriveNatively: Derive = (passphrase, salt, iterations, dkLen) =>
      new Promise((resolve, reject) => {
        // The callback form resolves off the JS thread, so a derivation never
        // costs a dropped frame however long OpenSSL takes.
        pbkdf2(utf8ToBytes(passphrase), salt, iterations, dkLen, "sha256", (err, key) => {
          if (err || !key) reject(err ?? new Error("PBKDF2 returned no key"));
          else resolve(Uint8Array.from(key));
        });
      });
    // Importing the module proves nothing — it binds to the native side on the
    // first call. One cheap round is what actually tells us OpenSSL is there.
    await deriveNatively("probe", new Uint8Array(16), 1, 32);
    return deriveNatively;
  } catch {
    return null;
  }
}

// Probed once, on the first derivation, and shared by everything after it —
// including calls that arrive while the probe is still in flight.
let native: Promise<Derive | null> | undefined;

/** Derive `dkLen` bytes from a passphrase and salt via PBKDF2-HMAC-SHA256. */
export function deriveBits(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
): Promise<Uint8Array> {
  native ??= loadNative();
  return native.then((derive) => (derive ?? deriveInJs)(passphrase, salt, iterations, dkLen));
}
