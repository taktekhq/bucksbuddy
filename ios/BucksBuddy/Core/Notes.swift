import Foundation

// Notes are free text typed in a hurry, so two notes about the same thing are
// rarely identical: "Netflix", "netflix ", "Netflix sub", "Netlfix". This
// module is the one place that decides when two notes mean the same thing —
// used by the recurring-payments detector to fold such entries together, and
// by the composer to suggest past notes so they stop drifting in the first
// place. Plain string matching, on the device: no model, nothing leaves.
//
// A note can also carry a cadence hint — "Domain (yearly)", "gym monthly" —
// which the detector takes as the user's word on how often it recurs. The hint
// is peeled off here so it never gets in the way of matching. Brackets that
// are left over once the hints are gone are a tag — "Claude (taktekbot)" —
// which does the opposite: it keeps that one apart from the plain "Claude".
//
// Mirrors src/lib/notes.ts. The patterns are ICU (NSRegularExpression) spelled
// to behave like the JavaScript originals: `\b` is the ASCII word boundary JS
// uses (ICU's own `\b` counts accented letters as word characters), `\s` is
// JS's whitespace set, and lengths / edit distances count UTF-16 units like JS
// string indexing does.

enum Cadence: String, CaseIterable, Codable, Hashable, Sendable {
    case weekly, biweekly, monthly, yearly
}

// MARK: - Patterns

private enum NotePatterns {
    /// JavaScript's `\s`, as the contents of a character class.
    static let wsChars = #"\t\n\u000B\f\r    -     　﻿"#
    static let ws = "[\(wsChars)]"
    /// JavaScript's (non-unicode) `\b`: a boundary between [A-Za-z0-9_] and
    /// anything else. Case-insensitivity is switched off inside it so ICU's
    /// case folding can't widen the ASCII class (e.g. to the Kelvin sign).
    static let b = #"(?-i:(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_])))"#

    static func re(_ pattern: String, caseInsensitive: Bool = false) -> NSRegularExpression {
        // The patterns are constants: failing to compile one is a programming error.
        // swiftlint:disable:next force_try
        try! NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : [])
    }

    /// A hint word, wrapped in the brackets it usually comes in.
    static func bracketed(_ words: String) -> NSRegularExpression {
        re(#"[(\[]?"# + ws + "*" + b + "(" + words + ")" + b + ws + "*" + #"[)\]]?"#, caseInsensitive: true)
    }

    // Order matters: "biweekly" has to be tried before "weekly". Each pattern
    // also eats the brackets it's usually wrapped in and any dangling separator.
    static let hints: [(cadence: Cadence, re: NSRegularExpression)] = [
        (.biweekly, bracketed("bi-?weekly|fortnightly|every (?:2|two) weeks")),
        (.weekly, bracketed("weekly|every week|per week|a week")),
        (.monthly, bracketed("monthly|every month|per month|a month")),
        (.yearly, bracketed("yearly|annual(?:ly)?|every year|per year|a year")),
    ]

    // Words that say "this one comes back" without saying how often. Read,
    // then dropped from the text, so "Claude subscription" and a later plain
    // "Claude" are the same series — the word is a cheat code, not the name.
    static let recurringWords = re(b + "(subscriptions?|memberships?)" + b, caseInsensitive: true)

    // A domain name renews yearly: "domain" in the note, or a hostname in it
    // ("sillyguy.com"), says so without a hint. The hostname stays — it's the
    // name — while the word "domain" is dropped like the other cheat codes.
    static let domainWord = re(b + "(domains?)" + b, caseInsensitive: true)
    static let hostname = re(
        b + #"[a-z0-9\-]+\.(?:com|net|org|io|dev|ai|app|co|me|xyz|sh|lb)"# + b,
        caseInsensitive: true
    )

    // "Framer subscription (ended)": the series stops here. Read, then dropped.
    static let endedWords = bracketed("ended|cancel{1,2}ed|stopped|final")

    // "Dinner with Sara": who it was with is not what it was. Everything from
    // "with" on is dropped before notes are compared. (JS `.` and `$` without
    // the m flag: any non-line-terminator, then the very end of the input.)
    static let withSuffix = re(b + "with" + b + #"[^\n\r  ]*\z"#, caseInsensitive: true)

    // "Claude (taktekbot)", "Netflix (Sara's)": brackets left over once the
    // cheat codes have been peeled off are a *tag* — which one of them this is.
    // The tag stays in the text too, because it's part of the name on screen.
    static let tag = re(#"[(\[]([^)\]]*)[)\]]"#)

    static let wsRun = re(ws + "+")
    static let edgePunctuation = re("^[\(wsChars)\\-–—:,.]+|[\(wsChars)\\-–—:,.]+\\z")
    static let edgeSpaces = re(#"^ +| +\z"#)
    static let marks = re(#"\p{M}+"#)
    static let nonWord = re(#"[^\p{L}\p{N}]+"#)
}

private func fullRange(_ s: String) -> NSRange {
    NSRange(location: 0, length: (s as NSString).length)
}

/// JS `re.test(s)` for a non-global pattern.
private func test(_ re: NSRegularExpression, _ s: String) -> Bool {
    re.firstMatch(in: s, range: fullRange(s)) != nil
}

/// JS `s.replace(re, with)` for a non-global pattern: the first match only.
private func replaceFirst(_ re: NSRegularExpression, in s: String, with replacement: String) -> String {
    guard let m = re.firstMatch(in: s, range: fullRange(s)) else { return s }
    return (s as NSString).replacingCharacters(in: m.range, with: replacement)
}

/// JS `s.replace(re, with)` for a global pattern: every match.
private func replaceAll(_ re: NSRegularExpression, in s: String, with replacement: String) -> String {
    re.stringByReplacingMatches(
        in: s,
        range: fullRange(s),
        withTemplate: NSRegularExpression.escapedTemplate(for: replacement)
    )
}

/// JS `s.length`: UTF-16 code units.
private func jsLength(_ s: String) -> Int { s.utf16.count }

/// JS `haystack.includes(needle)`: code-unit substring search ("" is in everything).
private func jsIncludes(_ haystack: String, _ needle: String) -> Bool {
    if needle.isEmpty { return true }
    return (haystack as NSString).range(of: needle, options: .literal).location != NSNotFound
}

// MARK: - Parsing

struct ParsedNote: Hashable, Sendable {
    /// The note with the hints and "with …" removed, whitespace collapsed.
    var text: String
    /// The cadence the note implies: a hint word, or yearly for a domain name.
    var cadence: Cadence?
    /// The note says it comes back (subscription, membership, a domain).
    var recurring: Bool
    /// The note says this was the last one.
    var ended: Bool
    /// The bracketed tag(s) left in the text, normalized ("" when there are none).
    var tag: String
}

/// Split a raw note into its text and the hints it may carry.
func parseNote(_ raw: String?) -> ParsedNote {
    var text = raw ?? ""
    var cadence: Cadence?
    for h in NotePatterns.hints where test(h.re, text) {
        cadence = h.cadence
        text = replaceFirst(h.re, in: text, with: " ")
        break
    }
    let domain = test(NotePatterns.domainWord, text) || test(NotePatterns.hostname, text)
    let recurring = test(NotePatterns.recurringWords, text) || domain
    let ended = test(NotePatterns.endedWords, text)
    // The hints are read first: "Netflix with Ali (monthly)" keeps its cadence.
    text = replaceFirst(NotePatterns.recurringWords, in: text, with: " ")
    text = replaceFirst(NotePatterns.domainWord, in: text, with: " ")
    text = replaceFirst(NotePatterns.endedWords, in: text, with: " ")
    text = replaceFirst(NotePatterns.withSuffix, in: text, with: " ")
    text = replaceAll(NotePatterns.wsRun, in: text, with: " ")
    text = replaceAll(NotePatterns.edgePunctuation, in: text, with: "")
    // Whatever brackets survived all that name *which* one this is.
    let ns = text as NSString
    let tag = NotePatterns.tag
        .matches(in: text, range: fullRange(text))
        .map { normalizeNote(ns.substring(with: $0.range(at: 1))) }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
    return ParsedNote(
        text: text,
        cadence: cadence ?? (domain ? .yearly : nil),
        recurring: recurring,
        ended: ended,
        tag: tag
    )
}

// Words that say nothing about *what* the payment is, so sharing one of them
// must not make two notes match ("Netflix bill" vs "gym bill").
private let stopwords: Set<String> = [
    "the", "and", "for", "with", "from", "this", "that", "per", "pay", "paid",
    "payment", "bill", "bills", "fee", "fees", "sub", "subs", "subscription",
    "subscriptions", "membership", "memberships", "month", "months", "year",
    "years", "week", "weeks", "new", "old", "one",
]

/// Lowercase, accents stripped, punctuation folded to spaces.
func normalizeNote(_ text: String) -> String {
    var s = text.decomposedStringWithCanonicalMapping
    s = replaceAll(NotePatterns.marks, in: s, with: "")
    s = s.lowercased()
    s = replaceAll(NotePatterns.nonWord, in: s, with: " ")
    return replaceAll(NotePatterns.edgeSpaces, in: s, with: "")
}

/// The meaningful words of a normalized note.
func noteTokens(_ normalized: String) -> [String] {
    normalized
        .split(separator: " ")
        .map(String.init)
        .filter { jsLength($0) >= 3 && !stopwords.contains($0) }
}

/// Damerau–Levenshtein (optimal string alignment) distance: the edits —
/// insert, delete, replace, or swap two neighbours — that turn `a` into `b`.
/// Counted over UTF-16 units, like the JS original.
func editDistance(_ a: String, _ b: String) -> Int {
    let a = Array(a.utf16)
    let b = Array(b.utf16)
    var d = Array(repeating: Array(repeating: 0, count: b.count + 1), count: a.count + 1)
    for i in 0...a.count { d[i][0] = i }
    for j in 0...b.count { d[0][j] = j }
    for i in stride(from: 1, through: a.count, by: 1) {
        for j in stride(from: 1, through: b.count, by: 1) {
            let cost = a[i - 1] == b[j - 1] ? 0 : 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
            }
        }
    }
    return d[a.count][b.count]
}

enum Notes {
    /// One slip — a missed, extra, wrong or swapped letter — is a typo. Two is
    /// a different word ("lunch" / "brunch", "spotify" / "shopify").
    static let typoDistance = 1
    /// Only words long enough to carry a typo qualify; short ones are a slip
    /// away from anything.
    static let typoMinLength = 4
}

private func isTypoOf(_ a: String, _ b: String) -> Bool {
    let la = jsLength(a)
    let lb = jsLength(b)
    return la >= Notes.typoMinLength
        && lb >= Notes.typoMinLength
        && abs(la - lb) <= Notes.typoDistance
        && editDistance(a, b) <= Notes.typoDistance
}

/// Do two normalized notes mean the same thing? Yes when they're equal, when
/// at least half their meaningful words are shared (a typo apart counts as
/// shared — "Canva" / "Canva for family", "Netlfix" / "Netflix"), or when the
/// whole notes are a typo apart. One shared word out of many is not enough:
/// "Claude" and "Claude extra credits" are different things. Two empty notes
/// match each other; an empty note matches nothing else.
func notesMatch(_ a: String, _ b: String) -> Bool {
    if a == b { return true }
    if a.isEmpty || b.isEmpty { return false }
    let ta = noteTokens(a)
    let tb = noteTokens(b)
    var used = Set<Int>()
    var shared = 0
    for w in ta {
        let j = tb.indices.first { k in
            !used.contains(k) && (tb[k] == w || isTypoOf(w, tb[k]))
        }
        if let j {
            used.insert(j)
            shared += 1
        }
    }
    // Jaccard ≥ ½: shared / (|a| + |b| − shared).
    if shared > 0 && 2 * shared >= ta.count + tb.count - shared { return true }
    return isTypoOf(a, b)
}

/// A note reduced to what it is compared by: its name, and the tag on it.
struct NoteName: Hashable, Sendable {
    /// The whole name, normalized — the tag's words included.
    var normalized: String
    /// The bracketed tag, normalized ("" when there is none).
    var tag: String
}

/// Everything `namesMatch` needs from a raw note.
func noteName(_ raw: String?) -> NoteName {
    let parsed = parseNote(raw)
    return NoteName(normalized: normalizeNote(parsed.text), tag: parsed.tag)
}

/// Is every word of `tag` in `other`? The brackets themselves are not required
/// of the other note — "Claude (taktekbot)" and a later "Claude taktekbot" are
/// still the same thing — and a typo in the tag is forgiven like anywhere else.
/// Words too short to be tokens count here: "Sara (1)" and "Sara (2)" differ by
/// nothing else.
private func tagHolds(_ tag: String, _ other: String) -> Bool {
    if tag.isEmpty { return true }
    let words = other.split(separator: " ").map(String.init)
    return tag
        .split(separator: " ")
        .map(String.init)
        .allSatisfy { w in words.contains { v in v == w || isTypoOf(w, v) } }
}

/// Do two notes name the same payment? Their words have to mostly agree
/// (`notesMatch`), *and* a bracketed tag on either side has to turn up in the
/// other. The tag is there precisely to tell this one from that one, so
/// "Claude (taktekbot)" stays apart from the plain "Claude".
func namesMatch(_ a: NoteName, _ b: NoteName) -> Bool {
    if !tagHolds(a.tag, b.normalized) || !tagHolds(b.tag, a.normalized) { return false }
    return notesMatch(a.normalized, b.normalized)
}

/// Past notes worth offering while typing a new one: the distinct notes already
/// used in this direction + category (the exact one — Fees · Subscriptions
/// doesn't borrow from Fees · Bank), most recent first, narrowed to those
/// containing what's been typed so far. What's typed exactly is left out —
/// there's nothing to tap for.
func noteSuggestions(
    _ rows: [Transaction],
    isIncome: Bool,
    category: String,
    query: String,
    limit: Int = 6
) -> [String] {
    let query = normalizeNote(query)
    var seen = Set<String>()
    var out: [String] = []
    // Newest first; ties keep their input order (JS sort is stable).
    let sorted = rows.enumerated().sorted { x, y in
        if x.element.occurredAt != y.element.occurredAt {
            return x.element.occurredAt > y.element.occurredAt
        }
        return x.offset < y.offset
    }.map(\.element)
    for r in sorted {
        if r.isIncome != isIncome || r.category != category { continue }
        let text = replaceAll(
            NotePatterns.edgeSpaces,
            in: replaceAll(NotePatterns.wsRun, in: r.note ?? "", with: " "),
            with: ""
        )
        if text.isEmpty { continue }
        let norm = normalizeNote(text)
        if seen.contains(norm) || norm == query || !jsIncludes(norm, query) { continue }
        seen.insert(norm)
        out.append(text)
        if out.count >= limit { break }
    }
    return out
}
