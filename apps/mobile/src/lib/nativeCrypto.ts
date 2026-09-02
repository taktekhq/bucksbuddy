import {
  checkVerifier,
  configureCryptoPort,
  decryptString,
  DEFAULT_PASSPHRASE,
  encryptString,
  unwrapMasterKey,
  type CryptoPort,
} from "@bucksbuddy/core/crypto";
import { CRYPTO_COMPATIBILITY_VECTORS as VECTORS } from "@bucksbuddy/core/crypto-vectors";
import QuickCrypto, { install } from "react-native-quick-crypto";

let installed = false;

export function installNativeCrypto(): void {
  if (installed) return;
  install();
  configureCryptoPort(QuickCrypto as unknown as CryptoPort);
  installed = true;
}

export type CryptoDiagnostics = {
  pbkdf2Ms: number;
  defaultVector: boolean;
  passphraseVector: boolean;
  verifierVector: boolean;
  nativeRoundTrip: boolean;
};

export async function runCryptoDiagnostics(): Promise<CryptoDiagnostics> {
  installNativeCrypto();

  const startedAt = performance.now();
  const defaultKey = await unwrapMasterKey(
    VECTORS.wrappedDefault,
    DEFAULT_PASSPHRASE,
  );
  const pbkdf2Ms = performance.now() - startedAt;

  const [amount, note, verifierVector] = await Promise.all([
    decryptString(defaultKey, VECTORS.amount),
    decryptString(defaultKey, VECTORS.note),
    checkVerifier(defaultKey, VECTORS.verifier),
  ]);

  const passphraseKey = await unwrapMasterKey(
    VECTORS.wrappedPass,
    VECTORS.passphrase,
  );
  const passphraseAmount = await decryptString(passphraseKey, VECTORS.amount);
  const nativeCiphertext = await encryptString(defaultKey, "native-vector-ok");
  const nativeRoundTrip =
    (await decryptString(defaultKey, nativeCiphertext)) === "native-vector-ok";

  return {
    pbkdf2Ms,
    defaultVector:
      amount === VECTORS.expectedAmount && note === VECTORS.expectedNote,
    passphraseVector: passphraseAmount === VECTORS.expectedAmount,
    verifierVector,
    nativeRoundTrip,
  };
}
