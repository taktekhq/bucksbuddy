import XCTest
@testable import BucksBuddy

// Port of src/lib/recurring.test.ts.

// Fixtures are built in the local time zone at noon (like the TS
// `new Date(y, m, d, 12)`) so day gaps are whole numbers in any timezone.
// `m` is 0-based and `d` may overflow, as with the JS Date constructor.
private func at(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 12) -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = .current
    guard
        let jan1 = cal.date(from: DateComponents(year: y, month: 1, day: 1, hour: h)),
        let month = cal.date(byAdding: .month, value: m, to: jan1),
        let day = cal.date(byAdding: .day, value: d - 1, to: month)
    else { fatalError("bad fixture date \(y)-\(m)-\(d)") }
    return day
}

// June 10, 2026.
private let NOW = at(2026, 5, 10, 15)

private func tx(
    _ day: Date = at(2026, 5, 1),
    cents: Int = 1599,
    note: String? = "Netflix",
    category: String = "fees/subscriptions",
    isIncome: Bool = false,
    userId: String = "u1"
) -> Transaction {
    Transaction(
        id: UUID().uuidString,
        userId: userId,
        isIncome: isIncome,
        category: category,
        amountCents: cents,
        originalCurrency: "USD",
        originalAmount: Double(cents) / 100,
        rateUsed: 1,
        occurredAt: day,
        note: note,
        createdAt: day,
        amountMask: nil
    )
}

/// `n` copies of an entry, one per month, ending in the given month (0-based).
private func monthly(
    _ n: Int,
    endMonth: Int = 5,
    day: Int = 1,
    cents: Int = 1599,
    note: String? = "Netflix",
    category: String = "fees/subscriptions",
    isIncome: Bool = false,
    userId: String = "u1"
) -> [Transaction] {
    (0..<n).reversed().map { i in
        tx(at(2026, endMonth - i, day), cents: cents, note: note, category: category, isIncome: isIncome, userId: userId)
    }
}

final class CadenceOfTests: XCTestCase {
    func testNamesTheCadenceWhenEveryGapFitsItsWindow() {
        XCTAssertEqual(cadenceOf([7, 7, 8]), .weekly)
        XCTAssertEqual(cadenceOf([14, 13]), .biweekly)
        XCTAssertEqual(cadenceOf([31, 30, 28]), .monthly)
        XCTAssertEqual(cadenceOf([365, 366]), .yearly)
    }

    func testForgivesALogThatsACoupleOfDaysLateOrEarly() {
        XCTAssertEqual(cadenceOf([33, 25]), .monthly)
    }

    func testAllowsOneSkippedLogButNotASeriesMadeOfSkips() {
        XCTAssertEqual(cadenceOf([30, 61, 31]), .monthly)
        XCTAssertEqual(cadenceOf([7, 14]), .weekly)
        XCTAssertEqual(cadenceOf([14, 14]), .biweekly)
        XCTAssertNil(cadenceOf([60, 60, 30])) // more skips than not
    }

    func testIsNilWhenTheSpacingIsIrregularOrThereAreNoGaps() {
        XCTAssertNil(cadenceOf([1, 1, 2])) // daily coffee
        XCTAssertNil(cadenceOf([30, 7])) // mixed
        XCTAssertNil(cadenceOf([3, 3])) // between weekly and nothing
        XCTAssertNil(cadenceOf([]))
    }
}

final class PickFitsCadenceTests: XCTestCase {
    func testReadsTheCadenceOffTheTypicalGap() {
        XCTAssertEqual(pickCadence([30, 30, 95, 30]), .monthly) // a long break in the middle
        XCTAssertEqual(pickCadence([61, 30, 60]), .monthly) // typical gap only fits twice over
        XCTAssertNil(pickCadence([300]))
    }

    func testChecksTheGapsKeepToACadence() {
        XCTAssertTrue(fitsCadence(.monthly, [30, 61, 31]))
        XCTAssertFalse(fitsCadence(.monthly, [30, 95]))
        XCTAssertFalse(fitsCadence(.weekly, [14, 14])) // all skips
        XCTAssertTrue(fitsCadence(.weekly, []))
    }
}

final class CadenceWindowTests: XCTestCase {
    func testScaleWithTheCadence() {
        XCTAssertEqual(breakAfterDays(.weekly), 18)
        XCTAssertEqual(breakAfterDays(.monthly), 74)
        XCTAssertEqual(aliveForDays(.weekly), 16)
        XCTAssertEqual(aliveForDays(.monthly), 67)
        XCTAssertEqual(aliveForDays(.yearly), 745)
    }

    func testLabels() {
        XCTAssertEqual(Cadence.weekly.label, "Weekly")
        XCTAssertEqual(Cadence.biweekly.label, "Every 2 weeks")
        XCTAssertEqual(Cadence.monthly.label, "Monthly")
        XCTAssertEqual(Cadence.yearly.label, "Yearly")
    }
}

final class MonthlyEquivalentTests: XCTestCase {
    func testNormalisesEachCadenceToAPerMonthFigure() {
        XCTAssertEqual(monthlyEquivalent(1200, .monthly), 1200)
        XCTAssertEqual(monthlyEquivalent(1200, .weekly), 5200)
        XCTAssertEqual(monthlyEquivalent(1200, .biweekly), 2600)
        XCTAssertEqual(monthlyEquivalent(1200, .yearly), 100)
        // Math.round: halves go up.
        XCTAssertEqual(monthlyEquivalent(6, .yearly), 1) // 0.5
        XCTAssertEqual(monthlyEquivalent(18, .yearly), 2) // 1.5
    }
}

final class PriceTrackTests: XCTestCase {
    func testHoldsSteadyWithinTheToleranceAndReportsNoPreviousPrice() {
        XCTAssertEqual(Recurring.samePriceTolerance, 0.1)
        // The latest amount is the current price.
        XCTAssertEqual(priceTrack([1000, 1050, 980]), PriceTrack(current: 980, previous: nil, kept: [true, true, true]))
        XCTAssertEqual(priceTrack([1000]), PriceTrack(current: 1000, previous: nil, kept: [true]))
    }

    func testAcceptsAPriceChangeOnceTheOldPriceHasHeldForTwoEntries() {
        XCTAssertEqual(Recurring.priceChangeTolerance, 0.5)
        let a = priceTrack([1599, 1599, 1999])
        XCTAssertEqual(a?.current, 1999)
        XCTAssertEqual(a?.previous, 1599)
        let b = priceTrack([1599, 1599, 1999, 1999, 2499])
        XCTAssertEqual(b?.current, 2499)
        XCTAssertEqual(b?.previous, 1999)
    }

    func testSetsAsideTheOddOneOutAsLongAsTheyStayAMinority() {
        // Muay Thai 600, 600, a $15 bottle of water, 600.
        XCTAssertEqual(
            priceTrack([60000, 60000, 1500, 60000]),
            PriceTrack(current: 60000, previous: nil, kept: [true, true, false, true])
        )
        // A change that came too soon is an odd one out too, and the current
        // price is the latest amount that belongs.
        XCTAssertEqual(
            priceTrack([1599, 1999, 1599]),
            PriceTrack(current: 1599, previous: nil, kept: [true, false, true])
        )
        let t = priceTrack([1599, 1599, 1999, 1999, 2499, 800])
        XCTAssertEqual(t?.current, 2499)
        XCTAssertEqual(t?.previous, 1999)
    }

    func testGivesUpWhenTheOddOnesOutAreAsManyAsTheRest() {
        XCTAssertNil(priceTrack([1599, 1999])) // old price never held
        XCTAssertNil(priceTrack([1000, 1000, 1600, 1700])) // two of four
        XCTAssertNil(priceTrack([5000, 9000, 5200, 8800])) // groceries, not a bill
    }
}

final class DetectRecurringTests: XCTestCase {
    func testNeedsTwoOccurrencesForMonthlyAndYearlyThreeForTheShortCadences() {
        XCTAssertEqual(minOccurrences(.monthly), 2)
        XCTAssertEqual(minOccurrences(.yearly), 2)
        XCTAssertEqual(minOccurrences(.weekly), 3)
        XCTAssertEqual(minOccurrences(.biweekly), 3)
        // Two entries a week apart prove little on their own…
        let twoWeekly = [0, 7].map { d in
            tx(at(2026, 5, 1 + d), cents: 2500, note: nil, category: "gym")
        }
        XCTAssertEqual(detectRecurring(twoWeekly, userId: "u1", now: NOW).payments.count, 0)
        // …three do.
        let threeWeekly = [0, 7, 14].map { d in
            tx(at(2026, 4, 25 + d), cents: 2500, note: nil, category: "gym")
        }
        XCTAssertEqual(detectRecurring(threeWeekly, userId: "u1", now: NOW).payments.first?.cadence, .weekly)
    }

    func testFindsAMonthlySubscriptionFromTwoMatchingEntries() {
        let rows = monthly(2) // May 1, Jun 1
        let s = detectRecurring(rows, userId: "u1", now: NOW)
        XCTAssertEqual(s.payments.count, 1)
        let p = s.payments[0]
        XCTAssertEqual(p.key, "false:fees/subscriptions:netflix")
        XCTAssertEqual(p.id, p.key)
        XCTAssertEqual(p.category, "fees/subscriptions")
        XCTAssertFalse(p.isIncome)
        XCTAssertEqual(p.note, "Netflix")
        XCTAssertEqual(p.cadence, .monthly)
        XCTAssertFalse(p.fromNote)
        XCTAssertEqual(p.amountCents, 1599)
        XCTAssertNil(p.previousAmountCents)
        XCTAssertEqual(p.monthlyCents, 1599)
        XCTAssertEqual(p.count, 2)
        XCTAssertEqual(p.firstAt, at(2026, 4, 1))
        XCTAssertEqual(p.lastAt, at(2026, 5, 1))
        // Due 30 days after Jun 1 — still ahead of Jun 10.
        XCTAssertEqual(p.nextDueAt, at(2026, 6, 1))
        XCTAssertFalse(p.overdue)
        // Occurrences come back newest first.
        XCTAssertEqual(p.rows.map(\.occurredAt), [at(2026, 5, 1), at(2026, 4, 1)])
        XCTAssertEqual(s.monthlyOutCents, 1599)
        XCTAssertEqual(s.monthlyInCents, 0)
        XCTAssertFalse(s.anyMasked)
    }

    func testNeedsAtLeastTwoOccurrencesWithoutAHint() {
        XCTAssertEqual(detectRecurring(monthly(1), userId: "u1", now: NOW).payments.count, 0)
    }

    func testOnlyEverCountsTheGivenUsersRows() {
        let rows = monthly(3) + monthly(3, note: "Spotify", userId: "u2")
        let mine = detectRecurring(rows, userId: "u1", now: NOW).payments
        XCTAssertEqual(mine.count, 1)
        XCTAssertEqual(mine.first?.note, "Netflix")
        XCTAssertEqual(detectRecurring(rows, userId: "u3", now: NOW).payments.count, 0)
    }

    func testSplitsACategoryByNoteSoTwoSubscriptionsDontMerge() {
        let rows = monthly(3) + monthly(3, endMonth: 5, day: 15, cents: 999, note: " spotify ")
        let payments = detectRecurring(rows, userId: "u1", now: NOW).payments
        XCTAssertEqual(payments.map(\.note), ["Netflix", "spotify"])
        XCTAssertEqual(payments[1].amountCents, 999)
    }

    func testFoldsNotesThatMeanTheSameThingIntoOneSeries() {
        let rows = [
            tx(at(2026, 2, 1), note: "Netflix"),
            tx(at(2026, 3, 1), note: "netflix sub"),
            tx(at(2026, 4, 1), note: "Netlfix"),
            tx(at(2026, 5, 1), note: "NETFLIX family"),
        ]
        let payments = detectRecurring(rows, userId: "u1", now: NOW).payments
        XCTAssertEqual(payments.count, 1)
        XCTAssertEqual(payments[0].count, 4)
        // Named by the latest note, keyed by it too.
        XCTAssertEqual(payments[0].note, "NETFLIX family")
        XCTAssertEqual(payments[0].key, "false:fees/subscriptions:netflix family")
    }

    func testKeepsATaggedNoteOutOfTheUntaggedSeriesOfTheSameName() {
        // The Claude that has been running for months…
        let rows = monthly(4, cents: 2000, note: "Claude subscription")
            // …and a second one, on its first entry, tagged to say which it is.
            + [tx(at(2026, 5, 4), cents: 10000, note: "Claude (taktekbot) (monthly)")]
        let s = detectRecurring(rows, userId: "u1", now: NOW)
        XCTAssertEqual(s.payments.map(\.note), ["Claude", "Claude (taktekbot)"])
        XCTAssertEqual(s.payments.map(\.count), [4, 1])
        XCTAssertEqual(s.payments.map(\.amountCents), [2000, 10000])
        // Two payments, so the total is both — not one series with a price hike.
        XCTAssertEqual(s.monthlyOutCents, 12000)
    }

    func testFoldsATaggedNoteTogetherWithTheSameTagWrittenPlainly() {
        let rows = [
            tx(at(2026, 4, 4), note: "Claude (taktekbot) (monthly)"),
            tx(at(2026, 5, 4), note: "Claude taktekbot"),
        ]
        let payments = detectRecurring(rows, userId: "u1", now: NOW).payments
        XCTAssertEqual(payments.map(\.note), ["Claude taktekbot"])
        XCTAssertEqual(payments.map(\.count), [2])
    }

    func testGroupsNoteLessEntriesByCategoryAloneApartFromTheNotedOnes() {
        let rows = monthly(4, cents: 80000, note: nil, category: "rent")
            + monthly(3, endMonth: 5, day: 15, cents: 5000, note: "parking spot", category: "rent")
        let payments = detectRecurring(rows, userId: "u1", now: NOW).payments
        XCTAssertEqual(payments.map(\.note), [nil, "parking spot"])
        XCTAssertEqual(payments.map(\.count), [4, 3])
        XCTAssertEqual(payments[0].key, "false:rent:")
    }

    func testTreatsABlankNoteLikeNoNote() {
        let rows = monthly(3, cents: 80000, note: "   ", category: "rent")
        XCTAssertEqual(detectRecurring(rows, userId: "u1", now: NOW).payments.count, 1)
        XCTAssertNil(detectRecurring(rows, userId: "u1", now: NOW).payments.first?.note)
    }

    func testTakesACadenceHintInTheNoteAtItsWordEvenForASingleEntry() throws {
        let rows = [tx(at(2026, 0, 15), cents: 1200, note: "Insurance (yearly)", category: "fees")]
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.cadence, .yearly)
        XCTAssertTrue(p.fromNote)
        XCTAssertEqual(p.note, "Insurance")
        XCTAssertEqual(p.count, 1)
        XCTAssertEqual(p.monthlyCents, 100)
        XCTAssertEqual(p.nextDueAt, at(2027, 0, 15))
        XCTAssertFalse(p.overdue)
    }

    func testLetsTheLatestHintOverrideWhatTheDatesSay() throws {
        // Logged monthly by mistake at first; the newest note says weekly.
        let rows = [
            tx(at(2026, 3, 1), cents: 2500, note: "Gym", category: "gym"),
            tx(at(2026, 4, 1), cents: 2500, note: "Gym (monthly)", category: "gym"),
            tx(at(2026, 5, 1), cents: 2500, note: "Gym (weekly)", category: "gym"),
        ]
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.cadence, .weekly)
        XCTAssertEqual(p.note, "Gym")
    }

    func testRejectsIrregularSpacing() {
        let rows = [1, 4, 7, 12].map { d in tx(at(2026, 5, d), cents: 350, note: nil, category: "coffee") }
        XCTAssertEqual(detectRecurring(rows, userId: "u1", now: NOW).payments.count, 0)
    }

    func testCountsEntriesLoggedADayOrTwoApartAsOneOccurrence() throws {
        XCTAssertEqual(Recurring.mergeDays, 2)
        // Netflix logged twice on May 1/2 by mistake, then Jun 1.
        let rows = [tx(at(2026, 4, 1)), tx(at(2026, 4, 2)), tx(at(2026, 5, 1))]
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.cadence, .monthly)
        XCTAssertEqual(p.count, 2)
        XCTAssertEqual(p.rows.count, 3)
        // Daily coffee all folds into one occurrence — not recurring.
        let coffee = [1, 2, 3, 4].map { d in tx(at(2026, 5, d), cents: 350, note: nil, category: "coffee") }
        XCTAssertEqual(detectRecurring(coffee, userId: "u1", now: NOW).payments.count, 0)
    }

    func testKeepsASeriesThroughAPriceChangeAndReportsTheOldPrice() throws {
        let rows = [
            tx(at(2026, 2, 1), cents: 1599),
            tx(at(2026, 3, 1), cents: 1599),
            tx(at(2026, 4, 1), cents: 1999),
            tx(at(2026, 5, 1), cents: 1999),
        ]
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.amountCents, 1999)
        XCTAssertEqual(p.previousAmountCents, 1599)
        XCTAssertEqual(p.monthlyCents, 1999)
    }

    func testLeavesAnOddAmountOutOfTheSeriesInsteadOfDroppingTheSeries() throws {
        let rows = [
            tx(at(2026, 2, 18), cents: 61000, note: "Muay Thai", category: "gym"),
            tx(at(2026, 3, 24), cents: 60000, note: "Muay Thai", category: "gym"),
            tx(at(2026, 4, 28), cents: 60000, note: "Muay Thai", category: "gym"),
            tx(at(2026, 4, 28), cents: 1500, note: "Muay Thai water", category: "gym"),
        ]
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.cadence, .monthly)
        XCTAssertEqual(p.count, 3)
        XCTAssertEqual(p.rows.count, 3) // the water isn't in the series
        XCTAssertEqual(p.amountCents, 60000)
    }

    func testTakesTheAmountsAsTheyComeWhenTheNoteVouchedForTheSeries() throws {
        // Google Workspace: seats added every month, the note says subscription.
        let rows = [
            tx(at(2026, 2, 1), cents: 1600, note: "Google workspace", category: "work"),
            tx(at(2026, 3, 1), cents: 3241, note: "Google workspace", category: "work"),
            tx(at(2026, 4, 1), cents: 6384, note: "Google workspace subscription", category: "work"),
            tx(at(2026, 5, 1), cents: 6384, note: "Google workspace", category: "work"),
        ]
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.count, 4)
        XCTAssertEqual(p.amountCents, 6384)
        XCTAssertEqual(p.previousAmountCents, 3241)
        // Steady prices report no previous one.
        let steady = rows.map { r -> Transaction in
            var r = r
            r.amountCents = 6384
            return r
        }
        let q = try XCTUnwrap(detectRecurring(steady, userId: "u1", now: NOW).payments.first)
        XCTAssertNil(q.previousAmountCents)
    }

    func testStopsASeriesWhoseLatestEntrySaysItEnded() {
        let rows = monthly(2, endMonth: 4, cents: 1500, note: "Framer subscription")
            + [tx(at(2026, 5, 1), cents: 1500, note: "Framer subscription (ended)")]
        XCTAssertEqual(detectRecurring(rows, userId: "u1", now: NOW).payments.count, 0)
        // An older "ended" doesn't stop a series that came back.
        let back = [
            tx(at(2026, 3, 1), cents: 1500, note: "Framer (ended)"),
            tx(at(2026, 4, 1), cents: 1500, note: "Framer"),
            tx(at(2026, 5, 1), cents: 1500, note: "Framer"),
        ]
        XCTAssertEqual(detectRecurring(back, userId: "u1", now: NOW).payments.count, 1)
    }

    func testTakesADomainNameAsAYearlySeriesFromItsFirstEntry() {
        let rows = [
            tx(at(2026, 5, 8), cents: 1868, note: "sillyguy.com subscription", category: "work"),
            tx(at(2026, 5, 9), cents: 1868, note: "bucksbuddy.com subscription", category: "work"),
        ]
        let payments = detectRecurring(rows, userId: "u1", now: NOW).payments
        // Two different domains, not one series sharing ".com".
        XCTAssertEqual(payments.map(\.note), ["sillyguy.com", "bucksbuddy.com"])
        XCTAssertEqual(payments.map(\.cadence), [.yearly, .yearly])
        XCTAssertEqual(payments.map(\.fromNote), [true, true])
    }

    func testRejectsAmountsThatJumpAroundEvenOnASteadySchedule() throws {
        // Half the entries are odd ones out: that's not a payment.
        let rows = [5000, 9000, 5100, 9200].enumerated().map { i, cents in
            tx(at(2026, 2 + i, 1), cents: cents, note: nil, category: "groceries")
        }
        XCTAssertEqual(detectRecurring(rows, userId: "u1", now: NOW).payments.count, 0)
        // Within tolerance it's a series, priced at its latest amount.
        let steady = [
            tx(at(2026, 5, 1), cents: 5000, note: nil, category: "groceries"),
            tx(at(2026, 5, 8), cents: 5400, note: nil, category: "groceries"),
            tx(at(2026, 5, 15), cents: 5200, note: nil, category: "groceries"),
        ]
        let p = try XCTUnwrap(detectRecurring(steady, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.cadence, .weekly)
        XCTAssertEqual(p.amountCents, 5200)
        XCTAssertEqual(p.monthlyCents, jsRound(Double(5200 * 52) / 12))
    }

    func testFlagsASeriesWhoseNextOccurrenceIsAlreadyBehindUs() throws {
        let rows = monthly(3, endMonth: 3, day: 20) // Feb, Mar, Apr 20 — due May 20, now is Jun 10
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertTrue(p.overdue)
        XCTAssertEqual(p.nextDueAt, at(2026, 4, 20))
    }

    func testStopsShowingASeriesOnceAWholePeriodHasPassedBeyondItsDueDate() {
        // Monthly, last on Apr 1: due May 1, gone after Jun 1 (67 days) — by Jun 10 it's gone.
        XCTAssertEqual(detectRecurring(monthly(3, endMonth: 3), userId: "u1", now: NOW).payments.count, 0)
        // Weekly, last on May 22: due May 29, alive 16 days — gone on Jun 10 (19 days).
        let weekly = [0, 7, 14].map { d in tx(at(2026, 4, 8 + d), cents: 2500, note: nil, category: "gym") }
        XCTAssertEqual(detectRecurring(weekly, userId: "u1", now: NOW).payments.count, 0)
        // A hinted single entry lapses the same way.
        let old = [tx(at(2026, 2, 1), note: "Claude subscription")]
        XCTAssertEqual(detectRecurring(old, userId: "u1", now: NOW).payments.count, 0)
    }

    func testCarriesOnAfterASkippedMonthButStartsOverAfterALongerBreak() throws {
        // Jan, Feb, (nothing in Mar), Apr 1 — one skipped log, still one series.
        let skipped = [0, 1, 3, 4].map { m in tx(at(2026, m, 1)) }
        let p = try XCTUnwrap(detectRecurring(skipped, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.count, 4)
        XCTAssertEqual(p.firstAt, at(2026, 0, 1))

        // Ran Sep–Dec 2025, stopped, restarted May 1 2026: only the restart
        // counts, and one entry isn't enough on its own.
        let before = [8, 9, 10, 11].map { m in tx(at(2025, m, 1)) }
        XCTAssertEqual(
            detectRecurring(before + [tx(at(2026, 4, 1))], userId: "u1", now: NOW).payments.count,
            0
        )
        // With a second entry the restart is a series of its own, priced fresh.
        let restarted = before + [
            tx(at(2026, 4, 1), cents: 2499),
            tx(at(2026, 5, 1), cents: 2499),
        ]
        let r = try XCTUnwrap(detectRecurring(restarted, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(r.count, 2)
        XCTAssertEqual(r.firstAt, at(2026, 4, 1))
        XCTAssertEqual(r.amountCents, 2499)
        XCTAssertNil(r.previousAmountCents)
        XCTAssertEqual(r.rows.count, 2)
    }

    func testComparesNotesWithoutWhoTheyWereWith() throws {
        // Three meals with the same person are three different things.
        let meals = [
            tx(at(2026, 3, 1), cents: 4000, note: "Dinner with Sara", category: "food"),
            tx(at(2026, 4, 1), cents: 4000, note: "Lunch with Sara", category: "food"),
            tx(at(2026, 5, 1), cents: 4000, note: "Brunch with Sara", category: "food"),
        ]
        XCTAssertEqual(detectRecurring(meals, userId: "u1", now: NOW).payments.count, 0)
        // The same thing with different people is still the same thing.
        let shared = [
            tx(at(2026, 4, 1), note: "Netflix with Ali"),
            tx(at(2026, 5, 1), note: "Netflix with Sara"),
        ]
        let p = try XCTUnwrap(detectRecurring(shared, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.count, 2)
        XCTAssertEqual(p.note, "Netflix")
    }

    func testTakesSubscriptionOrMembershipAsRecurringMonthlyUntilTheDatesSayOtherwise() throws {
        let one = [tx(at(2026, 5, 6), cents: 20000, note: "Claude subscription")]
        let p = try XCTUnwrap(detectRecurring(one, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.cadence, .monthly)
        XCTAssertFalse(p.fromNote)
        XCTAssertEqual(p.note, "Claude") // the word is a cue, not part of the name
        XCTAssertEqual(p.count, 1)

        // Written once, it keeps working for later entries that forget the word.
        let forgot = [
            tx(at(2026, 4, 6), cents: 20000, note: "Claude subscription"),
            tx(at(2026, 5, 6), cents: 20000, note: "Claude"),
        ]
        let f = detectRecurring(forgot, userId: "u1", now: NOW).payments
        XCTAssertEqual(f.count, 1)
        XCTAssertEqual(f.first?.count, 2)

        // Two logged a week apart: the dates decide.
        let weekly = [0, 7].map { d in
            tx(at(2026, 4, 28 + d), cents: 2500, note: "Gym membership", category: "gym")
        }
        XCTAssertEqual(detectRecurring(weekly, userId: "u1", now: NOW).payments.first?.cadence, .weekly)

        // Irregular dates don't disqualify it — the note said so — and with no
        // cadence to read off them, monthly is assumed.
        let irregular = [1, 4, 9].map { d in tx(at(2026, 5, d), cents: 500, note: "News subscription") }
        let n = detectRecurring(irregular, userId: "u1", now: NOW).payments
        XCTAssertEqual(n.count, 1)
        XCTAssertEqual(n.first?.cadence, .monthly)
    }

    func testSortsOutgoingsBeforeIncomeAndNearestDueFirstAndTotalsEachSide() {
        var rows: [Transaction] = []
        rows += monthly(3, endMonth: 5, day: 20, note: "Netflix") // due Jul 20
        rows += monthly(3, endMonth: 5, day: 1, cents: 80000, note: nil, category: "rent") // due Jul 1
        rows += monthly(3, endMonth: 5, day: 25, cents: 300000, note: nil, category: "salary", isIncome: true)
        // Weekly income too, to exercise the per-month normalisation in the total.
        rows += [0, 7, 14].map { d in
            tx(at(2026, 4, 22 + d), cents: 10000, note: "retainer", category: "freelance", isIncome: true)
        }
        let s = detectRecurring(rows, userId: "u1", now: NOW)
        XCTAssertEqual(
            s.payments.map { "\($0.isIncome ? "in" : "out"):\($0.category)" },
            ["out:rent", "out:fees/subscriptions", "in:freelance", "in:salary"]
        )
        XCTAssertEqual(s.monthlyOutCents, 80000 + 1599)
        XCTAssertEqual(s.monthlyInCents, 300000 + jsRound(Double(10000 * 52) / 12))
    }

    func testRecognisesAYearlySeriesFromTheDatesAlone() throws {
        let rows = [2025, 2026].map { y in tx(at(y, 0, 15), cents: 1200, note: "insurance", category: "fees") }
        let p = try XCTUnwrap(detectRecurring(rows, userId: "u1", now: NOW).payments.first)
        XCTAssertEqual(p.cadence, .yearly)
        XCTAssertFalse(p.fromNote)
        XCTAssertEqual(p.monthlyCents, 100)
    }

    func testReportsMaskedRowsSoTheCallerCanRefuseToShowZeros() {
        let rows = monthly(3).map { r -> Transaction in
            var r = r
            r.amountCents = 0
            r.amountMask = "a8"
            return r
        }
        XCTAssertTrue(detectRecurring(rows, userId: "u1", now: NOW).anyMasked)
    }

    func testDefaultsNowToTheCurrentTime() {
        let rows = monthly(3, endMonth: 3) // last on Apr 1 2026 — long gone by any real clock
        XCTAssertEqual(detectRecurring(rows, userId: "u1").payments.count, 0)
    }
}
