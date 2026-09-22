import Foundation

// Aggregations for the Stats page. Pure functions over the decrypted
// transactions. Anything money-valued is wrong while the device is locked
// (masked rows carry amountCents 0), so callers check `anyMasked` / the
// store's `locked` first. Mirrors src/lib/stats.ts.

enum Stats {
    /// How many rows the store fetches per table, newest first. Exposed so
    /// the daily series can tell "no spending that day" apart from "older than
    /// what we fetched".
    static let fetchCap = 500

    /// Spending = money OUT that isn't an internal transfer to the Safe.
    static func isSpending(_ t: Transaction) -> Bool {
        !t.isIncome && !Categories.isSafe(t.category)
    }

    struct DayPoint: Identifiable, Hashable {
        var id: String { key }
        let key: String // local "YYYY-MM-DD"
        let date: Date // local start of day
        var totalCents: Int = 0
        var count: Int = 0
    }

    private static func denseSeries(_ rows: [Transaction], from: Date, through last: Date) -> [DayPoint] {
        var series: [DayPoint] = []
        var index: [String: Int] = [:]
        var d = Dates.startOfDay(from)
        while d <= last {
            let key = Dates.dayKey(d)
            index[key] = series.count
            series.append(DayPoint(key: key, date: d))
            d = Dates.addDays(1, to: d)
        }
        for r in rows where isSpending(r) {
            guard let i = index[Dates.dayKey(r.occurredAt)] else { continue }
            series[i].totalCents += r.amountCents
            series[i].count += 1
        }
        return series
    }

    /// Per-day spending for the `days` days ending today, oldest first, quiet
    /// days zero-filled. When the fetch cap was hit, the window is clamped to
    /// the oldest row we actually have.
    static func dailySpendSeries(_ rows: [Transaction], days: Int, now: Date = Date()) -> [DayPoint] {
        var from = Dates.addDays(-(days - 1), to: Dates.startOfDay(now))
        if rows.count >= fetchCap, let oldest = rows.map(\.occurredAt).min() {
            let oldestDay = Dates.startOfDay(oldest)
            if oldestDay > from { from = oldestDay }
        }
        return denseSeries(rows, from: from, through: now)
    }

    /// Per-day spending for the whole calendar month containing `anchor`.
    static func monthSpendSeries(_ rows: [Transaction], anchor: Date = Date()) -> [DayPoint] {
        let (from, to) = Dates.monthRange(anchor)
        return denseSeries(rows, from: from, through: to.addingTimeInterval(-1))
    }

    struct MonthSpend: Identifiable, Hashable {
        var id: String { monthKey }
        let monthKey: String
        let label: String // "Jun"
        let start: Date
        var totalCents: Int
        let offset: Int // months back from now (0 = current)
        var isCurrent: Bool { offset == 0 }
    }

    /// Total spending per calendar month for the `months` months ending with
    /// the current one, oldest first.
    static func monthlySpendTotals(_ rows: [Transaction], months: Int = 6, now: Date = Date()) -> [MonthSpend] {
        var series: [MonthSpend] = []
        var index: [String: Int] = [:]
        for back in stride(from: months - 1, through: 0, by: -1) {
            let start = Dates.monthRange(Dates.addMonths(-back, to: Dates.monthRange(now).from)).from
            let key = Dates.monthKey(start)
            index[key] = series.count
            series.append(MonthSpend(monthKey: key, label: Dates.shortMonthFormatter.string(from: start),
                                     start: start, totalCents: 0, offset: -back))
        }
        for r in rows where isSpending(r) {
            if let i = index[Dates.monthKey(r.occurredAt)] { series[i].totalCents += r.amountCents }
        }
        return series
    }

    struct CategoryStat: Identifiable, Hashable {
        var id: String { category }
        let category: String // base id
        var totalCents: Int
        var count: Int
        var share: Double
    }

    /// The month's spending grouped by base category, biggest first (ties and
    /// the locked case fall back to entry count).
    static func topCategories(_ rows: [Transaction], limit: Int = 6, now: Date = Date()) -> [CategoryStat] {
        let (from, to) = Dates.monthRange(now)
        var byCategory: [String: CategoryStat] = [:]
        var monthCents = 0
        for r in rows where isSpending(r) && r.occurredAt >= from && r.occurredAt < to {
            let base = Categories.split(r.category).base
            var stat = byCategory[base] ?? CategoryStat(category: base, totalCents: 0, count: 0, share: 0)
            stat.totalCents += r.amountCents
            stat.count += 1
            byCategory[base] = stat
            monthCents += r.amountCents
        }
        var sorted = byCategory.values.sorted {
            ($0.totalCents, $0.count, $1.category) > ($1.totalCents, $1.count, $0.category)
        }
        for i in sorted.indices {
            sorted[i].share = Double(sorted[i].totalCents) / Double(max(monthCents, 1))
        }
        return Array(sorted.prefix(limit))
    }

    /// "Treat yourself" categories: the want-not-need bases.
    static let treatBases: Set<String> = ["fun", "shopping", "self_care"]

    private static func isWeekend(_ d: Date) -> Bool {
        let wd = Dates.calendar.component(.weekday, from: d) // 1 = Sunday
        return wd == 1 || wd == 7
    }

    private static func monthSpending(_ rows: [Transaction], now: Date, keep: (Transaction) -> Bool) -> [Transaction] {
        let (from, to) = Dates.monthRange(now)
        return rows
            .filter { isSpending($0) && $0.occurredAt >= from && $0.occurredAt < to && keep($0) }
            .sorted { $0.occurredAt > $1.occurredAt }
    }

    static func treatTransactions(_ rows: [Transaction], now: Date = Date()) -> [Transaction] {
        monthSpending(rows, now: now) { treatBases.contains(Categories.split($0.category).base) }
    }

    static func weekendTransactions(_ rows: [Transaction], now: Date = Date()) -> [Transaction] {
        monthSpending(rows, now: now) { isWeekend($0.occurredAt) }
    }

    struct DayStat: Hashable {
        let key: String
        let date: Date
        var count: Int
        var totalCents: Int
    }

    struct MonthInsights {
        var spentCents = 0
        var incomeCents = 0
        var spendCount = 0
        var avgPerDayCents = 0
        var forecastCents = 0
        var biggestExpense: Transaction?
        var busiestDay: DayStat?
        var noSpendDays = 0
        var coffeeCount = 0
        var treatCents = 0
        var weekendCents = 0
        var anyMasked = false
    }

    /// Fun-fact material for the month containing `now`.
    static func monthInsights(_ rows: [Transaction], now: Date = Date()) -> MonthInsights {
        let (from, to) = Dates.monthRange(now)
        let daysElapsed = Dates.calendar.component(.day, from: now)
        let daysInMonth = Dates.daysInMonth(now)
        var m = MonthInsights()
        var byDay: [String: DayStat] = [:]

        for r in rows where r.occurredAt >= from && r.occurredAt < to {
            if r.isMasked { m.anyMasked = true }
            let base = Categories.split(r.category).base
            guard isSpending(r) else {
                // Money IN — but pulling cash back out of the Safe isn't income.
                if r.isIncome && base != Categories.safeId { m.incomeCents += r.amountCents }
                continue
            }
            m.spentCents += r.amountCents
            m.spendCount += 1
            if base == "coffee" { m.coffeeCount += 1 }
            if treatBases.contains(base) { m.treatCents += r.amountCents }
            if m.biggestExpense == nil || r.amountCents > m.biggestExpense!.amountCents {
                m.biggestExpense = r
            }
            let key = Dates.dayKey(r.occurredAt)
            var stat = byDay[key] ?? DayStat(key: key, date: Dates.startOfDay(r.occurredAt), count: 0, totalCents: 0)
            stat.count += 1
            stat.totalCents += r.amountCents
            byDay[key] = stat
            if isWeekend(r.occurredAt) { m.weekendCents += r.amountCents }
        }

        m.busiestDay = byDay.values.sorted { ($0.count, $1.key) > ($1.count, $0.key) }.first
        m.avgPerDayCents = jsRound(Double(m.spentCents) / Double(daysElapsed))
        m.forecastCents = jsRound(Double(m.spentCents) / Double(daysElapsed) * Double(daysInMonth))
        m.noSpendDays = max(daysElapsed - byDay.count, 0)
        return m
    }
}
