import Foundation

// Local-calendar helpers. Everything groups by the user's LOCAL day/month, so
// a late-night entry lands on the day it was actually made. Mirrors
// src/lib/dates.ts.

enum Dates {
    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }

    /// [first of the month, first of next month) containing `date`.
    static func monthRange(_ date: Date = Date()) -> (from: Date, to: Date) {
        let cal = calendar
        let comps = cal.dateComponents([.year, .month], from: date)
        let from = cal.date(from: comps)!
        let to = cal.date(byAdding: .month, value: 1, to: from)!
        return (from, to)
    }

    static func startOfDay(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    static func addDays(_ n: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: n, to: date)!
    }

    static func addMonths(_ n: Int, to date: Date) -> Date {
        calendar.date(byAdding: .month, value: n, to: date)!
    }

    /// A date that anchors month-scoped stats `offset` months back from `now`
    /// (0 = now itself; past months anchor at noon on their last day, so the
    /// whole month counts as elapsed).
    static func monthAnchor(_ offset: Int, now: Date = Date()) -> Date {
        if offset == 0 { return now }
        let firstOfTarget = monthRange(addMonths(offset, to: now)).from
        let lastDay = addDays(-1, to: addMonths(1, to: firstOfTarget))
        return calendar.date(bySettingHour: 12, minute: 0, second: 0, of: lastDay)!
    }

    static func isSameDay(_ a: Date, _ b: Date) -> Bool { calendar.isDate(a, inSameDayAs: b) }

    static func isToday(_ date: Date, now: Date = Date()) -> Bool { isSameDay(date, now) }

    static func daysInMonth(_ date: Date) -> Int {
        calendar.range(of: .day, in: .month, for: date)!.count
    }

    /// "2026-06-13", local.
    static func dayKey(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// "2026-06", local.
    static func monthKey(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", c.year!, c.month!)
    }

    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = .current
        f.dateFormat = format
        return f
    }

    static let monthYearFormatter = formatter("MMMM yyyy")
    static let shortMonthFormatter = formatter("MMM")
    static let shortDayFormatter = formatter("MMM d")
    static let shortDayYearFormatter = formatter("MMM d, yyyy")
    static let weekdayDayFormatter = formatter("EEE, MMM d")
    static let timeFormatter = formatter("h:mm a")

    /// "June 2026".
    static func monthLabel(_ date: Date = Date()) -> String { monthYearFormatter.string(from: date) }

    /// "Today" / "Yesterday" / "Jun 12" / "Jun 12, 2025".
    static func dayLabel(_ date: Date, now: Date = Date()) -> String {
        if isToday(date, now: now) { return "Today" }
        if isSameDay(date, addDays(-1, to: now)) { return "Yesterday" }
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        return (sameYear ? shortDayFormatter : shortDayYearFormatter).string(from: date)
    }

    static func shortDay(_ date: Date) -> String { shortDayFormatter.string(from: date) }

    // MARK: Postgres timestamps

    /// Parse a Postgres `timestamptz` as PostgREST returns it
    /// ("2026-06-13T10:20:30.123456+00:00", fraction optional, "Z" allowed).
    /// ISO8601DateFormatter chokes on microseconds, so the fraction is
    /// peeled off and added back by hand.
    static func parseTimestamp(_ s: String) -> Date? {
        var main = s
        var fraction: Double = 0
        if let dot = s.firstIndex(of: ".") {
            var end = s.index(after: dot)
            while end < s.endIndex, s[end].isNumber { end = s.index(after: end) }
            fraction = Double("0" + s[dot..<end]) ?? 0
            main = String(s[..<dot]) + String(s[end...])
        }
        if main.hasSuffix("Z") == false, main.count >= 3 {
            // "+00" → "+00:00" (Postgres may shorten the offset).
            let tail = main.suffix(3)
            if (tail.first == "+" || tail.first == "-"), tail.dropFirst().allSatisfy(\.isNumber) {
                main += ":00"
            }
        }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: main) { return d.addingTimeInterval(fraction) }
        // Timestamps without an offset: treat as UTC.
        if let d = f.date(from: main + "Z") { return d.addingTimeInterval(fraction) }
        return nil
    }

    /// ISO-8601 with milliseconds, UTC — what the web app's `toISOString` sends.
    static func isoString(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}
