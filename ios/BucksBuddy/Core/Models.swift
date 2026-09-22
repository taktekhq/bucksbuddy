import Foundation

// The decrypted, in-memory shapes the app works with. The database rows (with
// their `_enc` columns) live in Data/Rows.swift; the store turns one into the
// other. See src/types/db.ts in the web app for the same split.

/// One money entry. `amountCents` is the amount normalized to the user's HOME
/// currency, in hundredths (the database column is still called
/// `amount_usd_cents` from when USD was the only home currency).
/// `originalCurrency` / `originalAmount` are what was actually typed, and
/// `rateUsed` the rate that turned it into home cents (units of original per
/// 1 home; 1 for an entry in the home currency).
struct Transaction: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let userId: String
    var isIncome: Bool
    var category: String
    var amountCents: Int
    var originalCurrency: String
    var originalAmount: Double
    var rateUsed: Double
    var occurredAt: Date
    var note: String?
    var createdAt: Date
    /// Display-only: set when the row is shown obscured (this device is
    /// locked). A garbled stand-in for the amount; the real value isn't
    /// available yet, and `amountCents` is 0.
    var amountMask: String?

    var isMasked: Bool { amountMask != nil }
}

/// What the composer hands the store to add or update an entry.
struct NewTransaction: Hashable, Sendable {
    var isIncome: Bool
    var category: String
    var amountCents: Int
    var originalCurrency: String
    var originalAmount: Double
    var rateUsed: Double
    var note: String?
}

/// Gold in the Safe, tracked purely in grams. The safe's gold total is the
/// all-time signed sum of grams.
struct SafeGoldEntry: Identifiable, Hashable, Codable, Sendable {
    let id: String
    let userId: String
    var isDeposit: Bool
    var grams: Double
    var note: String?
    var occurredAt: Date
    var createdAt: Date
    /// Display-only: garbled stand-in for grams when the device is locked.
    var gramsMask: String?
}

struct NewSafeGoldEntry: Hashable, Sendable {
    var isDeposit: Bool
    var grams: Double
    var note: String?
}

/// Net of a set of entries in home cents: income adds, everything else subtracts.
func netCents<S: Sequence>(_ rows: S) -> Int where S.Element == Transaction {
    rows.reduce(0) { $0 + ($1.isIncome ? $1.amountCents : -$1.amountCents) }
}
