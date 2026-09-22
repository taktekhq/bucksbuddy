import Foundation

// Grouping for the full-history page. Two shapes (mirrors src/lib/history.ts):
//
//   • Timeline — reverse-chronological, split into day sections (each with
//     its own net), where only back-to-back entries in the same direction +
//     category collapse into a stack.
//   • By category — every entry of the same direction + category collapses
//     into one stack across all days.

struct HistoryGroup: Identifiable, Hashable {
    /// Unique per group on screen (a run key can repeat within a day).
    let id: String
    /// "\(isIncome):\(category)" — direction plus the full stored id.
    let key: String
    let category: String
    let isIncome: Bool
    var rows: [Transaction] // newest first
    var count: Int { rows.count }
    var totalCents: Int { netCents(rows) }
    var masked: Bool { rows.contains { $0.isMasked } }
    var latestAt: Date { rows.first?.occurredAt ?? .distantPast }
}

struct TimelineDay: Identifiable, Hashable {
    var id: String { key }
    let key: String
    let label: String
    var groups: [HistoryGroup]
    var totalCents: Int { netCents(groups.flatMap(\.rows)) }
    var masked: Bool { groups.contains { $0.masked } }
}

enum HistoryGrouping {
    private static func newestFirst(_ rows: [Transaction]) -> [Transaction] {
        rows.enumerated()
            .sorted { $0.element.occurredAt != $1.element.occurredAt
                ? $0.element.occurredAt > $1.element.occurredAt
                : $0.offset < $1.offset }
            .map(\.element)
    }

    static func byCategory(_ rows: [Transaction]) -> [HistoryGroup] {
        var order: [String] = []
        var buckets: [String: [Transaction]] = [:]
        for r in rows {
            let key = "\(r.isIncome):\(r.category)"
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: []].append(r)
        }
        return order.map { key -> HistoryGroup in
            let sorted = newestFirst(buckets[key]!)
            return HistoryGroup(id: key, key: key, category: sorted[0].category,
                                isIncome: sorted[0].isIncome, rows: sorted)
        }
        .sorted { $0.latestAt > $1.latestAt }
    }

    static func byDay(_ rows: [Transaction], now: Date = Date()) -> [TimelineDay] {
        var days: [TimelineDay] = []
        for r in newestFirst(rows) {
            let dkey = Dates.dayKey(r.occurredAt)
            if days.last?.key != dkey {
                days.append(TimelineDay(key: dkey, label: Dates.dayLabel(r.occurredAt, now: now), groups: []))
            }
            let runKey = "\(r.isIncome):\(r.category)"
            if days[days.count - 1].groups.last?.key == runKey {
                let g = days[days.count - 1].groups.count - 1
                days[days.count - 1].groups[g].rows.append(r)
            } else {
                days[days.count - 1].groups.append(
                    HistoryGroup(id: "\(dkey):\(r.id)", key: runKey, category: r.category,
                                 isIncome: r.isIncome, rows: [r]))
            }
        }
        return days
    }
}
