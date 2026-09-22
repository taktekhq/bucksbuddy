import Foundation

// Display helpers. Every money string in the UI comes from here so the look
// stays consistent (see docs/DESIGN_SYSTEM.md). Amounts are integer "cents"
// (hundredths) of the user's home currency; the formatters take the currency
// code so a EUR home reads "€12.50" and an LBP home "LL 89,500".
// Mirrors src/lib/money.ts.

enum Money {
    private static var formatters: [Int: NumberFormatter] = [:]
    private static let lock = NSLock()

    static func numberFormatter(decimals: Int) -> NumberFormatter {
        lock.lock()
        defer { lock.unlock() }
        if let f = formatters[decimals] { return f }
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        f.roundingMode = .halfUp
        formatters[decimals] = f
        return f
    }

    /// "$12.50" and "€12.50" but "LL 89,500" and "CHF 12.50": a symbol made of
    /// letters gets a space so it doesn't run into the number.
    static func prefix(for symbol: String) -> String {
        symbol.allSatisfy(\.isLetter) ? "\(symbol) " : symbol
    }

    /// The currency's symbol as it goes in front of a number: "$", "€", "LL ".
    static func symbolPrefix(_ currency: String) -> String {
        prefix(for: Currencies.info(currency).symbol)
    }

    /// Format home cents as "$12.50" / "€12.50" / "LL 89,500" (no sign).
    static func format(_ cents: Int, _ currency: String, useCode: Bool = false) -> String {
        let info = Currencies.info(currency)
        let p = useCode ? "\(info.code) " : prefix(for: info.symbol)
        let n = numberFormatter(decimals: info.decimals)
            .string(from: NSNumber(value: Double(abs(cents)) / 100)) ?? "0"
        return p + n
    }

    /// "$87.50" (positive) / "-$12.50" (negative).
    static func formatSigned(_ cents: Int, _ currency: String, useCode: Bool = false) -> String {
        (cents < 0 ? "-" : "") + format(cents, currency, useCode: useCode)
    }

    /// An obscured amount for a locked device: "$•••••", "LL a8F2".
    static func formatMasked(_ mask: String, _ currency: String) -> String {
        symbolPrefix(currency) + mask
    }

    /// An as-typed amount in its own currency: "890,000 LBP" style digits.
    static func formatPlain(_ amount: Double, decimals: Int) -> String {
        numberFormatter(decimals: decimals).string(from: NSNumber(value: amount)) ?? "\(amount)"
    }

    /// Group the integer part of a typed amount: "1234.5" → "1,234.5".
    static func groupTyped(_ s: String) -> String {
        let parts = s.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        let intPart = String(parts.first ?? "")
        var grouped = ""
        for (i, ch) in intPart.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { grouped.append(",") }
            grouped.append(ch)
        }
        grouped = String(grouped.reversed())
        return parts.count > 1 ? "\(grouped).\(parts[1])" : grouped
    }

    /// Keep a typed amount clean: digits, a single dot, at most `decimals`
    /// fraction digits.
    static func sanitizeTyped(_ raw: String, decimals: Int = 2) -> String {
        var v = raw.filter { $0.isASCII && ($0.isNumber || $0 == ".") }
        if let dot = v.firstIndex(of: ".") {
            let head = v[...dot]
            let tail = v[v.index(after: dot)...].filter { $0 != "." }.prefix(decimals)
            v = String(head) + String(tail)
        }
        return v
    }
}

enum Gold {
    static let troyOunceInGrams = 31.1034768

    private static let gramsFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "en_US")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 3
        return f
    }()

    /// "5 g", "2.5 g", "0.125 g".
    static func format(_ grams: Double) -> String {
        "\(gramsFormatter.string(from: NSNumber(value: grams)) ?? "0") g"
    }

    /// Best-effort live gold price in USD per gram, or nil. api.gold-api.com
    /// is keyless; its price is USD per troy ounce. Grams stay the source of
    /// truth either way.
    static func fetchUSDPerGram() async -> Double? {
        guard let url = URL(string: "https://api.gold-api.com/price/XAU") else { return nil }
        var req = URLRequest(url: url)
        req.timeoutInterval = 8
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            struct Price: Decodable { let price: Double? }
            guard let perOunce = try JSONDecoder().decode(Price.self, from: data).price,
                  perOunce.isFinite, perOunce > 0 else { return nil }
            return perOunce / troyOunceInGrams
        } catch {
            return nil
        }
    }
}
