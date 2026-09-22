import XCTest
@testable import BucksBuddy

// The review's windows and digest math (Core/ReviewDigest.swift). Mirrors the
// intent of src/lib/reportPeriod.ts and src/lib/reportDigest.ts.

/// A local date; `month` is 1-based.
private func at(_ y: Int, _ month: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0) -> Date {
    guard let date = Dates.calendar.date(from: DateComponents(year: y, month: month, day: d, hour: h, minute: min)) else {
        fatalError("bad fixture date \(y)-\(month)-\(d)")
    }
    return date
}

private func tx(
    _ day: Date,
    _ cents: Int,
    _ category: String = "food",
    isIncome: Bool = false
) -> Transaction {
    Transaction(
        id: UUID().uuidString,
        userId: "u1",
        isIncome: isIncome,
        category: category,
        amountCents: cents,
        originalCurrency: "USD",
        originalAmount: Double(cents) / 100,
        rateUsed: 1,
        occurredAt: day,
        note: nil,
        createdAt: day,
        amountMask: nil
    )
}

// Tuesday, September 22, 2026, noon.
private let NOW = at(2026, 9, 22)

final class ReviewDigestTests: XCTestCase {
    // MARK: Windows

    func testRecentReachesThreeMonthsBackToTheFirstOfTheMonth() {
        let w = ReviewPeriod.recent.window(now: NOW, firstEntryAt: at(2025, 1, 5))
        XCTAssertEqual(w.from, at(2026, 6, 1, 0))
        XCTAssertEqual(w.to, NOW)
        XCTAssertEqual(w.label, "June 2026 – September 2026")
    }

    func testRecentIsClampedToAYoungAccountsFirstEntry() {
        let first = at(2026, 8, 10, 9, 30)
        let w = ReviewPeriod.recent.window(now: NOW, firstEntryAt: first)
        XCTAssertEqual(w.from, first)
    }

    func testAllTimeStartsAtTheFirstEntryOrThisMonth() {
        let first = at(2024, 3, 3)
        XCTAssertEqual(ReviewPeriod.allTime.window(now: NOW, firstEntryAt: first).from, first)
        XCTAssertEqual(ReviewPeriod.allTime.window(now: NOW, firstEntryAt: nil).from, at(2026, 9, 1, 0))
    }

    func testFirstEntryIsTheOldestRow() {
        let rows = [tx(at(2026, 9, 1), 100), tx(at(2026, 7, 4), 100), tx(at(2026, 8, 1), 100)]
        XCTAssertEqual(ReviewPeriod.firstEntry(rows), at(2026, 7, 4))
        XCTAssertNil(ReviewPeriod.firstEntry([]))
    }

    // MARK: Totals and the Safe

    func testTotalsKeepTheSafeOutOfSpendingAndIncome() {
        let rows = [
            tx(at(2026, 9, 2), 1000, "food"),
            tx(at(2026, 9, 3), 500, "coffee"),
            tx(at(2026, 9, 4), 10000, "salary", isIncome: true),
            tx(at(2026, 9, 5), 3000, Categories.safeId), // into the Safe
            tx(at(2026, 9, 6), 1000, Categories.safeId, isIncome: true), // back out
            tx(at(2026, 5, 1), 9999, "food"), // before the window
        ]
        let w = ReviewPeriod.recent.window(now: NOW, firstEntryAt: at(2026, 9, 1, 0))
        let d = SpendingDigest.build(rows, window: w)

        XCTAssertEqual(d.spentCents, 1500)
        XCTAssertEqual(d.incomeCents, 10000)
        XCTAssertEqual(d.netCents, 8500)
        XCTAssertEqual(d.spendCount, 2)
        XCTAssertEqual(d.entryCount, 5)
        XCTAssertEqual(d.saving.intoSafeCents, 3000)
        XCTAssertEqual(d.saving.outOfSafeCents, 1000)
        XCTAssertEqual(d.saving.netIntoSafeCents, 2000)
        XCTAssertEqual(d.saving.savedSharePct, 20)
        XCTAssertEqual(d.saving.leftOverSharePct, 85)
        // Sep 1 → Sep 22 (noon) touches 22 local days.
        XCTAssertEqual(d.days, 22)
        XCTAssertEqual(d.dailyAverageCents, 68) // 1500 / 22 = 68.18
        XCTAssertEqual(d.perLoggedDayAverageCents, 300) // 5 days logged
        XCTAssertEqual(d.medianExpenseCents, 750)
    }

    func testSharesAreNilWithoutIncome() {
        let w = ReviewPeriod.recent.window(now: NOW, firstEntryAt: nil)
        let d = SpendingDigest.build([tx(at(2026, 9, 2), 1000)], window: w)
        XCTAssertNil(d.saving.savedSharePct)
        XCTAssertNil(d.saving.leftOverSharePct)
    }

    // MARK: Months

    func testMonthsCarryTheirDaysInsideTheWindow() {
        let first = at(2026, 8, 10, 9)
        let rows = [tx(first, 2200), tx(at(2026, 9, 21), 1100)]
        let d = SpendingDigest.build(rows, window: ReviewPeriod.allTime.window(now: NOW, firstEntryAt: first))

        XCTAssertEqual(d.months.map(\.key), ["2026-08", "2026-09"])
        XCTAssertEqual(d.months.map(\.days), [22, 22]) // Aug 10–31, Sep 1–22
        XCTAssertEqual(d.months.map(\.daysInMonth), [31, 30])
        XCTAssertFalse(d.months[0].isWhole)
        XCTAssertEqual(d.months[0].dailyAverageCents, 100)
        XCTAssertEqual(d.months[1].spentCents, 1100)
        // No two whole months → nothing to compare.
        XCTAssertTrue(d.changes.isEmpty)
        XCTAssertNil(d.changeMonths)
    }

    // MARK: What moved

    func testWhatMovedComparesFirstAndLastWholeMonths() {
        let rows = [
            tx(at(2026, 6, 3), 1000, "food"),
            tx(at(2026, 6, 4), 400, "gym"),
            tx(at(2026, 7, 9), 99999, "rent"), // a middle month: not compared
            tx(at(2026, 8, 3), 1500, "food/restaurant"),
            tx(at(2026, 8, 4), 400, "gym"),
            tx(at(2026, 8, 5), 300, "coffee"),
            tx(at(2026, 9, 1), 5000, "food"), // the running month: left out
        ]
        let w = ReviewPeriod.recent.window(now: NOW, firstEntryAt: at(2026, 1, 1))
        let d = SpendingDigest.build(rows, window: w)

        XCTAssertEqual(d.changeMonths?.first, "June 2026")
        XCTAssertEqual(d.changeMonths?.last, "August 2026")
        let byId = Dictionary(uniqueKeysWithValues: d.changes.map { ($0.id, $0) })
        XCTAssertEqual(byId["food"]?.firstCents, 1000)
        XCTAssertEqual(byId["food"]?.lastCents, 1500)
        XCTAssertEqual(byId["food"]?.changePct, 50)
        XCTAssertEqual(byId["food"]?.direction, .up)
        XCTAssertEqual(byId["gym"]?.direction, .flat)
        XCTAssertEqual(byId["coffee"]?.direction, .new)
        XCTAssertNil(byId["coffee"]?.changePct)
        XCTAssertNil(byId["rent"])
        XCTAssertEqual(d.changes.first?.id, "food") // biggest last-month total first
    }

    // MARK: Categories

    func testCategoriesAndSubcategoriesAreRankedBySpend() {
        let rows = [
            tx(at(2026, 9, 2), 600, "food/restaurant"),
            tx(at(2026, 9, 3), 200, "food/delivery"),
            tx(at(2026, 9, 4), 200, "coffee"),
            tx(at(2026, 9, 5), 50000, "salary", isIncome: true),
        ]
        let d = SpendingDigest.build(rows, window: ReviewPeriod.recent.window(now: NOW, firstEntryAt: nil))

        XCTAssertEqual(d.categories.map(\.id), ["food", "coffee"])
        XCTAssertEqual(d.categories.map(\.rank), [0, 1])
        XCTAssertEqual(d.categories[0].sharePct, 80)
        XCTAssertEqual(d.categories[0].averageEntryCents, 400)
        XCTAssertEqual(d.subcategories.map(\.id), ["food/restaurant", "food/delivery"])
        XCTAssertEqual(d.subcategories[0].label, "Food · Restaurant")
        XCTAssertEqual(d.subcategories[0].base, "food")
    }

    func testBiggestExpensesAreTheLargestSpendingRows() {
        let rows = (1...8).map { tx(at(2026, 9, $0), $0 * 100) } + [tx(at(2026, 9, 9), 99999, "salary", isIncome: true)]
        let d = SpendingDigest.build(rows, window: ReviewPeriod.recent.window(now: NOW, firstEntryAt: nil))
        XCTAssertEqual(d.largestExpenses.map(\.amountCents), [800, 700, 600, 500, 400])
    }

    // MARK: Weekdays and coverage

    func testWeekdaySplitAndWeekendShare() {
        // Sep 5, 2026 is a Saturday; Sep 7 a Monday.
        let rows = [tx(at(2026, 9, 5), 300), tx(at(2026, 9, 7), 100)]
        let d = SpendingDigest.build(rows, window: ReviewPeriod.recent.window(now: NOW, firstEntryAt: nil))
        XCTAssertEqual(d.weekdays.count, 7)
        XCTAssertEqual(d.weekdays[6].spentCents, 300)
        XCTAssertEqual(d.weekdays[1].spentCents, 100)
        XCTAssertEqual(d.weekendSharePct, 75)
    }

    func testCoverageCountsLoggedDaysAndTheLongestGap() {
        let first = at(2026, 9, 1, 8)
        let rows = [
            tx(first, 100),
            tx(at(2026, 9, 1, 18), 100),
            tx(at(2026, 9, 2), 100),
            tx(at(2026, 9, 10), 5000, "salary", isIncome: true), // logged, but no spending
            tx(at(2026, 9, 20), 100),
        ]
        let d = SpendingDigest.build(rows, window: ReviewPeriod.allTime.window(now: NOW, firstEntryAt: first))
        let c = d.coverage
        XCTAssertEqual(c.days, 22)
        XCTAssertEqual(c.daysLogged, 4)
        XCTAssertEqual(c.daysWithNothingLogged, 18)
        XCTAssertEqual(c.daysWithNoSpending, 19)
        XCTAssertEqual(c.coveragePct, 18.2) // 4 / 22
        XCTAssertEqual(c.longestGapDays, 9) // Sep 11–19
        XCTAssertEqual(c.busiestDay?.count, 2)
        XCTAssertEqual(c.busiestDay?.date, at(2026, 9, 1, 0))
        XCTAssertEqual(d.daily.count, 22)
        XCTAssertEqual(d.daily.first?.cents, 200)
    }

    func testArithmeticHelpers() {
        XCTAssertEqual(SpendingDigest.pct(1, 3), 33.3)
        XCTAssertEqual(SpendingDigest.pct(1, 0), 0)
        XCTAssertNil(SpendingDigest.share(1, 0))
        XCTAssertEqual(SpendingDigest.median([5, 1, 3]), 3)
        XCTAssertEqual(SpendingDigest.median([1, 2]), 2) // 1.5 rounds half up
        XCTAssertEqual(SpendingDigest.divide(5, 2), 3)
        XCTAssertEqual(SpendingDigest.longestRun(["a", "b", "c", "d"]) { $0 != "a" && $0 != "d" }, 2)
    }
}
