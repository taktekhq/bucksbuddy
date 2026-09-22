import Charts
import SwiftUI

// The review: this account's own spending, charted, in its own calm blue room.
// The iOS twin of src/screens/Review.tsx + src/components/ReviewBreakdown.tsx.
//
// Every figure here is this device's: the rows come back as ciphertext, are
// decrypted by the store and totalled in Core/ReviewDigest.swift. Nothing is
// sent anywhere to produce any of it.
//
// One read of the whole account (the store's `transactions` is capped, and an
// all-time total has to see every row); "Recent months" is a slice of it.
//
// Charts in this room are coloured by RANK, never by category (see
// docs/DESIGN_SYSTEM.md): several category colours are the exact greens and
// reds that mean money in and money out. Every ranked row also carries an
// icon, a label and a figure, so hue is never the only carrier.

struct ReviewView: View {
    @Environment(MoneyStore.self) private var store

    /// Pinned on appear: both windows end "now".
    @State private var now = Date()
    @State private var period: ReviewPeriod = .recent
    @State private var result: Computed?
    @State private var loadFailed = false
    @State private var bySubcategory = false

    /// Both digests and the fixed costs, built once off the main actor.
    private struct Computed: Sendable {
        let recent: SpendingDigest
        let allTime: SpendingDigest
        let recurring: RecurringSummary
        let isEmpty: Bool

        init(rows: [Transaction], now: Date, userId: String) {
            let first = ReviewPeriod.firstEntry(rows)
            recent = SpendingDigest.build(rows, window: ReviewPeriod.recent.window(now: now, firstEntryAt: first))
            allTime = SpendingDigest.build(rows, window: ReviewPeriod.allTime.window(now: now, firstEntryAt: first))
            recurring = detectRecurring(rows, userId: userId, now: now)
            isEmpty = rows.isEmpty
        }

        func digest(_ period: ReviewPeriod) -> SpendingDigest {
            period == .recent ? recent : allTime
        }
    }

    private typealias P = Theme.Review
    private static let periodOptions: [(value: ReviewPeriod, label: String, symbol: String?)] = [
        (value: .recent, label: ReviewPeriod.recent.label, symbol: nil),
        (value: .allTime, label: ReviewPeriod.allTime.label, symbol: nil),
    ]
    private static let topRows = 6
    /// The single-series ink (month bars, day strip, weekdays).
    private static let ink = Theme.Review.ramp[1]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .foregroundStyle(P.text)
        .environment(\.colorScheme, .dark)
        .roomBackground(P.background, floor: P.ink)
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(P.top, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task(id: loadKey) { await load() }
    }

    // MARK: Loading

    private var loadKey: String { "\(store.locked)|\(store.loading)" }

    private func load() async {
        guard !store.locked, !store.loading, result == nil else { return }
        loadFailed = false
        let now = self.now
        guard let rows = await store.reviewRange(from: Date(timeIntervalSince1970: 0), to: now) else {
            loadFailed = true
            return
        }
        let userId = store.userId
        let computed = await Task.detached(priority: .userInitiated) {
            Computed(rows: rows, now: now, userId: userId)
        }.value
        result = computed
    }

    // MARK: States

    @ViewBuilder
    private var content: some View {
        if store.locked {
            lockedState
        } else if let result {
            if result.isEmpty {
                message(icon: "chart.bar.xaxis", "Nothing logged yet. Your review fills in from your first entry.")
            } else {
                PillToggle(
                    options: Self.periodOptions,
                    selection: $period,
                    activeFill: { _ in P.tile },
                    activeText: { _ in P.text },
                    inactiveText: P.muted,
                    track: .white.opacity(0.05)
                )
                breakdown(result.digest(period), recurring: result.recurring)
                    .id(period)
                Text("Every figure here was worked out on this device, from what you logged.")
                    .font(.caption)
                    .foregroundStyle(P.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        } else if loadFailed {
            VStack(spacing: 12) {
                message(icon: "exclamationmark.triangle", "Couldn't read your entries on this device.")
                Button("Try again") { Task { await load() } }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.carrotLight)
            }
        } else {
            VStack(spacing: 12) {
                ProgressView().tint(P.muted)
                Text("Adding up your entries…").font(.subheadline).foregroundStyle(P.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 80)
        }
    }

    private var lockedState: some View {
        DarkCard(fill: P.card) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "lock.fill").foregroundStyle(P.muted)
                    Text("Your amounts are locked on this device. Unlock in Settings to see your review.")
                        .font(.system(size: 15))
                }
                // Carrot words after dark use carrotLight.
                NavigationLink(value: Route.settings) {
                    Text("Open Settings").font(.system(size: 15, weight: .semibold))
                }
                .foregroundStyle(Theme.carrotLight)
            }
        }
    }

    private func message(icon: String, _ text: String) -> some View {
        DarkCard(fill: P.card) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: icon).foregroundStyle(P.muted)
                Text(text).font(.system(size: 15)).foregroundStyle(P.muted)
            }
        }
    }

    // MARK: Breakdown

    @ViewBuilder
    private func breakdown(_ d: SpendingDigest, recurring: RecurringSummary) -> some View {
        hero(d)
        months(d)
        categories(d)
        saving(d)
        fixedCosts(recurring)
        movers(d)
        biggest(d)
        weekdays(d)
        completeness(d)
    }

    private func money(_ cents: Int) -> String { Money.format(cents, store.homeCurrency) }
    private func signed(_ cents: Int) -> String { Money.formatSigned(cents, store.homeCurrency) }

    /// "$1.2k" for an axis label.
    private func compact(_ cents: Int) -> String {
        let units = Double(cents) / 100
        let prefix = Money.symbolPrefix(store.homeCurrency)
        switch abs(units) {
        case 1_000_000...: return prefix + String(format: "%.1fM", units / 1_000_000)
        case 1000...: return prefix + String(format: "%.1fk", units / 1000)
        default: return prefix + String(format: "%.0f", units)
        }
    }

    private static func pct(_ value: Double) -> String {
        value == value.rounded() ? String(format: "%.0f%%", value) : String(format: "%.1f%%", value)
    }

    private static func plural(_ n: Int, _ one: String, _ many: String) -> String {
        "\(n) \(n == 1 ? one : many)"
    }

    private static func rankColor(_ rank: Int) -> Color {
        rank < Theme.Review.ramp.count ? Theme.Review.ramp[rank] : Theme.Review.muted.opacity(0.4)
    }

    // The window at a glance.
    private func hero(_ d: SpendingDigest) -> some View {
        DarkCard(fill: P.card) {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(d.window.label).font(.caption).foregroundStyle(P.muted)
                    Text(money(d.spentCents))
                        .font(.numeric(34, weight: .heavy))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    Text("spent over \(Self.plural(d.days, "day", "days")) · \(money(d.dailyAverageCents)) a day")
                        .font(.caption)
                        .foregroundStyle(P.muted)
                }
                HStack(spacing: 8) {
                    Tile(label: "In", value: money(d.incomeCents))
                    Tile(label: "Left", value: signed(d.netCents))
                    Tile(label: "Put away", value: signed(d.saving.netIntoSafeCents))
                }
                if d.daily.count > 1 {
                    Divider().overlay(Color.white.opacity(0.1))
                    HStack {
                        Text("Day by day")
                        Spacer()
                        Text("busiest \(money(d.daily.map(\.cents).max() ?? 0))").font(.numeric(11, weight: .regular))
                    }
                    .font(.system(size: 11))
                    .foregroundStyle(P.muted)
                    Chart(d.daily) { day in
                        AreaMark(x: .value("Day", day.date), y: .value("Spent", day.cents))
                            .foregroundStyle(Self.ink.opacity(0.18))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("Day", day.date), y: .value("Spent", day.cents))
                            .foregroundStyle(Self.ink)
                            .lineStyle(StrokeStyle(lineWidth: 1.5))
                            .interpolationMethod(.monotone)
                    }
                    .chartXAxis(.hidden)
                    .chartYAxis(.hidden)
                    .frame(height: 48)
                    .accessibilityLabel("Spending per day")
                }
            }
        }
    }

    // Month by month, each month carrying how many of its days are in the window.
    @ViewBuilder
    private func months(_ d: SpendingDigest) -> some View {
        if d.months.count >= 2, let last = d.months.last {
            let caption: String? = last.isWhole ? nil :
                "\(last.label) is \(Self.plural(last.days, "day", "days")) in, so its bar is faded — it isn't a smaller month yet. It's running at \(money(last.dailyAverageCents)) a day."
            let every = max(1, Int((Double(d.months.count) / 6).rounded(.up)))
            Panel(title: "Month by month", caption: caption) {
                Chart(d.months) { m in
                    BarMark(x: .value("Month", m.start, unit: .month), y: .value("Spent", m.spentCents))
                        .foregroundStyle(Self.ink.opacity(m.isWhole ? 1 : 0.4))
                        .cornerRadius(3)
                        .accessibilityLabel(m.label)
                        .accessibilityValue("\(money(m.spentCents)) over \(Self.plural(m.days, "day", "days"))")
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month, count: every)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated), centered: true)
                            .foregroundStyle(P.muted)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                        AxisGridLine().foregroundStyle(Color.white.opacity(0.08))
                        AxisValueLabel {
                            if let cents = value.as(Int.self) { Text(compact(cents)) }
                        }
                        .foregroundStyle(P.muted)
                    }
                }
                .frame(height: 160)
            }
        }
    }

    // Where it went: ranked horizontal bars.
    @ViewBuilder
    private func categories(_ d: SpendingDigest) -> some View {
        let source = bySubcategory && !d.subcategories.isEmpty ? d.subcategories : d.categories
        let top = Array(source.prefix(Self.topRows))
        if let lead = top.first {
            // Headroom past the widest bar for its trailing figure.
            let domainMax = max(top.map(\.spentCents).max() ?? 1, 1) * 3 / 2
            Panel(
                title: "Where it went",
                caption: "\(lead.label) is \(Self.pct(lead.sharePct)) of everything spent, at \(money(lead.averageEntryCents)) an entry across \(lead.count)."
            ) {
                if !d.subcategories.isEmpty {
                    Picker("Breakdown", selection: $bySubcategory) {
                        Text("Categories").tag(false)
                        Text("Subcategories").tag(true)
                    }
                    .pickerStyle(.segmented)
                }
                Chart(top) { c in
                    BarMark(x: .value("Spent", c.spentCents), y: .value("Category", c.id))
                        .foregroundStyle(Self.rankColor(c.rank))
                        .cornerRadius(4)
                        .annotation(position: .trailing, alignment: .leading, spacing: 6) {
                            Text(money(c.spentCents))
                                .font(.numeric(12))
                                .foregroundStyle(P.text)
                        }
                        .accessibilityLabel(c.label)
                        .accessibilityValue("\(money(c.spentCents)), \(Self.pct(c.sharePct))")
                }
                .chartXScale(domain: 0...domainMax)
                .chartXAxis(.hidden)
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let id = value.as(String.self) {
                                HStack(spacing: 6) {
                                    Image(systemName: Categories.symbol(id))
                                    Text(Categories.label(id)).lineLimit(1)
                                }
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(P.text)
                            }
                        }
                    }
                }
                .frame(height: CGFloat(top.count) * 36)
            }
        }
    }

    // What reached the Safe, and what merely went unspent.
    @ViewBuilder
    private func saving(_ d: SpendingDigest) -> some View {
        let s = d.saving
        if !(s.isEmpty && d.incomeCents == 0) {
            let caption: String = {
                guard let saved = s.savedSharePct, let left = s.leftOverSharePct else {
                    return "No income logged in this window, so there's no share to take of it."
                }
                return "\(Self.pct(saved)) of what came in reached the Safe. \(Self.pct(left)) went unspent — the gap is money that stayed in the open."
            }()
            Panel(title: "Saving", caption: caption) {
                HStack(spacing: 8) {
                    Tile(label: "Into the Safe", value: money(s.intoSafeCents))
                    Tile(label: "Back out", value: money(s.outOfSafeCents))
                    Tile(label: "Net", value: signed(s.netIntoSafeCents))
                }
                Text("Moving money to the Safe is a transfer, so it's neither spending nor income anywhere else on this screen.")
                    .font(.system(size: 13))
                    .foregroundStyle(P.muted)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(P.tile, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    // Subscriptions, rent and the like, found from the notes you typed.
    @ViewBuilder
    private func fixedCosts(_ recurring: RecurringSummary) -> some View {
        let payments = recurring.payments.filter { !$0.isIncome }
        if !recurring.anyMasked, !payments.isEmpty {
            let top = Array(payments.sorted { $0.monthlyCents > $1.monthlyCents }.prefix(Self.topRows))
            let monthlyOut = payments.reduce(0) { $0 + $1.monthlyCents }
            Panel(
                title: "Fixed costs",
                caption: "\(Self.plural(payments.count, "repeating payment", "repeating payments")), \(money(monthlyOut)) a month between them. Detected from your own notes, which never leave this phone."
            ) {
                VStack(spacing: 10) {
                    ForEach(Array(top.enumerated()), id: \.element.id) { rank, p in
                        HStack(spacing: 12) {
                            RankIcon(symbol: Categories.symbol(p.category), color: Self.rankColor(rank))
                            VStack(alignment: .leading, spacing: 1) {
                                Text(p.note ?? Categories.label(p.category))
                                    .font(.system(size: 14, weight: .semibold))
                                    .lineLimit(1)
                                Text(fixedCostDetail(p))
                                    .font(.system(size: 11))
                                    .foregroundStyle(P.muted)
                            }
                            Spacer(minLength: 8)
                            Text(money(p.amountCents)).font(.numeric(14))
                        }
                    }
                }
            }
        }
    }

    private func fixedCostDetail(_ p: RecurringPayment) -> String {
        var parts = [p.cadence.label, "×\(p.count)"]
        if let was = p.previousAmountCents { parts.append("was \(money(was))") }
        return parts.joined(separator: " · ")
    }

    // What moved: first whole month against the last whole one.
    @ViewBuilder
    private func movers(_ d: SpendingDigest) -> some View {
        if let names = d.changeMonths, !d.changes.isEmpty {
            Panel(
                title: "What moved",
                caption: "\(names.first) against \(names.last) — the first and last whole months in this window. A month still running is left out rather than scaled."
            ) {
                VStack(spacing: 10) {
                    ForEach(d.changes.prefix(Self.topRows)) { c in
                        HStack(spacing: 10) {
                            // Colourless on purpose: a category going down is
                            // neither money in nor necessarily good news.
                            Image(systemName: Self.arrow(c.direction))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(P.muted)
                                .frame(width: 16)
                            Text(c.label)
                                .font(.system(size: 14, weight: .semibold))
                                .lineLimit(1)
                            Spacer(minLength: 6)
                            Text("\(money(c.firstCents)) → \(money(c.lastCents))")
                                .font(.numeric(11, weight: .regular))
                                .foregroundStyle(P.muted)
                                .lineLimit(1)
                            Text(Self.changeText(c))
                                .font(.numeric(14))
                                .frame(minWidth: 52, alignment: .trailing)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    private static func arrow(_ direction: SpendingDigest.Direction) -> String {
        switch direction {
        case .up: return "arrow.up.right"
        case .down: return "arrow.down.right"
        case .flat: return "minus"
        case .new: return "plus"
        }
    }

    private static func changeText(_ c: SpendingDigest.Change) -> String {
        guard let pct = c.changePct else { return "new" }
        return (pct > 0 ? "+" : "") + Self.pct(pct)
    }

    // The biggest single entries, dated by when they were logged.
    @ViewBuilder
    private func biggest(_ d: SpendingDigest) -> some View {
        if !d.largestExpenses.isEmpty {
            Panel(
                title: "Biggest single entries",
                caption: "Typical entry: \(money(d.medianExpenseCents)). Average: \(money(d.averageExpenseCents))."
            ) {
                VStack(spacing: 10) {
                    ForEach(Array(d.largestExpenses.enumerated()), id: \.element.id) { rank, e in
                        HStack(spacing: 12) {
                            RankIcon(symbol: Categories.symbol(e.category), color: Self.rankColor(rank))
                            Text(e.label).font(.system(size: 14)).lineLimit(1)
                            Spacer(minLength: 8)
                            Text(Dates.dayLabel(e.date, now: now))
                                .font(.system(size: 11))
                                .foregroundStyle(P.muted)
                            Text(money(e.amountCents)).font(.numeric(14))
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    // The weekday split — of LOGGING, since entries are stamped when typed.
    @ViewBuilder
    private func weekdays(_ d: SpendingDigest) -> some View {
        if d.weekdays.contains(where: { $0.spentCents > 0 }) {
            Panel(
                title: "Logged on",
                caption: "\(Self.pct(d.weekendSharePct)) of it was logged at the weekend. These are the days entries were typed, not necessarily the days money moved."
            ) {
                Chart(d.weekdays) { day in
                    BarMark(x: .value("Weekday", day.label), y: .value("Spent", day.spentCents))
                        .foregroundStyle(Self.ink)
                        .cornerRadius(3)
                        .accessibilityValue(money(day.spentCents))
                }
                .chartYAxis(.hidden)
                .chartXAxis {
                    AxisMarks { _ in
                        AxisValueLabel().foregroundStyle(P.muted)
                    }
                }
                .frame(height: 110)
            }
        }
    }

    // How complete the logging is — the easiest thing on this screen to misread.
    private func completeness(_ d: SpendingDigest) -> some View {
        let c = d.coverage
        let caption = c.longestGapDays > 0
            ? "\(money(d.dailyAverageCents)) a day across every day, \(money(d.perLoggedDayAverageCents)) across the days with entries. The longest stretch with nothing logged was \(Self.plural(c.longestGapDays, "day", "days")) — anything spent then isn't in these figures."
            : "Every day in the window has something logged, so nothing is missing from these figures."
        return Panel(title: "How complete this is", caption: caption) {
            HStack(spacing: 8) {
                Tile(label: "Days logged", value: "\(c.daysLogged)/\(c.days)")
                Tile(label: "Entries", value: "\(d.entryCount)")
                Tile(label: "No-spend days", value: "\(c.daysWithNoSpending)")
            }
            ProgressView(value: min(max(c.coveragePct / 100, 0), 1))
                .tint(Theme.carrot)
                .accessibilityLabel("Days with entries")
            if let busy = c.busiestDay {
                Text("Busiest day of logging: \(Dates.dayLabel(busy.date, now: now)), \(Self.plural(busy.count, "entry", "entries")) totalling \(money(busy.cents)).")
                    .font(.caption)
                    .foregroundStyle(P.muted)
            }
        }
    }
}

// MARK: - Room pieces

/// A section in the review room: a muted Grobold header over a card.
private struct Panel<Content: View>: View {
    let title: String
    var caption: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title, color: Theme.Review.muted)
            DarkCard(fill: Theme.Review.card) {
                VStack(alignment: .leading, spacing: 12) {
                    content
                    if let caption {
                        Text(caption)
                            .font(.caption)
                            .foregroundStyle(Theme.Review.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }
}

/// A figure pill on the review tile colour.
private struct Tile: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 11))
                .foregroundStyle(Theme.Review.muted)
                .lineLimit(1)
            Text(value)
                .font(.numeric(15))
                .foregroundStyle(Theme.Review.text)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Review.tile, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// A category icon tinted with its RANK colour, not its category colour.
private struct RankIcon: View {
    let symbol: String
    let color: Color

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(color)
            .frame(width: 32, height: 32)
            .background(color.opacity(0.15), in: Circle())
    }
}
