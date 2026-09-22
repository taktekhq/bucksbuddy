import Foundation

// The export: date windows (whole calendar months) and the CSV itself.
// Mirrors src/lib/exportRange.ts and src/lib/csv.ts so a file exported from
// the phone reads the same as one from the web.

enum ExportRange: String, CaseIterable, Identifiable {
    case thisMonth = "this_month"
    case lastMonth = "last_month"
    case past3Months = "past_3_months"
    case allTime = "all_time"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .thisMonth: "This month"
        case .lastMonth: "Last month"
        case .past3Months: "Past 3 months"
        case .allTime: "All time"
        }
    }

    var slug: String {
        switch self {
        case .thisMonth: "this-month"
        case .lastMonth: "last-month"
        case .past3Months: "past-3-months"
        case .allTime: "all-time"
        }
    }

    /// Half-open [from, to) bounds, or nil for all time.
    func bounds(now: Date = Date()) -> (from: Date, to: Date)? {
        switch self {
        case .allTime: return nil
        case .thisMonth: return Dates.monthRange(now)
        case .lastMonth: return Dates.monthRange(Dates.monthAnchor(-1, now: now))
        case .past3Months:
            // Three whole months ending with last month; this partial month
            // is deliberately not part of it.
            return (Dates.monthRange(Dates.monthAnchor(-3, now: now)).from,
                    Dates.monthRange(Dates.monthAnchor(-1, now: now)).to)
        }
    }

    /// "Last month · August 2026".
    func describe(now: Date = Date()) -> String {
        switch self {
        case .allTime: return label
        case .past3Months:
            return "\(label) · \(Dates.monthLabel(Dates.monthAnchor(-3, now: now))) – \(Dates.monthLabel(Dates.monthAnchor(-1, now: now)))"
        case .thisMonth: return "\(label) · \(Dates.monthLabel(now))"
        case .lastMonth: return "\(label) · \(Dates.monthLabel(Dates.monthAnchor(-1, now: now)))"
        }
    }

    func filter(_ rows: [Transaction], now: Date = Date()) -> [Transaction] {
        guard let (from, to) = bounds(now: now) else { return rows }
        return rows.filter { $0.occurredAt >= from && $0.occurredAt < to }
    }

    /// "bucksbuddy-last-month-2026-09-08.csv"
    func filename(ext: String, now: Date = Date()) -> String {
        "bucksbuddy-\(slug)-\(Dates.dayKey(now)).\(ext)"
    }
}

enum CSVExport {
    private static func escape(_ value: String) -> String {
        if value.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" }) {
            return "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
        }
        return value
    }

    /// The rows as CSV. The normalized column is named for the home currency
    /// ("amount_usd", "amount_eur"); `rate_used` is units of the original
    /// currency per 1 of home at the time of entry.
    static func csv(_ rows: [Transaction], homeCurrency: String) -> String {
        let header = ["date", "type", "category", "subcategory", "original_amount",
                      "original_currency", "rate_used", "amount_\(homeCurrency.lowercased())", "note"]
        let lines = rows.map { r in
            [
                Dates.isoString(r.occurredAt),
                r.isIncome ? "In" : "Out",
                Categories.label(Categories.split(r.category).base),
                Categories.subLabel(r.category) ?? "",
                JSNumber.string(r.originalAmount),
                r.originalCurrency,
                JSNumber.string(r.rateUsed),
                String(format: "%.2f", Double(r.amountCents) / 100),
                r.note ?? "",
            ].map(escape).joined(separator: ",")
        }
        return ([header.joined(separator: ",")] + lines).joined(separator: "\n")
    }
}

/// JavaScript's `String(n)` for the numbers this app stores: integers print
/// without a fraction ("1250", not "1250.0"), others in their shortest form
/// ("12.5"). This matters beyond looks — encrypted amounts are the encrypted
/// *string*, and the web app parses it back with `Number()`.
enum JSNumber {
    static func string(_ n: Double) -> String {
        guard n.isFinite else { return "0" }
        if n == n.rounded(), abs(n) < 1e15 { return String(Int64(n)) }
        return "\(n)"
    }
}
