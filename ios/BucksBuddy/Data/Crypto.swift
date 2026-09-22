import CommonCrypto
import CryptoKit
import Foundation
import Security

// Encryption primitives, byte-compatible with the web app's WebCrypto code
// (src/lib/crypto.ts) — both apps read and write the same rows.
//
//   * Each user has one random 256-bit AES-GCM "master key" that encrypts
//     their values. Changing the passphrase only re-wraps the master key.
//   * The master key is stored wrapped by a PBKDF2-SHA-256 key derived from a
//     passphrase. Users without a passphrase get it wrapped with the public
//     DEFAULT_PASSPHRASE — not a secret, so default-tier data stays
//     operator-readable, exactly as on the web.
//
// Envelope formats (dot-separated standard base64):
//   value blob : "<iv>.<ct>"               ct = ciphertext ‖ 16-byte GCM tag
//   wrapped key: "v1.<salt>.<iv>.<ct>"
// WebCrypto appends the tag to the ciphertext, and uses a 12-byte IV — the
// same layout CryptoKit calls nonce / ciphertext / tag.

enum CryptoError: Error {
    case malformed
    case unsupportedVersion
    case keyDerivationFailed
}

enum BBCrypto {
    static let version = "v1"
    static let pbkdf2Iterations: UInt32 = 600_000
    static let verifierPlaintext = "bucksbuddy-e2e-ok"
    /// The public, non-secret wrapper for users who have not set a passphrase.
    static let defaultPassphrase = "bubbles"

    private static let tagLength = 16

    static func generateMasterKey() -> SymmetricKey { SymmetricKey(size: .bits256) }

    // MARK: Values

    static func encrypt(_ bytes: Data, key: SymmetricKey) throws -> String {
        let box = try AES.GCM.seal(bytes, using: key, nonce: AES.GCM.Nonce())
        let ivData = box.nonce.withUnsafeBytes { Data($0) }
        let ct = box.ciphertext + box.tag
        return "\(ivData.base64EncodedString()).\(ct.base64EncodedString())"
    }

    static func decrypt(_ blob: String, key: SymmetricKey) throws -> Data {
        let parts = blob.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count >= 2,
              let iv = Data(base64Encoded: String(parts[0])),
              let ct = Data(base64Encoded: String(parts[1])),
              ct.count >= tagLength
        else { throw CryptoError.malformed }
        let box = try AES.GCM.SealedBox(
            nonce: AES.GCM.Nonce(data: iv),
            ciphertext: ct.prefix(ct.count - tagLength),
            tag: ct.suffix(tagLength)
        )
        return try AES.GCM.open(box, using: key)
    }

    static func encryptString(_ text: String, key: SymmetricKey) throws -> String {
        try encrypt(Data(text.utf8), key: key)
    }

    static func decryptString(_ blob: String, key: SymmetricKey) throws -> String {
        let data = try decrypt(blob, key: key)
        guard let s = String(data: data, encoding: .utf8) else { throw CryptoError.malformed }
        return s
    }

    // MARK: Key wrapping

    static func deriveWrapKey(passphrase: String, salt: Data) throws -> SymmetricKey {
        let passwordLength = passphrase.utf8.count
        let keyLength = 32
        var derived = [UInt8](repeating: 0, count: keyLength)
        let status = passphrase.withCString { pwPtr in
            salt.withUnsafeBytes { saltBytes in
                CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2),
                    pwPtr, passwordLength,
                    saltBytes.bindMemory(to: UInt8.self).baseAddress, salt.count,
                    CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                    pbkdf2Iterations,
                    &derived, keyLength
                )
            }
        }
        guard status == kCCSuccess else { throw CryptoError.keyDerivationFailed }
        return SymmetricKey(data: derived)
    }

    /// Encrypt the master key under a passphrase: "v1.<salt>.<iv>.<ct>".
    static func wrapMasterKey(_ masterKey: SymmetricKey, passphrase: String) throws -> String {
        var salt = Data(count: 16)
        let ok = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }
        guard ok == errSecSuccess else { throw CryptoError.keyDerivationFailed }
        let wrapKey = try deriveWrapKey(passphrase: passphrase, salt: salt)
        let raw = masterKey.withUnsafeBytes { Data($0) }
        let sealed = try encrypt(raw, key: wrapKey)
        return "\(version).\(salt.base64EncodedString()).\(sealed)"
    }

    /// Recover the master key. Throws on a wrong passphrase (GCM
    /// authentication fails) or an unknown version.
    static func unwrapMasterKey(_ wrapped: String, passphrase: String) throws -> SymmetricKey {
        let parts = wrapped.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 4 else { throw CryptoError.malformed }
        guard parts[0] == version else { throw CryptoError.unsupportedVersion }
        guard let salt = Data(base64Encoded: parts[1]) else { throw CryptoError.malformed }
        let wrapKey = try deriveWrapKey(passphrase: passphrase, salt: salt)
        let raw = try decrypt("\(parts[2]).\(parts[3])", key: wrapKey)
        return SymmetricKey(data: raw)
    }

    static func makeVerifier(_ masterKey: SymmetricKey) throws -> String {
        try encryptString(verifierPlaintext, key: masterKey)
    }

    static func checkVerifier(_ masterKey: SymmetricKey, verifier: String) -> Bool {
        (try? decryptString(verifier, key: masterKey)) == verifierPlaintext
    }

    // MARK: Per-field helpers

    static func encryptNumber(_ n: Double, key: SymmetricKey) throws -> String {
        try encryptString(JSNumber.string(n), key: key)
    }

    static func decryptNumber(_ blob: String, key: SymmetricKey) throws -> Double {
        let s = try decryptString(blob, key: key).trimmingCharacters(in: .whitespaces)
        guard let n = Double(s) else { throw CryptoError.malformed }
        return n
    }

    static func encryptNote(_ note: String?, key: SymmetricKey) throws -> String? {
        guard let note else { return nil }
        return try encryptString(note, key: key)
    }

    /// A stable, garbled stand-in for an encrypted value: a few characters of
    /// its ciphertext. Distinct per row, reveals nothing.
    static func cipherMask(_ cipher: String?) -> String {
        let frag = String((cipher ?? "").filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(4))
        return frag.isEmpty ? "••••" : frag
    }
}
