import XCTest
@testable import BucksBuddy

/// Money math, currencies, categories, dates, stats, history and export —
/// the same rules as the web app's src/lib/*.test.ts, on the Swift ports.
final class CoreTests: XCTestCase {
    private func local(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
        Dates.calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }

    private func tx(_ date: Date, cents: Int, category: String = "food", isIncome: Bool = false,
                    note: String? = nil, id: String = UUID().uuidString) -> Transaction {
        Transaction(id: id, userId: "u1", isIncome: isIncome, category: category, amountCents: cents,
                    originalCurrency: "USD", originalAmount: Double(cents) / 100, rateUsed: 1,
                    occurredAt: date, note: note, createdAt: date)
    }

    // MARK: Currency

    func testToHomeCents() {
        XCTAssertEqual(Currencies.toHomeCents(12.5, rate: 1), 1250)
        XCTAssertEqual(Currencies.toHomeCents(89_500, rate: 89_500), 100)
        XCTAssertEqual(Currencies.toHomeCents(10, rate: 0.92), 1087)
        XCTAssertEqual(Currencies.toHomeCents(-1, rate: 1), 0)
        XCTAssertEqual(Currencies.toHomeCents(1, rate: 0), 0)
    }

    func testParseAmount() {
        XCTAssertEqual(Currencies.parseAmount(""), 0)
        XCTAssertEqual(Currencies.parseAmount("."), 0)
        XCTAssertEqual(Currencies.parseAmount("12.50"), 12.5)
        XCTAssertEqual(Currencies.parseAmount("1,234.5"), 1234.5)
        XCTAssertNil(Currencies.parseRate("0"))
        XCTAssertEqual(Currencies.parseRate("0.92"), 0.92)
    }

    func testSwitchHomeRebasesRates() {
        let before = CurrencySettings(homeCurrency: "USD", currencies: [
            .init(code: "LBP", rate: 89_500), .init(code: "EUR", rate: 0.92),
        ])
        let after = Currencies.switchHome(before, to: "EUR")
        XCTAssertEqual(after.homeCurrency, "EUR")
        XCTAssertEqual(after.currencies.map(\.code), ["USD", "LBP"])
        XCTAssertEqual(after.currencies[0].rate, 1.0869565, accuracy: 1e-6)
        XCTAssertEqual(after.currencies[1].rate, 97_282.609, accuracy: 1e-2)

        let cleared = Currencies.switchHome(before, to: "GBP")
        XCTAssertEqual(cleared, CurrencySettings(homeCurrency: "GBP", currencies: []))
    }

    func testSettingsFromProfileDropJunk() {
        let s = Currencies.settings(home: "EUR", currencies: [
            .init(code: "EUR", rate: 1), .init(code: "XXX", rate: 2),
            .init(code: "LBP", rate: -1), .init(code: "USD", rate: 1.1), .init(code: "USD", rate: 9),
        ])
        XCTAssertEqual(s.homeCurrency, "EUR")
        XCTAssertEqual(s.currencies, [.init(code: "USD", rate: 1.1)])
        XCTAssertEqual(Currencies.settings(home: nil, currencies: nil).currencies, Currencies.defaultSecondaries)
        XCTAssertEqual(Currencies.settings(home: "ZZZ", currencies: []).homeCurrency, "USD")
    }

    // MARK: Money

    func testFormatting() {
        XCTAssertEqual(Money.format(1250, "USD"), "$12.50")
        XCTAssertEqual(Money.format(-1250, "EUR"), "€12.50")
        XCTAssertEqual(Money.format(8_950_000, "LBP"), "LL 89,500")
        XCTAssertEqual(Money.format(1250, "CHF"), "CHF 12.50")
        XCTAssertEqual(Money.format(1250, "USD", useCode: true), "USD 12.50")
        XCTAssertEqual(Money.formatSigned(-1250, "USD"), "-$12.50")
        XCTAssertEqual(Money.formatMasked("a8F2", "LBP"), "LL a8F2")
    }

    func testTypedAmountHelpers() {
        XCTAssertEqual(Money.sanitizeTyped("1a2.3.45"), "12.34")
        XCTAssertEqual(Money.sanitizeTyped("0.1234", decimals: 3), "0.123")
        XCTAssertEqual(Money.groupTyped("1234567.5"), "1,234,567.5")
        XCTAssertEqual(JSNumber.string(1250), "1250")
        XCTAssertEqual(JSNumber.string(12.5), "12.5")
    }

    func testJSRound() {
        XCTAssertEqual(jsRound(2.5), 3)
        XCTAssertEqual(jsRound(-2.5), -2)
        XCTAssertEqual(jsRound(1086.9565), 1087)
    }

    // MARK: Categories

    func testCategories() {
        XCTAssertEqual(Categories.label("food/restaurant"), "Food · Restaurant")
        XCTAssertEqual(Categories.label("salary"), "Salary")
        XCTAssertEqual(Categories.label("mystery"), "mystery")
        XCTAssertEqual(Categories.subLabel("health/lab"), "Lab/Tests")
        XCTAssertNil(Categories.subLabel("health"))
        XCTAssertEqual(Categories.compose("fees", "mobile"), "fees/mobile")
        XCTAssertEqual(Categories.compose("fees", nil), "fees")
        XCTAssertEqual(Categories.colorHex("groceries/bakery"), "#34C759")
        XCTAssertTrue(Categories.isSafe("safe"))
        // Stored ids must stay in step with the web app.
        XCTAssertEqual(Categories.expense.map(\.id), [
            "groceries", "food", "coffee", "gas", "parking", "transport", "shopping", "self_care", "gym",
            "health", "fees", "rent", "fun", "gifts", "tips", "work", "family", "other",
        ])
    }

    // MARK: Dates

    func testTimestampParsing() {
        let micro = Dates.parseTimestamp("2026-06-13T10:20:30.123456+00:00")!
        XCTAssertEqual(micro.timeIntervalSince1970, 1_781_346_030.123456, accuracy: 1e-5)
        XCTAssertEqual(Dates.parseTimestamp("2026-06-13T10:20:30Z")!.timeIntervalSince1970, 1_781_346_030)
        XCTAssertEqual(Dates.parseTimestamp("2026-06-13T12:20:30+02")!.timeIntervalSince1970, 1_781_346_030)
        XCTAssertNil(Dates.parseTimestamp("nope"))
    }

    func testMonthAnchorAndRanges() {
        let now = local(2026, 3, 15)
        let anchor = Dates.monthAnchor(-1, now: now)
        XCTAssertEqual(Dates.dayKey(anchor), "2026-02-28")
        let (from, to) = Dates.monthRange(now)
        XCTAssertEqual(Dates.dayKey(from), "2026-03-01")
        XCTAssertEqual(Dates.dayKey(to), "2026-04-01")
        XCTAssertEqual(Dates.dayLabel(local(2026, 3, 14), now: now), "Yesterday")
        XCTAssertEqual(Dates.dayLabel(local(2025, 3, 14), now: now), "Mar 14, 2025")
    }

    // MARK: Stats

    func testMonthInsights() {
        let now = local(2026, 6, 10)
        let rows = [
            tx(local(2026, 6, 6), cents: 1000, category: "fun"), // Saturday
            tx(local(2026, 6, 8), cents: 500, category: "coffee/cafe"),
            tx(local(2026, 6, 8), cents: 300, category: "coffee"),
            tx(local(2026, 6, 9), cents: 20_000, category: "safe"), // transfer, not spending
            tx(local(2026, 6, 9), cents: 5000, category: "salary", isIncome: true),
            tx(local(2026, 5, 20), cents: 9999), // last month
        ]
        let m = Stats.monthInsights(rows, now: now)
        XCTAssertEqual(m.spentCents, 1800)
        XCTAssertEqual(m.incomeCents, 5000)
        XCTAssertEqual(m.spendCount, 3)
        XCTAssertEqual(m.coffeeCount, 2)
        XCTAssertEqual(m.treatCents, 1000)
        XCTAssertEqual(m.weekendCents, 1000)
        XCTAssertEqual(m.biggestExpense?.amountCents, 1000)
        XCTAssertEqual(m.busiestDay?.count, 2)
        XCTAssertEqual(m.avgPerDayCents, 180)
        XCTAssertEqual(m.forecastCents, 5400)
        XCTAssertEqual(m.noSpendDays, 8)
    }

    func testTopCategoriesFoldSubcategories() {
        let now = local(2026, 6, 10)
        let rows = [
            tx(local(2026, 6, 1), cents: 500, category: "food/restaurant"),
            tx(local(2026, 6, 2), cents: 700, category: "food"),
            tx(local(2026, 6, 3), cents: 300, category: "gas"),
        ]
        let top = Stats.topCategories(rows, now: now)
        XCTAssertEqual(top.map(\.category), ["food", "gas"])
        XCTAssertEqual(top[0].totalCents, 1200)
        XCTAssertEqual(top[0].share, 0.8, accuracy: 1e-9)
    }

    func testMonthlyTotalsAndDailySeries() {
        let now = local(2026, 6, 10)
        let rows = [tx(local(2026, 6, 9), cents: 400), tx(local(2026, 4, 2), cents: 100)]
        let months = Stats.monthlySpendTotals(rows, months: 3, now: now)
        XCTAssertEqual(months.map(\.monthKey), ["2026-04", "2026-05", "2026-06"])
        XCTAssertEqual(months.map(\.totalCents), [100, 0, 400])
        XCTAssertEqual(months.map(\.offset), [-2, -1, 0])
        let daily = Stats.dailySpendSeries(rows, days: 30, now: now)
        XCTAssertEqual(daily.count, 30)
        XCTAssertEqual(daily.last?.key, "2026-06-10")
        XCTAssertEqual(daily[daily.count - 2].totalCents, 400)
    }

    // MARK: History

    func testTimelineRunsAndCategoryStacks() {
        let rows = [
            tx(local(2026, 6, 10, 9), cents: 100, category: "coffee", id: "a"),
            tx(local(2026, 6, 10, 10), cents: 200, category: "coffee", id: "b"),
            tx(local(2026, 6, 10, 11), cents: 300, category: "food", id: "c"),
            tx(local(2026, 6, 10, 12), cents: 400, category: "coffee", id: "d"),
            tx(local(2026, 6, 9, 12), cents: 1000, category: "salary", isIncome: true, id: "e"),
        ]
        let days = HistoryGrouping.byDay(rows, now: local(2026, 6, 10, 20))
        XCTAssertEqual(days.map(\.label), ["Today", "Yesterday"])
        XCTAssertEqual(days[0].groups.map { $0.rows.map(\.id) }, [["d"], ["c"], ["b", "a"]])
        XCTAssertEqual(days[0].totalCents, -1000)
        XCTAssertEqual(days[1].totalCents, 1000)

        let stacks = HistoryGrouping.byCategory(rows)
        XCTAssertEqual(stacks.map(\.key), ["false:coffee", "false:food", "true:salary"])
        XCTAssertEqual(stacks[0].count, 3)
        XCTAssertEqual(stacks[0].totalCents, -700)
    }

    // MARK: Export

    func testExportRanges() {
        let now = local(2026, 9, 8)
        let (from, to) = ExportRange.past3Months.bounds(now: now)!
        XCTAssertEqual(Dates.dayKey(from), "2026-06-01")
        XCTAssertEqual(Dates.dayKey(to), "2026-09-01")
        XCTAssertEqual(ExportRange.lastMonth.describe(now: now), "Last month · August 2026")
        XCTAssertEqual(ExportRange.lastMonth.filename(ext: "csv", now: now), "bucksbuddy-last-month-2026-09-08.csv")
        XCTAssertNil(ExportRange.allTime.bounds(now: now))
    }

    func testCSV() {
        var t = tx(Dates.parseTimestamp("2026-06-13T10:20:30Z")!, cents: 1250, category: "food/restaurant",
                   note: "Dinner, \"fancy\"")
        t.originalCurrency = "LBP"
        t.originalAmount = 1_118_750
        t.rateUsed = 89_500
        let csv = CSVExport.csv([t], homeCurrency: "USD").split(separator: "\n").map(String.init)
        XCTAssertEqual(csv[0], "date,type,category,subcategory,original_amount,original_currency,rate_used,amount_usd,note")
        XCTAssertEqual(csv[1], "2026-06-13T10:20:30.000Z,Out,Food,Restaurant,1118750,LBP,89500,12.50,\"Dinner, \"\"fancy\"\"\"")
    }
}
