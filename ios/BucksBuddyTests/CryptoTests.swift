import CryptoKit
import XCTest
@testable import BucksBuddy

/// The iOS app reads and writes the same rows as the web app, so its crypto
/// must be byte-compatible with WebCrypto. These vectors were produced by the
/// web app's exact algorithm (src/lib/crypto.ts) running under Node's
/// WebCrypto: a fixed master key, wrapped with the default and a custom
/// passphrase, plus values encrypted under it.
final class CryptoTests: XCTestCase {
    let rawKey = Data(base64Encoded: "AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsXM09o=")!
    var masterKey: SymmetricKey { SymmetricKey(data: rawKey) }

    let web = (
        wrappedDefault: "v1.8IYpF08xPtn9lyJ+J3SVOg==.CMms9mKOETaMbDtR.w93oHBsQYTGMuctW57B4ilRYtxLWtoI2Pen5EJsJpRpGR+3s3ZS1P/nQnKXUa/E1",
        wrappedPassphrase: "v1.v1vVY0pSNt29kLPZwfrPcw==.vrS7FaQBp3YeToia.Bf7NoKCEQ0GkAV3Xk2Jjxiqt9T3VePF+sEbOLOv48lt2NS0izjHi+4btZ43KcnrR",
        verifier: "mH3hicBioXn9ECdl.RZQm8pmt3HeoYGDOt9aoyC0ivTwJAASUGi3XiLNjzEh8",
        cents: "zMhmcRnpbKnyjDBf.Y9dKig9Xtxs8XjWET53tbjz4s3w=",
        decimal: "VihWG1YMfNBC3ew4.LGctSNdbjp+JQ9FnZ5pXaSGOLSY=",
        lbp: "UeCB/uL+dHZr8ueR.mqBruzHECA7GI8bJEMmRwvD792o4eA==",
        note: "4KiUeXXoQmLC0O7G.7SaFdT/pj6pKcO6CK738xAXKL9lDs6iZhtkoU7aEz812Hx086OU="
    )

    func raw(_ key: SymmetricKey) -> Data { key.withUnsafeBytes { Data($0) } }

    func testUnwrapsWebDefaultTierKey() throws {
        let key = try BBCrypto.unwrapMasterKey(web.wrappedDefault, passphrase: BBCrypto.defaultPassphrase)
        XCTAssertEqual(raw(key), rawKey)
    }

    func testUnwrapsWebPassphraseKey() throws {
        let key = try BBCrypto.unwrapMasterKey(web.wrappedPassphrase, passphrase: "correct horse ✓")
        XCTAssertEqual(raw(key), rawKey)
    }

    func testWrongPassphraseThrows() {
        XCTAssertThrowsError(try BBCrypto.unwrapMasterKey(web.wrappedPassphrase, passphrase: "nope"))
    }

    func testVerifiesWebVerifier() {
        XCTAssertTrue(BBCrypto.checkVerifier(masterKey, verifier: web.verifier))
        XCTAssertFalse(BBCrypto.checkVerifier(BBCrypto.generateMasterKey(), verifier: web.verifier))
    }

    func testDecryptsWebValues() throws {
        XCTAssertEqual(try BBCrypto.decryptNumber(web.cents, key: masterKey), 1250)
        XCTAssertEqual(try BBCrypto.decryptNumber(web.decimal, key: masterKey), 12.5)
        XCTAssertEqual(try BBCrypto.decryptNumber(web.lbp, key: masterKey), 890_000)
        XCTAssertEqual(try BBCrypto.decryptString(web.note, key: masterKey), "Netflix (monthly) 🎬")
    }

    func testRoundTripsAndWritesWebReadableNumbers() throws {
        let key = masterKey
        let blob = try BBCrypto.encryptNumber(1250, key: key)
        // The web app does Number(decrypted): the plaintext must be "1250".
        XCTAssertEqual(try BBCrypto.decryptString(blob, key: key), "1250")
        XCTAssertEqual(try BBCrypto.decryptString(try BBCrypto.encryptNumber(12.5, key: key), key: key), "12.5")
        let parts = blob.split(separator: ".")
        XCTAssertEqual(parts.count, 2)
        XCTAssertEqual(Data(base64Encoded: String(parts[0]))?.count, 12)
    }

    func testWrapRoundTrip() throws {
        let key = BBCrypto.generateMasterKey()
        let wrapped = try BBCrypto.wrapMasterKey(key, passphrase: "pass")
        XCTAssertTrue(wrapped.hasPrefix("v1."))
        XCTAssertEqual(raw(try BBCrypto.unwrapMasterKey(wrapped, passphrase: "pass")), raw(key))
    }

    func testCipherMask() {
        XCTAssertEqual(BBCrypto.cipherMask("a+b/c.d9ef"), "abcd")
        XCTAssertEqual(BBCrypto.cipherMask(nil), "••••")
    }
}
