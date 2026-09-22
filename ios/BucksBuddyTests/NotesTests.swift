import XCTest
@testable import BucksBuddy

// Port of src/lib/notes.test.ts.

private func plain(
    _ text: String,
    _ cadence: Cadence?,
    recurring: Bool = false,
    ended: Bool = false,
    tag: String = ""
) -> ParsedNote {
    ParsedNote(text: text, cadence: cadence, recurring: recurring, ended: ended, tag: tag)
}

/// "2026-06-01T12:00:00.000Z" → Date (UTC, like the TS fixtures).
private func iso(_ s: String) -> Date {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let d = f.date(from: s) else { fatalError("bad ISO date \(s)") }
    return d
}

private func row(
    _ id: String,
    _ note: String?,
    _ occurredAt: String,
    isIncome: Bool = false,
    category: String = "fees/subscriptions"
) -> Transaction {
    let d = iso(occurredAt)
    return Transaction(
        id: id,
        userId: "u1",
        isIncome: isIncome,
        category: category,
        amountCents: 0,
        originalCurrency: "USD",
        originalAmount: 0,
        rateUsed: 1,
        occurredAt: d,
        note: note,
        createdAt: d,
        amountMask: nil
    )
}

final class ParseNoteTests: XCTestCase {
    func testPeelsACadenceHintOffTheNoteBracketsAndAll() {
        XCTAssertEqual(parseNote("Insurance (yearly)"), plain("Insurance", .yearly))
        XCTAssertEqual(parseNote("[monthly] Gym"), plain("Gym", .monthly))
        XCTAssertEqual(parseNote("cleaner every 2 weeks"), plain("cleaner", .biweekly))
        XCTAssertEqual(parseNote("bi-weekly cleaner"), plain("cleaner", .biweekly))
        XCTAssertEqual(parseNote("Weekly groceries"), plain("groceries", .weekly))
        XCTAssertEqual(parseNote("insurance - annual"), plain("insurance", .yearly))
    }

    func testLeavesANoteWithoutAHintAloneAndCopesWithNil() {
        XCTAssertEqual(parseNote("Netflix"), plain("Netflix", nil))
        XCTAssertEqual(parseNote(nil), plain("", nil))
        XCTAssertEqual(parseNote("  spaced   out  "), plain("spaced out", nil))
    }

    func testCanLeaveNothingButTheHint() {
        XCTAssertEqual(parseNote("(yearly)"), plain("", .yearly))
    }

    func testSpotsSubscriptionAndMembershipAsRecurringAndDropsThem() {
        XCTAssertEqual(parseNote("Claude subscription"), plain("Claude", nil, recurring: true))
        XCTAssertEqual(parseNote("Gym Membership (yearly)"), plain("Gym", .yearly, recurring: true))
        XCTAssertEqual(parseNote("subscription"), plain("", nil, recurring: true))
    }

    func testTakesADomainNameAsYearlyKeepingTheHostnameButNotTheWord() {
        XCTAssertEqual(parseNote("sillyguy.com subscription"), plain("sillyguy.com", .yearly, recurring: true))
        XCTAssertEqual(parseNote("Domain: redcarnet.com"), plain("redcarnet.com", .yearly, recurring: true))
        XCTAssertEqual(parseNote("closet.ai domain (monthly)"), plain("closet.ai", .monthly, recurring: true))
        XCTAssertEqual(parseNote("Coffee at dot.com café").cadence, .yearly) // looks like a host; the trade-off
    }

    func testSpotsEndedAndDropsItFromTheName() {
        XCTAssertEqual(
            parseNote("Framer subscription (ended)"),
            plain("Framer", nil, recurring: true, ended: true)
        )
        XCTAssertEqual(parseNote("Gym cancelled"), plain("Gym", nil, ended: true))
    }

    func testDropsWhoItWasWith() {
        XCTAssertEqual(parseNote("Dinner with Sara"), plain("Dinner", nil))
        XCTAssertEqual(parseNote("Netflix with Ali (monthly)"), plain("Netflix", .monthly))
        XCTAssertEqual(parseNote("Withdrawal").text, "Withdrawal") // whole word only
    }

    func testReadsLeftoverBracketsAsATagKeepingThemInTheName() {
        XCTAssertEqual(
            parseNote("Claude (taktekbot) (monthly)"),
            plain("Claude (taktekbot)", .monthly, tag: "taktekbot")
        )
        // A hint or "(ended)" is not a tag — it's already gone by then.
        XCTAssertEqual(parseNote("Insurance (yearly)").tag, "")
        XCTAssertEqual(parseNote("Framer subscription (ended)").tag, "")
        XCTAssertEqual(parseNote("[monthly] Gym").tag, "")
        // Several tags read as one, normalized like any other note text.
        XCTAssertEqual(parseNote("Netflix (Türkiye) (Ali's)").tag, "turkiye ali s")
    }
}

final class NormalizeNoteTests: XCTestCase {
    func testLowercasesStripsAccentsAndFoldsPunctuation() {
        XCTAssertEqual(normalizeNote("  Café-Crème, Netflix!! "), "cafe creme netflix")
    }

    func testKeepsOnlyTheMeaningfulWords() {
        XCTAssertEqual(noteTokens("the netflix bill for us"), ["netflix"])
    }
}

final class EditDistanceTests: XCTestCase {
    func testCountsInsertsDeletesReplacementsAndSwapsAsOneEditEach() {
        XCTAssertEqual(Notes.typoDistance, 1)
        XCTAssertEqual(editDistance("abc", "abc"), 0)
        XCTAssertEqual(editDistance("netflix", "netflx"), 1) // missed letter
        XCTAssertEqual(editDistance("netflix", "netfllix"), 1) // extra letter
        XCTAssertEqual(editDistance("netflix", "netfrix"), 1) // wrong letter
        XCTAssertEqual(editDistance("netflix", "netlfix"), 1) // swapped pair
        XCTAssertEqual(editDistance("lunch", "brunch"), 2)
        XCTAssertEqual(editDistance("", "abc"), 3)
        XCTAssertEqual(editDistance("abc", ""), 3)
        XCTAssertEqual(editDistance("", ""), 0)
    }
}

final class NotesMatchTests: XCTestCase {
    func testMatchesEqualMostlySharedAndTypodNotes() {
        XCTAssertTrue(notesMatch("netflix", "netflix"))
        XCTAssertTrue(notesMatch("netflix", "netflix sub"))
        XCTAssertTrue(notesMatch("netflix family plan", "family plan on netflix"))
        XCTAssertTrue(notesMatch("canva", "canva for family")) // 1 of 2
        XCTAssertTrue(notesMatch("amazon prime", "amazon prime turkish")) // 2 of 3
        XCTAssertTrue(notesMatch("netlfix", "netflix"))
        XCTAssertTrue(notesMatch("netlfix sub", "netflix")) // typo in one word
        XCTAssertTrue(notesMatch("gym pass", "gym pas")) // typo across the whole note
    }

    func testDoesNotMatchOnOneWordOutOfMany() {
        XCTAssertFalse(notesMatch("claude", "claude extra credits")) // 1 of 3
        XCTAssertFalse(notesMatch("icloud for sara", "linkedin premium for sara"))
        XCTAssertFalse(notesMatch("google workspace", "google ai studio balance"))
        XCTAssertFalse(notesMatch("sillyguy com", "bucksbuddy com"))
    }

    func testDoesNotMatchOnAStopwordAloneADifferentWordOrAShortFragment() {
        XCTAssertFalse(notesMatch("netflix bill", "gym bill"))
        XCTAssertFalse(notesMatch("claude subscription", "gym membership"))
        XCTAssertFalse(notesMatch("lunch", "brunch"))
        XCTAssertFalse(notesMatch("spotify", "shopify"))
        XCTAssertFalse(notesMatch("ab", "abc"))
        XCTAssertFalse(notesMatch("abc", "abd")) // too short to call a typo
    }

    func testTreatsEmptyNotesAsTheirOwnThing() {
        XCTAssertTrue(notesMatch("", ""))
        XCTAssertFalse(notesMatch("", "netflix"))
        XCTAssertFalse(notesMatch("netflix", ""))
    }
}

final class NamesMatchTests: XCTestCase {
    private func name(_ raw: String) -> NoteName { noteName(raw) }

    func testKeepsATaggedNoteApartFromTheUntaggedOne() {
        // The whole point: half the words are shared, which is normally enough.
        XCTAssertTrue(notesMatch("claude", "claude taktekbot"))
        XCTAssertFalse(namesMatch(name("Claude subscription"), name("Claude (taktekbot) (monthly)")))
        XCTAssertFalse(namesMatch(name("Claude (personal)"), name("Claude (taktekbot)")))
        XCTAssertFalse(namesMatch(name("Sara (1)"), name("Sara (2)")))
    }

    func testStillFoldsTheSameTagTogetherBracketsOrNotTyposAndAll() {
        XCTAssertTrue(namesMatch(name("Claude (taktekbot)"), name("claude (TaktekBot)")))
        XCTAssertTrue(namesMatch(name("Claude (taktekbot)"), name("Claude taktekbot")))
        XCTAssertTrue(namesMatch(name("Claude (taktekbot)"), name("Claude (taktekbo)")))
        XCTAssertTrue(namesMatch(name("Claude (taktekbot) sub"), name("Claude (taktekbot)")))
    }

    func testLeavesUntaggedNotesToTheWordRules() {
        XCTAssertTrue(namesMatch(name("Netflix"), name("netflix sub")))
        XCTAssertTrue(namesMatch(name("Canva"), name("Canva for family")))
        XCTAssertFalse(namesMatch(name("Claude"), name("Claude extra credits")))
    }
}

final class NoteSuggestionsTests: XCTestCase {
    private let rows: [Transaction] = [
        row("a", "Netflix", "2026-06-01T12:00:00.000Z"),
        row("b", "Spotify", "2026-06-12T12:00:00.000Z"),
        row("c", "netflix", "2026-05-01T12:00:00.000Z"), // same note, older casing
        row("d", nil, "2026-06-20T12:00:00.000Z"),
        row("e", "   ", "2026-06-21T12:00:00.000Z"),
        row("f", "Mobile top-up", "2026-06-22T12:00:00.000Z", category: "fees/mobile"),
        row("g", "Salary", "2026-06-25T12:00:00.000Z", isIncome: true, category: "salary"),
        row("h", "Groceries", "2026-06-26T12:00:00.000Z", category: "groceries"),
    ]

    func testOffersTheDistinctPastNotesOfTheExactCategoryNewestFirst() {
        XCTAssertEqual(
            noteSuggestions(rows, isIncome: false, category: "fees/subscriptions", query: ""),
            ["Spotify", "Netflix"]
        )
        // A sibling subcategory keeps its own notes; the bare parent has none here.
        XCTAssertEqual(
            noteSuggestions(rows, isIncome: false, category: "fees/mobile", query: ""),
            ["Mobile top-up"]
        )
        XCTAssertEqual(noteSuggestions(rows, isIncome: false, category: "fees", query: ""), [])
    }

    func testNarrowsToWhatsTypedAndDropsAnExactMatch() {
        XCTAssertEqual(
            noteSuggestions(rows, isIncome: false, category: "fees/subscriptions", query: "net"),
            ["Netflix"]
        )
        XCTAssertEqual(
            noteSuggestions(rows, isIncome: false, category: "fees/subscriptions", query: "NETFLIX"),
            []
        )
        XCTAssertEqual(
            noteSuggestions(rows, isIncome: false, category: "fees/subscriptions", query: "zzz"),
            []
        )
    }

    func testRespectsTheLimit() {
        XCTAssertEqual(
            noteSuggestions(rows, isIncome: false, category: "fees/subscriptions", query: "", limit: 1),
            ["Spotify"]
        )
    }
}
