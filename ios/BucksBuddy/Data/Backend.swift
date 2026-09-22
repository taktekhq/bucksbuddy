import Foundation
import Supabase

// The one Supabase client, configured from Info.plist (which reads it from
// Config/*.xcconfig — see ios/README.md). Same project, same tables and same
// row-level security as the web app: an account works identically on both.

enum AppConfig {
    private static func value(_ key: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    /// "bucksbuddy.supabase.co" — kept without the scheme, because `//` starts
    /// a comment in an .xcconfig file.
    static var supabaseHost: String { value("SupabaseHost") }
    static var supabaseAnonKey: String { value("SupabaseAnonKey") }

    static var supabaseURL: URL {
        URL(string: "https://\(supabaseHost.isEmpty ? "invalid.supabase.co" : supabaseHost)")!
    }

    static var isConfigured: Bool {
        !supabaseHost.isEmpty && !supabaseAnonKey.isEmpty && !supabaseAnonKey.hasPrefix("$(")
    }

    /// Where the OAuth sheet hands control back to the app. Must be listed in
    /// Supabase → Authentication → URL Configuration → Redirect URLs.
    static let authRedirect = URL(string: "bucksbuddy://auth-callback")!

    /// The web app, for the legal and contact pages.
    static let webURL = URL(string: "https://bucksbuddy.com")!
    static let contactEmail = "nizar@taktek.io"
}

let supabase = SupabaseClient(
    supabaseURL: AppConfig.supabaseURL,
    supabaseKey: AppConfig.isConfigured ? AppConfig.supabaseAnonKey : "missing-anon-key",
    options: SupabaseClientOptions(
        auth: .init(redirectToURL: AppConfig.authRedirect, flowType: .pkce)
    )
)

// MARK: - Rows as stored

/// A transaction row as it comes back from the database. The money *values*
/// are encrypted per-column (`*_enc`); the labels stay plaintext.
struct TransactionRow: Codable, Sendable {
    let id: String
    let userId: String
    let occurredAt: String
    let createdAt: String
    let isIncome: Bool
    let category: String
    let originalCurrency: String
    let rateUsed: Double
    let amountUsdCentsEnc: String?
    let originalAmountEnc: String?
    let noteEnc: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case occurredAt = "occurred_at"
        case createdAt = "created_at"
        case isIncome = "is_income"
        case category
        case originalCurrency = "original_currency"
        case rateUsed = "rate_used"
        case amountUsdCentsEnc = "amount_usd_cents_enc"
        case originalAmountEnc = "original_amount_enc"
        case noteEnc = "note_enc"
    }
}

/// What's written for an (encrypted) transaction: plaintext labels plus the
/// three `_enc` value columns. `user_id` is only sent on insert.
struct TransactionWrite: Encodable, Sendable {
    var userId: String?
    let isIncome: Bool
    let category: String
    let originalCurrency: String
    let rateUsed: Double
    let amountUsdCentsEnc: String
    let originalAmountEnc: String
    let noteEnc: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case isIncome = "is_income"
        case category
        case originalCurrency = "original_currency"
        case rateUsed = "rate_used"
        case amountUsdCentsEnc = "amount_usd_cents_enc"
        case originalAmountEnc = "original_amount_enc"
        case noteEnc = "note_enc"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(userId, forKey: .userId)
        try c.encode(isIncome, forKey: .isIncome)
        try c.encode(category, forKey: .category)
        try c.encode(originalCurrency, forKey: .originalCurrency)
        try c.encode(rateUsed, forKey: .rateUsed)
        try c.encode(amountUsdCentsEnc, forKey: .amountUsdCentsEnc)
        try c.encode(originalAmountEnc, forKey: .originalAmountEnc)
        // An explicit null clears a note on update, same as the web app.
        try c.encode(noteEnc, forKey: .noteEnc)
    }
}

struct GoldRow: Codable, Sendable {
    let id: String
    let userId: String
    let occurredAt: String
    let createdAt: String
    let isDeposit: Bool
    let gramsEnc: String?
    let noteEnc: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case occurredAt = "occurred_at"
        case createdAt = "created_at"
        case isDeposit = "is_deposit"
        case gramsEnc = "grams_enc"
        case noteEnc = "note_enc"
    }
}

struct GoldWrite: Encodable, Sendable {
    let userId: String
    let isDeposit: Bool
    let gramsEnc: String
    let noteEnc: String?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case isDeposit = "is_deposit"
        case gramsEnc = "grams_enc"
        case noteEnc = "note_enc"
    }
}

/// The profile's currency settings. Decoded leniently: junk in the jsonb (an
/// unknown code, a non-positive rate) is dropped by `Currencies.settings`.
struct ProfileRow: Decodable, Sendable {
    let homeCurrency: String?
    let currencies: [LenientRate]?

    struct LenientRate: Decodable, Sendable {
        let code: String?
        let rate: Double?
    }

    enum CodingKeys: String, CodingKey {
        case homeCurrency = "home_currency"
        case currencies
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        homeCurrency = try? c.decodeIfPresent(String.self, forKey: .homeCurrency)
        currencies = try? c.decodeIfPresent([LenientRate].self, forKey: .currencies)
    }

    var settings: CurrencySettings {
        let rates = currencies?.compactMap { r -> CurrencyRate? in
            guard let code = r.code, let rate = r.rate else { return nil }
            return CurrencyRate(code: code, rate: rate)
        }
        return Currencies.settings(home: homeCurrency, currencies: rates)
    }
}

struct KeyRow: Codable, Sendable {
    let wrappedKey: String
    let wrapType: String
    let verifier: String

    enum CodingKeys: String, CodingKey {
        case wrappedKey = "wrapped_key"
        case wrapType = "wrap_type"
        case verifier
    }
}

// MARK: - Keychain (the cached passphrase)

/// The passphrase is cached per user on this device so the app stays unlocked
/// across launches — in the Keychain, never sent anywhere. The server still
/// can't read it, so encryption stays end-to-end.
enum PassphraseStore {
    private static let service = "app.bucksbuddy.e2e"

    private static func query(_ userId: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: "bb-e2e-pass:\(userId)"]
    }

    static func load(_ userId: String) -> String? {
        var q = query(userId)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ userId: String, _ passphrase: String) {
        clear(userId)
        var q = query(userId)
        q[kSecValueData as String] = Data(passphrase.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func clear(_ userId: String) {
        SecItemDelete(query(userId) as CFDictionary)
    }
}

// MARK: - On-device snapshot

/// The last decrypted state, so a cold start paints real numbers instantly
/// while the network read is in flight. Written with complete file
/// protection, never while locked, and dropped on sign-out or when the
/// device turns out to be locked.
struct Snapshot: Codable {
    var transactions: [Transaction]
    var homeCurrency: String
    var currencies: [CurrencyRate]
    var gold: [SafeGoldEntry]
}

enum SnapshotCache {
    private static func url(_ userId: String) -> URL? {
        guard let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
        else { return nil }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let safe = userId.filter { $0.isLetter || $0.isNumber || $0 == "-" }
        return dir.appendingPathComponent("snapshot-\(safe).json")
    }

    static func load(_ userId: String) -> Snapshot? {
        guard let url = url(userId), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    static func save(_ userId: String, _ snapshot: Snapshot) {
        guard let url = url(userId), let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtection])
    }

    static func clear(_ userId: String) {
        guard let url = url(userId) else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
