import Foundation

// The review: this account's own spending, totalled on the device. Mirrors
// src/lib/reportPeriod.ts (the two windows) and src/lib/reportDigest.ts (the
// arithmetic), minus everything that only existed to feed a language model.
//
// Two windows rather than a date picker, both ending NOW:
//   RECENT    the 3 months before this one → now, clamped to the first entry
//   ALL TIME  the first entry → now
// "Recent" is a slice of "all time", so the screen reads the account once and
// builds both digests from the same rows.
//
// All amounts are home cents; formatting is the view's job. Anything
// money-valued is wrong while the device is locked (masked rows carry
// amountCents 0) — see `anyMasked`.
//
// `occurredAt` is stamped when an entry is LOGGED (the composer has no date
// picker), so the weekday split and the biggest-expense dates describe when
// things were typed. The screen says so.

// MARK: - Windows

enum ReviewPeriod: String, CaseIterable, Identifiable, Hashable, Sendable {
    case recent
    case allTime

    var id: String { rawValue }

    var label: String {
        switch self {
        case .recent: return "Recent months"
        case .allTime: return "All time"
        }
    }

    var blurb: String {
        switch self {
        case .recent: return "The 3 months before this one, against this one."
        case .allTime: return "Everything you have ever logged."
        }
    }

    /// How far back the recent window reaches, before clamping.
    static let recentMonths = 3

    /// The first of the month `recentMonths` back — the recent window's reach.
    static func recentReach(now: Date) -> Date {
        Dates.monthRange(Dates.addMonths(-recentMonths, to: now)).from
    }

    /// Half-open [from, to) bounds, clamped so a window never starts before the
    /// account did. Without a first entry, all time falls back to this month.
    func window(now: Date, firstEntryAt: Date?) -> ReviewWindow {
        switch self {
        case .allTime:
            return ReviewWindow(period: self, from: firstEntryAt ?? Dates.monthRange(now).from, to: now)
        case .recent:
            let reach = Self.recentReach(now: now)
            let from = firstEntryAt.map { max($0, reach) } ?? reach
            return ReviewWindow(period: self, from: from, to: now)
        }
    }

    /// The oldest entry's timestamp — where "all time" starts.
    static func firstEntry(_ rows: [Transaction]) -> Date? {
        rows.lazy.map(\.occurredAt).min()
    }
}

struct ReviewWindow: Hashable, Sendable {
    let period: ReviewPeriod
    let from: Date
    let to: Date

    /// "July 2026 – September 2026", or "September 2026".
    var label: String {
        let first = Dates.monthLabel(from)
        // `to` is exclusive: step back inside the window for its last month.
        let last = Dates.monthLabel(max(from, to.addingTimeInterval(-0.001)))
        return first == last ? first : "\(first) – \(last)"
    }
}

// MARK: - Digest

struct SpendingDigest: Sendable {
    struct Day: Identifiable, Hashable, Sendable {
        var id: String { key }
        let key: String // local "YYYY-MM-DD"
        let date: Date // local midnight
        let cents: Int
    }

    struct Month: Identifiable, Hashable, Sendable {
        var id: String { key }
        let key: String // "YYYY-MM"
        let start: Date
        let label: String // "September 2026"
        let shortLabel: String // "Sep"
        let spentCents: Int
        let incomeCents: Int
        var netCents: Int { incomeCents - spentCents }
        let spendCount: Int
        let daysLogged: Int
        /// How many of this month's days fall INSIDE the window.
        let days: Int
        /// Days in the calendar month.
        let daysInMonth: Int
        /// Spending over the window days, not the calendar length.
        let dailyAverageCents: Int
        var isWhole: Bool { days == daysInMonth }
    }

    struct CategoryShare: Identifiable, Hashable, Sendable {
        /// The stored id: a base ("food"), or "base/sub" for a subcategory.
        let id: String
        let base: String
        let label: String
        /// Zero-based, biggest first. Charts colour by this, never by category.
        let rank: Int
        let spentCents: Int
        let count: Int
        let sharePct: Double
        let averageEntryCents: Int
    }

    struct Weekday: Identifiable, Hashable, Sendable {
        var id: Int { index }
        /// 0 = Sunday … 6 = Saturday.
        let index: Int
        let label: String // "Sun"
        let spentCents: Int
        let count: Int
        let sharePct: Double
    }

    struct Expense: Identifiable, Hashable, Sendable {
        let id: String // transaction id
        let category: String // stored id
        let label: String // base category label
        let date: Date // when it was logged
        let amountCents: Int
    }

    enum Direction: String, Hashable, Sendable { case up, down, flat, new }

    /// A category's spend in the first WHOLE month of the window against the
    /// last whole one. A month still running is excluded rather than scaled:
    /// rent logged once is the same total in a 16-day month as a 30-day one.
    struct Change: Identifiable, Hashable, Sendable {
        let id: String // base category id
        let label: String
        let firstCents: Int
        let lastCents: Int
        /// Change in the month's total; nil when the first month spent nothing.
        let changePct: Double?
        let direction: Direction
    }

    /// The Safe is a transfer, not spending or income, so it's totalled apart.
    struct Saving: Hashable, Sendable {
        let intoSafeCents: Int
        let outOfSafeCents: Int
        /// Signed: negative when more came out than went in.
        var netIntoSafeCents: Int { intoSafeCents - outOfSafeCents }
        /// Net into the Safe over income — nil (not 0) with no income logged.
        let savedSharePct: Double?
        /// Income minus spending over income — what went unspent. Nil without income.
        let leftOverSharePct: Double?
        var isEmpty: Bool { intoSafeCents == 0 && outOfSafeCents == 0 }
    }

    struct BusiestDay: Hashable, Sendable {
        let date: Date
        let count: Int
        let cents: Int
    }

    struct Coverage: Hashable, Sendable {
        let days: Int
        let daysLogged: Int
        var daysWithNothingLogged: Int { days - daysLogged }
        let daysWithNoSpending: Int
        let coveragePct: Double
        let longestGapDays: Int
        let busiestDay: BusiestDay?
    }

    let window: ReviewWindow

    // Totals.
    let spentCents: Int
    let incomeCents: Int
    var netCents: Int { incomeCents - spentCents }
    let spendCount: Int
    let entryCount: Int
    /// Spending over every day in the window.
    let dailyAverageCents: Int
    /// Spending over only the days with something logged.
    let perLoggedDayAverageCents: Int
    let medianExpenseCents: Int
    let averageExpenseCents: Int

    let daily: [Day]
    let months: [Month]
    let categories: [CategoryShare]
    let subcategories: [CategoryShare]
    let saving: Saving
    let changes: [Change]
    /// Labels of the two whole months `changes` compares (nil when < 2).
    let changeMonths: (first: String, last: String)?
    let largestExpenses: [Expense]
    let weekdays: [Weekday]
    let weekendSharePct: Double
    let coverage: Coverage
    /// Some row in the window is obscured (locked device): money is a lie.
    let anyMasked: Bool

    var days: Int { coverage.days }
    var isEmpty: Bool { entryCount == 0 }

    static let topCategories = 10
    static let topExpenses = 5
    static let weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
}

extension SpendingDigest {
    // MARK: Build

    static func build(_ rows: [Transaction], window: ReviewWindow) -> SpendingDigest {
        let cal = Dates.calendar
        func dayKey(_ d: Date) -> String {
            let c = cal.dateComponents([.year, .month, .day], from: d)
            return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        }

        let inWindow = rows.filter { $0.occurredAt >= window.from && $0.occurredAt < window.to }
        let keyed: [(row: Transaction, day: String)] = inWindow.map { ($0, dayKey($0.occurredAt)) }
        let spending = inWindow.filter(Stats.isSpending)

        // --- totals, with the Safe kept out of both sides ---
        var spent = 0, income = 0, intoSafe = 0, outOfSafe = 0
        for r in inWindow {
            if Categories.isSafe(r.category) {
                if r.isIncome { outOfSafe += r.amountCents } else { intoSafe += r.amountCents }
            } else if r.isIncome {
                income += r.amountCents
            } else {
                spent += r.amountCents
            }
        }

        // --- every local day the window touches, from the midnight of its first ---
        var dayKeys: [String] = []
        var dayDates: [Date] = []
        var cursor = cal.startOfDay(for: window.from)
        while cursor < window.to {
            dayKeys.append(dayKey(cursor))
            dayDates.append(cursor)
            guard let next = cal.date(byAdding: .day, value: 1, to: cursor) else { break }
            cursor = next
        }

        let loggedDays = Set(keyed.map { $0.day })
        var spendByDay: [String: (count: Int, cents: Int)] = [:]
        for (r, k) in keyed where Stats.isSpending(r) {
            spendByDay[k, default: (count: 0, cents: 0)].count += 1
            spendByDay[k, default: (count: 0, cents: 0)].cents += r.amountCents
        }

        let daily = zip(dayKeys, dayDates).map { key, date in
            Day(key: key, date: date, cents: spendByDay[key]?.cents ?? 0)
        }

        var busiest: BusiestDay?
        for (key, date) in zip(dayKeys, dayDates) {
            guard let stat = spendByDay[key] else { continue }
            if let b = busiest, (stat.count, stat.cents) <= (b.count, b.cents) { continue }
            busiest = BusiestDay(date: date, count: stat.count, cents: stat.cents)
        }

        // --- months, derived from the window's days so the two never disagree ---
        var monthOrder: [String] = []
        var monthWindowDays: [String: Int] = [:]
        var monthStart: [String: Date] = [:]
        for (key, date) in zip(dayKeys, dayDates) {
            let mk = String(key.prefix(7))
            if monthWindowDays[mk] == nil {
                monthOrder.append(mk)
                monthStart[mk] = cal.date(from: cal.dateComponents([.year, .month], from: date)) ?? date
            }
            monthWindowDays[mk, default: 0] += 1
        }

        var mSpent: [String: Int] = [:]
        var mIncome: [String: Int] = [:]
        var mCount: [String: Int] = [:]
        var mLogged: [String: Set<String>] = [:]
        var mByCategory: [String: [String: Int]] = [:]
        for (r, k) in keyed {
            let mk = String(k.prefix(7))
            mLogged[mk, default: []].insert(k)
            if Stats.isSpending(r) {
                mSpent[mk, default: 0] += r.amountCents
                mCount[mk, default: 0] += 1
                mByCategory[mk, default: [:]][Categories.split(r.category).base, default: 0] += r.amountCents
            } else if r.isIncome && !Categories.isSafe(r.category) {
                mIncome[mk, default: 0] += r.amountCents
            }
        }

        let months: [Month] = monthOrder.map { mk in
            let start = monthStart[mk] ?? window.from
            let windowDays = monthWindowDays[mk] ?? 0
            let monthSpent = mSpent[mk] ?? 0
            return Month(
                key: mk,
                start: start,
                label: Dates.monthLabel(start),
                shortLabel: Dates.shortMonthFormatter.string(from: start),
                spentCents: monthSpent,
                incomeCents: mIncome[mk] ?? 0,
                spendCount: mCount[mk] ?? 0,
                daysLogged: mLogged[mk]?.count ?? 0,
                days: windowDays,
                daysInMonth: cal.range(of: .day, in: .month, for: start)?.count ?? windowDays,
                dailyAverageCents: divide(monthSpent, windowDays)
            )
        }

        // --- categories, subcategories, weekdays ---
        var byCategory: [String: (cents: Int, count: Int)] = [:]
        var bySubcategory: [String: (cents: Int, count: Int)] = [:]
        var byWeekday = Array(repeating: (cents: 0, count: 0), count: 7)
        var weekendCents = 0
        for r in spending {
            let (base, sub) = Categories.split(r.category)
            byCategory[base, default: (cents: 0, count: 0)].cents += r.amountCents
            byCategory[base, default: (cents: 0, count: 0)].count += 1
            if let sub, !sub.isEmpty {
                let id = Categories.compose(base, sub)
                bySubcategory[id, default: (cents: 0, count: 0)].cents += r.amountCents
                bySubcategory[id, default: (cents: 0, count: 0)].count += 1
            }
            let wd = cal.component(.weekday, from: r.occurredAt) - 1 // 0 = Sunday
            if byWeekday.indices.contains(wd) {
                byWeekday[wd].cents += r.amountCents
                byWeekday[wd].count += 1
            }
            if wd == 0 || wd == 6 { weekendCents += r.amountCents }
        }

        let spentTotal = spent
        func shares(_ stats: [String: (cents: Int, count: Int)]) -> [CategoryShare] {
            let ranked = stats.sorted {
                ($0.value.cents, $0.value.count, $1.key) > ($1.value.cents, $1.value.count, $0.key)
            }
            return ranked.prefix(topCategories).enumerated().map { item in
                let (id, stat) = item.element
                let base = Categories.split(id).base
                return CategoryShare(
                    id: id,
                    base: base,
                    label: Categories.label(id),
                    rank: item.offset,
                    spentCents: stat.cents,
                    count: stat.count,
                    sharePct: pct(stat.cents, spentTotal),
                    averageEntryCents: divide(stat.cents, stat.count)
                )
            }
        }

        let weekdays = byWeekday.enumerated().map { item in
            Weekday(
                index: item.offset,
                label: weekdayLabels[item.offset],
                spentCents: item.element.cents,
                count: item.element.count,
                sharePct: pct(item.element.cents, spentTotal)
            )
        }

        // --- the biggest single expenses ---
        let largest = spending
            .sorted { ($0.amountCents, $0.occurredAt) > ($1.amountCents, $1.occurredAt) }
            .prefix(topExpenses)
            .map { r in
                Expense(id: r.id, category: r.category,
                        label: Categories.label(Categories.split(r.category).base),
                        date: r.occurredAt, amountCents: r.amountCents)
            }

        // --- first whole month against the last whole one ---
        var changes: [Change] = []
        var changeMonths: (first: String, last: String)?
        let whole = months.filter(\.isWhole)
        if whole.count > 1, let first = whole.first, let last = whole.last {
            changeMonths = (first.label, last.label)
            let firstByCat = mByCategory[first.key] ?? [:]
            let lastByCat = mByCategory[last.key] ?? [:]
            for id in Set(firstByCat.keys).union(lastByCat.keys) {
                let a = firstByCat[id] ?? 0
                let b = lastByCat[id] ?? 0
                let direction: Direction = a == 0 ? .new : b == a ? .flat : b > a ? .up : .down
                changes.append(Change(
                    id: id,
                    label: Categories.label(id),
                    firstCents: a,
                    lastCents: b,
                    changePct: a == 0 ? nil : pct(b - a, a),
                    direction: direction
                ))
            }
            changes.sort { ($0.lastCents, $0.firstCents, $1.id) > ($1.lastCents, $1.firstCents, $0.id) }
        }

        let amounts = spending.map(\.amountCents)
        let coverage = Coverage(
            days: dayKeys.count,
            daysLogged: loggedDays.count,
            daysWithNoSpending: dayKeys.count - spendByDay.count,
            coveragePct: pct(loggedDays.count, dayKeys.count),
            longestGapDays: longestRun(dayKeys) { !loggedDays.contains($0) },
            busiestDay: busiest
        )

        return SpendingDigest(
            window: window,
            spentCents: spent,
            incomeCents: income,
            spendCount: spending.count,
            entryCount: inWindow.count,
            dailyAverageCents: divide(spent, dayKeys.count),
            perLoggedDayAverageCents: divide(spent, loggedDays.count),
            medianExpenseCents: median(amounts),
            averageExpenseCents: divide(spent, spending.count),
            daily: daily,
            months: months,
            categories: shares(byCategory),
            subcategories: shares(bySubcategory),
            saving: Saving(
                intoSafeCents: intoSafe,
                outOfSafeCents: outOfSafe,
                savedSharePct: share(intoSafe - outOfSafe, income),
                leftOverSharePct: share(income - spent, income)
            ),
            changes: changes,
            changeMonths: changeMonths,
            largestExpenses: Array(largest),
            weekdays: weekdays,
            weekendSharePct: pct(weekendCents, spent),
            coverage: coverage,
            anyMasked: inWindow.contains(where: \.isMasked)
        )
    }

    // MARK: Arithmetic (JS rounding, to match the web figures)

    /// A percentage to one decimal; 0 without a denominator.
    static func pct(_ part: Int, _ whole: Int) -> Double {
        whole == 0 ? 0 : Double(jsRound(Double(part) / Double(whole) * 1000)) / 10
    }

    /// A share that refuses to exist without a denominator.
    static func share(_ part: Int, _ whole: Int) -> Double? {
        whole == 0 ? nil : pct(part, whole)
    }

    static func divide(_ total: Int, _ by: Int) -> Int {
        by == 0 ? 0 : jsRound(Double(total) / Double(by))
    }

    static func median(_ values: [Int]) -> Int {
        guard !values.isEmpty else { return 0 }
        let sorted = values.sorted()
        let mid = sorted.count / 2
        return sorted.count % 2 == 1 ? sorted[mid] : jsRound(Double(sorted[mid - 1] + sorted[mid]) / 2)
    }

    /// The longest run of consecutive elements that `missing` accepts.
    static func longestRun(_ days: [String], _ missing: (String) -> Bool) -> Int {
        var longest = 0, run = 0
        for day in days {
            run = missing(day) ? run + 1 : 0
            longest = max(longest, run)
        }
        return longest
    }
}
