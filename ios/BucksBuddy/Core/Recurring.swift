import Foundation

// Recurring payments, detected from the entries a user has already logged.
// Mirrors src/lib/recurring.ts.
//
// BucksBuddy has no "subscription" object: rent, salary, Netflix and the gym
// are all just entries. This module finds them after the fact. It is a pure
// function over the decrypted transactions, so it runs on the device, works on
// end-to-end encrypted data, and is scoped to one user id, so a caller can
// never mix two accounts' rows together.
//
// How a series is recognised — forgiving on purpose, because entries are typed
// by hand, late, and never quite the same way twice:
//   1. Entries are bucketed by direction + category, then by note — but notes
//      only have to *mean* the same thing (see Notes.swift). Who it was "with"
//      is dropped first; a bracketed tag ("Claude (taktekbot)") keeps a
//      payment apart from the untagged one of the same name.
//   2. A note can say how often it recurs — "Domain (yearly)" — and that hint
//      is taken at its word, even for a single entry. "Subscription" /
//      "membership" says it recurs without saying how often: the dates
//      decide, monthly until they can. A domain name is yearly. "(ended)" on
//      the latest entry stops it.
//   3. Otherwise a series needs a few entries whose spacing fits one cadence —
//      two for monthly and yearly, three for the short ones — with slack for
//      a late log and for one skipped log in between. Entries within
//      `mergeDays` of each other count as one occurrence.
//   4. A payment that stops, stops showing: once a whole period has passed
//      beyond its due date with nothing logged, it's gone. A longer break
//      splits the series — what comes after starts over as a new series.
//   5. Each amount is compared to the price it followed. Within
//      `samePriceTolerance` it's the same price; a bigger jump (up to
//      `priceChangeTolerance`) is a price change, but only after the old price
//      had held for two entries. An entry that fits neither is an odd one out
//      and left out, as long as those stay a minority. When the note vouched
//      for the series, the amounts are taken as they come. The latest amount
//      is reported as the current price.
// Anything money-valued here is wrong while the device is locked (masked rows
// carry amountCents: 0); callers check `anyMasked` first.

enum Recurring {
    /// Entries this close together (in days) are one occurrence.
    static let mergeDays = 2
    /// ±10% of the price before it is the same price.
    static let samePriceTolerance = 0.1
    /// A price change may move up to ±50%.
    static let priceChangeTolerance = 0.5
}

private let dayInterval: TimeInterval = 24 * 60 * 60

/// Nominal spacing per cadence, and the window of day-gaps that still counts —
/// wide enough for "the 1st" vs "the 3rd", a log that's a couple of days late,
/// or February.
private struct CadenceSpec {
    let cadence: Cadence
    let days: Int
    let min: Int
    let max: Int
}

private let cadenceSpecs: [CadenceSpec] = [
    CadenceSpec(cadence: .weekly, days: 7, min: 5, max: 9),
    CadenceSpec(cadence: .biweekly, days: 14, min: 12, max: 16),
    CadenceSpec(cadence: .monthly, days: 30, min: 24, max: 37),
    CadenceSpec(cadence: .yearly, days: 365, min: 350, max: 380),
]

private func spec(_ cadence: Cadence) -> CadenceSpec {
    // swiftlint:disable:next force_unwrapping
    cadenceSpecs.first { $0.cadence == cadence }!
}

extension Cadence {
    var label: String {
        switch self {
        case .weekly: return "Weekly"
        case .biweekly: return "Every 2 weeks"
        case .monthly: return "Monthly"
        case .yearly: return "Yearly"
        }
    }
}

struct RecurringPayment: Identifiable, Hashable, Sendable {
    var id: String { key }
    /// "\(isIncome):\(category):\(normalized note)" — the bucket key, stable across renders.
    let key: String
    /// Stored category id, for icon/label/color lookups.
    let category: String
    let isIncome: Bool
    /// The latest note in the series, hint removed (nil when none).
    let note: String?
    let cadence: Cadence
    /// The cadence came from a hint in the note, not the dates.
    let fromNote: Bool
    /// The current price, in home cents.
    let amountCents: Int
    /// The price before the last change, if any.
    let previousAmountCents: Int?
    /// The current price, normalised to a per-month figure.
    let monthlyCents: Int
    /// How many times it has been logged since the series (re)started.
    let count: Int
    /// Oldest occurrence of the live series.
    let firstAt: Date
    /// Newest occurrence.
    let lastAt: Date
    /// lastAt + the cadence's nominal spacing.
    let nextDueAt: Date
    /// nextDueAt is already behind `now`.
    let overdue: Bool
    /// Every entry of the live series, newest first.
    let rows: [Transaction]
}

struct RecurringSummary: Hashable, Sendable {
    /// Outgoings first, then income; nearest due first.
    let payments: [RecurringPayment]
    /// What the recurring outgoings add up to per month.
    let monthlyOutCents: Int
    /// And the recurring income.
    let monthlyInCents: Int
    /// Some row is obscured (locked device): money is a lie.
    let anyMasked: Bool
}

/// Whole days between two dates, rounded like JS `Math.round` (`jsRound`, Currency.swift).
private func daysBetween(_ a: Date, _ b: Date) -> Int {
    jsRound(b.timeIntervalSince(a) / dayInterval)
}

private func median(_ values: [Int]) -> Double {
    let sorted = values.sorted()
    let mid = sorted.count / 2
    return sorted.count % 2 == 1
        ? Double(sorted[mid])
        : Double(sorted[mid - 1] + sorted[mid]) / 2
}

/// The cadence the typical gap points at: the one whose window holds the
/// median gap, or failing that the one it fits twice over (a series with a
/// skipped log here and there). Nil when no cadence comes close.
func pickCadence(_ gapsInDays: [Int]) -> Cadence? {
    if gapsInDays.isEmpty { return nil }
    let m = median(gapsInDays)
    for c in cadenceSpecs where m >= Double(c.min) && m <= Double(c.max) { return c.cadence }
    for c in cadenceSpecs where m >= Double(2 * c.min) && m <= Double(2 * c.max) { return c.cadence }
    return nil
}

/// Do the gaps keep to the cadence? Every gap must fit its window once or
/// twice over (one skipped log), and at least half must fit it once —
/// otherwise "every 14 days" would read as weekly-with-skips.
func fitsCadence(_ cadence: Cadence, _ gapsInDays: [Int]) -> Bool {
    let c = spec(cadence)
    var once = 0
    for g in gapsInDays {
        if g >= c.min && g <= c.max {
            once += 1
        } else if g < 2 * c.min || g > 2 * c.max {
            return false
        }
    }
    return once * 2 >= gapsInDays.count
}

/// The cadence the gaps fit, or nil when the spacing is irregular.
func cadenceOf(_ gapsInDays: [Int]) -> Cadence? {
    guard let cadence = pickCadence(gapsInDays), fitsCadence(cadence, gapsInDays) else { return nil }
    return cadence
}

/// How many occurrences it takes before the dates alone make a series.
func minOccurrences(_ cadence: Cadence) -> Int {
    cadence == .weekly || cadence == .biweekly ? 3 : 2
}

/// A break longer than this, in days, ends a series at that cadence: what
/// comes after starts over as a new one. It's the longest gap a skipped log
/// could explain.
func breakAfterDays(_ cadence: Cadence) -> Int {
    2 * spec(cadence).max
}

/// How long, in days, a series stays alive after its last entry: one full
/// period beyond the latest date the next entry could still be on time.
func aliveForDays(_ cadence: Cadence) -> Int {
    let c = spec(cadence)
    return c.days + c.max
}

/// A per-month figure for one occurrence at the given cadence.
func monthlyEquivalent(_ cents: Int, _ cadence: Cadence) -> Int {
    switch cadence {
    case .weekly: return jsRound(Double(cents * 52) / 12)
    case .biweekly: return jsRound(Double(cents * 26) / 12)
    case .monthly: return cents
    case .yearly: return jsRound(Double(cents) / 12)
    }
}

struct PriceTrack: Hashable, Sendable {
    /// The latest amount that belongs to the series.
    let current: Int
    /// The price before the last change, if any.
    let previous: Int?
    /// Per amount: part of the series, or an odd one out.
    let kept: [Bool]
}

/// Walk the amounts oldest-first and decide whether they behave like one
/// payment: steady, with the odd price change once the old price has held.
/// An amount that fits neither is an odd one out and skipped. Returns nil
/// when the odd ones out are as many as the rest — that's noise, not a payment.
func priceTrack(_ amounts: [Int]) -> PriceTrack? {
    guard let first = amounts.first else { return nil }
    var level = first // the price this stretch started at
    var held = 1 // entries at this price so far
    var previous: Int?
    var current = first
    var kept = [true]
    for a in amounts.dropFirst() {
        let diff = Double(abs(a - level))
        if diff <= Double(level) * Recurring.samePriceTolerance {
            held += 1
        } else if diff <= Double(level) * Recurring.priceChangeTolerance && held >= 2 {
            previous = level
            level = a
            held = 1
        } else {
            kept.append(false)
            continue
        }
        kept.append(true)
        current = a
    }
    let outliers = kept.filter { !$0 }.count
    if outliers * 2 >= kept.count { return nil }
    return PriceTrack(current: current, previous: previous, kept: kept)
}

/// The prices of a series the note vouched for: taken as they come, the
/// latest as the current price and the last one that differed as "previous".
private func pricesAsGiven(_ amounts: [Int]) -> PriceTrack? {
    guard let current = amounts.last else { return nil }
    var previous: Int?
    for a in amounts.dropLast().reversed()
    where Double(abs(a - current)) > Double(current) * Recurring.samePriceTolerance {
        previous = a
        break
    }
    return PriceTrack(current: current, previous: previous, kept: amounts.map { _ in true })
}

private struct Occurrence {
    let at: Date
    var rows: [Transaction]
}

/// Occurrences of a sorted series: consecutive entries within `mergeDays` fold
/// into one, so a double log doesn't break the rhythm. Each keeps its rows.
private func occurrencesOf(_ asc: [Transaction]) -> [Occurrence] {
    var out: [Occurrence] = []
    for r in asc {
        if let prev = out.last, daysBetween(prev.at, r.occurredAt) <= Recurring.mergeDays {
            out[out.count - 1].rows.append(r)
        } else {
            out.append(Occurrence(at: r.occurredAt, rows: [r]))
        }
    }
    return out
}

/// Days between consecutive occurrences.
private func gapsOf(_ occurrences: [Occurrence]) -> [Int] {
    zip(occurrences, occurrences.dropFirst()).map { daysBetween($0.at, $1.at) }
}

/// Group a bucket's rows by note meaning: every pair of distinct notes that
/// match (`namesMatch`) is joined, so "Netflix" / "netflix sub" / "Netlfix" end
/// up together, while "Claude (taktekbot)" keeps to itself. Notes with nothing
/// left after the hint is removed form their own group and never join a named
/// one. Groups come back in order of their first row.
private func clusterByNote(_ rows: [Transaction]) -> [[Transaction]] {
    // The same name written twice is one node in the union-find below; a name
    // and its tag together are what makes it the same.
    var seen: [String: Int] = [:]
    var distinct: [NoteName] = []
    var node: [Int] = []
    for r in rows {
        let n = noteName(r.note)
        let key = n.tag + "\u{0}" + n.normalized
        if let i = seen[key] {
            node.append(i)
        } else {
            distinct.append(n)
            seen[key] = distinct.count - 1
            node.append(distinct.count - 1)
        }
    }
    var parent = Array(distinct.indices)
    func find(_ i: Int) -> Int {
        var root = i
        while parent[root] != root { root = parent[root] }
        var c = i
        while parent[c] != root {
            let next = parent[c]
            parent[c] = root
            c = next
        }
        return root
    }
    for i in distinct.indices {
        for j in distinct.indices where j > i && namesMatch(distinct[i], distinct[j]) {
            let rj = find(j)
            let ri = find(i)
            parent[rj] = ri
        }
    }
    var order: [Int] = []
    var groups: [Int: [Transaction]] = [:]
    for (k, r) in rows.enumerated() {
        let root = find(node[k])
        if groups[root] == nil {
            order.append(root)
            groups[root] = [r]
        } else {
            groups[root]?.append(r)
        }
    }
    return order.compactMap { groups[$0] }
}

/// Detect the recurring payments in `rows` for one user. Rows belonging to any
/// other user id are ignored outright, so the result is always "this user's",
/// whatever the caller hands in.
func detectRecurring(_ rows: [Transaction], userId: String, now: Date = Date()) -> RecurringSummary {
    var bucketOrder: [String] = []
    var buckets: [String: [Transaction]] = [:]
    var anyMasked = false
    for r in rows where r.userId == userId {
        if r.amountMask != nil { anyMasked = true }
        let key = "\(r.isIncome):\(r.category)"
        if buckets[key] == nil {
            bucketOrder.append(key)
            buckets[key] = [r]
        } else {
            buckets[key]?.append(r)
        }
    }

    var payments: [RecurringPayment] = []
    for bucketKey in bucketOrder {
        guard let bucket = buckets[bucketKey] else { continue }
        for group in clusterByNote(bucket) {
            // Oldest first; ties keep their input order (JS sort is stable).
            let sorted = group.enumerated().sorted { x, y in
                if x.element.occurredAt != y.element.occurredAt {
                    return x.element.occurredAt < y.element.occurredAt
                }
                return x.offset < y.offset
            }.map(\.element)
            let parsed = sorted.map { parseNote($0.note) }

            // The user's own word wins: the latest cadence hint sets the
            // cadence; "subscription" / "membership" says it recurs and leaves
            // the dates to say how often (monthly until they can). Either way a
            // hinted entry recurs even if it's the only one so far, and its
            // amounts are taken as they come.
            let cadenceHint = parsed.last { $0.cadence != nil }?.cadence
            let recurringHint = parsed.contains { $0.recurring }
            let hinted = cadenceHint != nil || recurringHint

            // The cadence, from everything logged: the typical gap is robust to
            // the odd entry, and knowing it tells a break from a skipped log.
            let all = occurrencesOf(sorted)
            let allGaps = gapsOf(all)
            guard let cadence = cadenceHint ?? pickCadence(allGaps) ?? (recurringHint ? Cadence.monthly : nil)
            else { continue }

            // A break too long for a skipped log splits the series; only what
            // comes after the last break is the live series.
            var start = 0
            for (i, g) in allGaps.enumerated() where g > breakAfterDays(cadence) {
                start = i + 1
            }
            let segment = all[start...].flatMap(\.rows)

            // Then the amounts of the live series: the odd ones out ("Muay Thai
            // water" among the monthly "Muay Thai") are left out of it.
            let amounts = segment.map(\.amountCents)
            guard let price = hinted ? pricesAsGiven(amounts) : priceTrack(amounts) else { continue }
            let liveRows = zip(segment, price.kept).filter { $0.1 }.map { $0.0 }
            let live = occurrencesOf(liveRows)
            if !hinted && (live.count < minOccurrences(cadence) || !fitsCadence(cadence, gapsOf(live))) {
                continue
            }

            // Stopped: the latest entry says so, or a whole period has passed
            // beyond its due date with nothing logged.
            guard let last = live.last, let first = liveRows.first, let latest = liveRows.last else {
                continue
            }
            let latestNote = parseNote(latest.note)
            if latestNote.ended { continue }
            if daysBetween(last.at, now) > aliveForDays(cadence) { continue }

            let noteText = latestNote.text
            let nextDue = last.at.addingTimeInterval(Double(spec(cadence).days) * dayInterval)

            payments.append(RecurringPayment(
                key: "\(bucketKey):\(normalizeNote(noteText))",
                category: first.category,
                isIncome: first.isIncome,
                note: noteText.isEmpty ? nil : noteText,
                cadence: cadence,
                fromNote: cadenceHint != nil,
                amountCents: price.current,
                previousAmountCents: price.previous,
                monthlyCents: monthlyEquivalent(price.current, cadence),
                count: live.count,
                firstAt: first.occurredAt,
                lastAt: last.at,
                nextDueAt: nextDue,
                overdue: nextDue < now,
                rows: liveRows.reversed()
            ))
        }
    }

    // Outgoings before income (that's what people come here to check), and
    // within each, the one due soonest on top. Ties keep their order.
    let ordered = payments.enumerated().sorted { x, y in
        let a = x.element
        let b = y.element
        if a.isIncome != b.isIncome { return !a.isIncome }
        if a.nextDueAt != b.nextDueAt { return a.nextDueAt < b.nextDueAt }
        return x.offset < y.offset
    }.map(\.element)

    var monthlyOutCents = 0
    var monthlyInCents = 0
    for p in ordered {
        if p.isIncome {
            monthlyInCents += p.monthlyCents
        } else {
            monthlyOutCents += p.monthlyCents
        }
    }

    return RecurringSummary(
        payments: ordered,
        monthlyOutCents: monthlyOutCents,
        monthlyInCents: monthlyInCents,
        anyMasked: anyMasked
    )
}
