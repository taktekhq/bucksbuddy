import Foundation

// All money math lives here. The database's source of truth is an integer
// count of hundredths of the user's HOME currency. We only round at the
// conversion boundary, never store floats.
//
// A user has one home currency (what totals are shown in) and any number of
// secondary currencies, each with a rate expressed as "units of that currency
// per 1 unit of home" — the same direction as the old "LBP per $1".
// Mirrors src/lib/currency.ts.

struct CurrencyInfo: Hashable, Sendable {
    let code: String
    let name: String
    let symbol: String
    /// Fraction digits shown for this currency (LBP and JPY have none).
    let decimals: Int
}

/// A secondary currency and its rate: units of `code` per 1 unit of home.
struct CurrencyRate: Hashable, Codable, Sendable {
    var code: String
    var rate: Double
}

struct CurrencySettings: Hashable, Sendable {
    var homeCurrency: String
    var currencies: [CurrencyRate]
}

enum Currencies {
    /// The currencies a user can pick from. Curated rather than the full ISO
    /// list so the picker stays short. Keep in step with the web app.
    static let all: [CurrencyInfo] = [
        .init(code: "USD", name: "US Dollar", symbol: "$", decimals: 2),
        .init(code: "EUR", name: "Euro", symbol: "€", decimals: 2),
        .init(code: "LBP", name: "Lebanese Pound", symbol: "LL", decimals: 0),
        .init(code: "GBP", name: "British Pound", symbol: "£", decimals: 2),
        .init(code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2),
        .init(code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2),
        .init(code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2),
        .init(code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2),
        .init(code: "SAR", name: "Saudi Riyal", symbol: "SAR", decimals: 2),
        .init(code: "QAR", name: "Qatari Riyal", symbol: "QAR", decimals: 2),
        .init(code: "KWD", name: "Kuwaiti Dinar", symbol: "KWD", decimals: 3),
        .init(code: "BHD", name: "Bahraini Dinar", symbol: "BHD", decimals: 3),
        .init(code: "OMR", name: "Omani Rial", symbol: "OMR", decimals: 3),
        .init(code: "JOD", name: "Jordanian Dinar", symbol: "JOD", decimals: 3),
        .init(code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2),
        .init(code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2),
        .init(code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0),
        .init(code: "CNY", name: "Chinese Yuan", symbol: "CN¥", decimals: 2),
        .init(code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2),
        .init(code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2),
        .init(code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2),
        .init(code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2),
        .init(code: "PLN", name: "Polish Złoty", symbol: "zł", decimals: 2),
        .init(code: "CZK", name: "Czech Koruna", symbol: "Kč", decimals: 2),
        .init(code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2),
        .init(code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2),
        .init(code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2),
        .init(code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2),
    ]

    static let defaultHome = "USD"
    static let defaultLBPPerUSD: Double = 89_500
    /// What a fresh account gets: USD at home with LBP alongside. Kept in step
    /// with the DB default in 0007_currencies.sql.
    static let defaultSecondaries: [CurrencyRate] = [.init(code: "LBP", rate: defaultLBPPerUSD)]

    private static let byCode: [String: CurrencyInfo] =
        Dictionary(uniqueKeysWithValues: all.map { ($0.code, $0) })

    /// Everything we know about a currency. A code we don't list still formats
    /// sensibly: its code stands in for the symbol, with two decimals.
    static func info(_ code: String) -> CurrencyInfo {
        byCode[code] ?? CurrencyInfo(code: code, name: code, symbol: code, decimals: 2)
    }

    static func symbol(_ code: String) -> String { info(code).symbol }

    static func isKnown(_ code: String) -> Bool { byCode[code] != nil }

    /// The rate to convert `code` into home: 1 for the home currency itself,
    /// the configured rate for a secondary, or nil when it isn't set up.
    static func rate(for code: String, home: String, currencies: [CurrencyRate]) -> Double? {
        if code == home { return 1 }
        return currencies.first { $0.code == code }?.rate
    }

    /// Convert an as-entered amount to normalized home cents.
    static func toHomeCents(_ amount: Double, rate: Double) -> Int {
        guard amount.isFinite, amount >= 0, rate.isFinite, rate > 0 else { return 0 }
        return jsRound(amount / rate * 100)
    }

    /// Parse a typed amount ("12.50", "", ".") into a non-negative number.
    static func parseAmount(_ display: String) -> Double {
        let clean = display.replacingOccurrences(of: ",", with: "")
        if clean.isEmpty || clean == "." { return 0 }
        guard let n = Double(clean), n.isFinite, n >= 0 else { return 0 }
        return n
    }

    /// Parse a typed exchange rate ("89500", "0.92"); nil unless positive.
    static func parseRate(_ display: String) -> Double? {
        guard let n = Double(display.replacingOccurrences(of: ",", with: "")),
              n.isFinite, n > 0 else { return nil }
        return n
    }

    /// Trim a derived rate to eight significant digits so it reads cleanly.
    static func tidyRate(_ rate: Double) -> Double {
        Double(String(format: "%.8g", rate)) ?? rate
    }

    /// Move the home currency to `next`. Stored amounts are NOT converted —
    /// the numbers stay and are read in the new currency. The rate list is
    /// re-based when `next` was a secondary; otherwise it's cleared.
    static func switchHome(_ settings: CurrencySettings, to next: String) -> CurrencySettings {
        if next == settings.homeCurrency { return settings }
        guard let pivot = settings.currencies.first(where: { $0.code == next }) else {
            return CurrencySettings(homeCurrency: next, currencies: [])
        }
        var rebased = [CurrencyRate(code: settings.homeCurrency, rate: tidyRate(1 / pivot.rate))]
        rebased += settings.currencies
            .filter { $0.code != next }
            .map { CurrencyRate(code: $0.code, rate: tidyRate($0.rate / pivot.rate)) }
        return CurrencySettings(homeCurrency: next, currencies: rebased)
    }

    /// The currency settings held in a profile row. Missing or junk values
    /// fall back to the defaults / are dropped rather than trusted.
    static func settings(home: String?, currencies raw: [CurrencyRate]?) -> CurrencySettings {
        let home = home.flatMap { isKnown($0) ? $0 : nil } ?? defaultHome
        guard let raw else { return CurrencySettings(homeCurrency: home, currencies: defaultSecondaries) }
        var seen: Set<String> = [home]
        var out: [CurrencyRate] = []
        for entry in raw where isKnown(entry.code) && !seen.contains(entry.code) && entry.rate > 0 {
            seen.insert(entry.code)
            out.append(entry)
        }
        return CurrencySettings(homeCurrency: home, currencies: out)
    }
}

/// JavaScript's Math.round: halves round toward +infinity.
func jsRound(_ x: Double) -> Int {
    guard x.isFinite else { return 0 }
    return Int((x + 0.5).rounded(.down))
}
