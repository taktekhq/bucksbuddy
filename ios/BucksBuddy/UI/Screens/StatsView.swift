import Charts
import Supabase
import SwiftUI

/// Your month in numbers, in the observatory indigo: the spend with its daily
/// rhythm, six months of bars, where it goes, fun facts, and the community
/// counts. Mirrors src/screens/Stats.tsx.
struct StatsView: View {
    @Environment(MoneyStore.self) private var store
    @Binding var path: [Route]
    /// 0 = this month, -1 = last month, …
    @State private var monthOffset = 0

    private var anchor: Date { Dates.monthAnchor(monthOffset) }
    private var isCurrentMonth: Bool { monthOffset == 0 }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if store.locked || store.transactions.contains(where: \.isMasked) {
                    DarkCard {
                        Label("Your stats are encrypted. Enter your passphrase in Settings to see them.",
                              systemImage: "lock.fill")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.85))
                    }
                } else {
                    personal
                }
                CommunityStatsView()
            }
            .padding(16)
        }
        .roomBackground(Theme.Night.background, floor: Theme.Night.floor)
        .navigationTitle("Your Stats")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarBackground(Theme.Night.top, for: .navigationBar)
    }

    @ViewBuilder
    private var personal: some View {
        let rows = store.transactions
        let currency = store.homeCurrency
        let facts = Stats.monthInsights(rows, now: anchor)
        let series = isCurrentMonth ? Stats.dailySpendSeries(rows, days: 30)
                                    : Stats.monthSpendSeries(rows, anchor: anchor)
        let cats = Stats.topCategories(rows, limit: 6, now: anchor)
        let monthly = Stats.monthlySpendTotals(rows, months: 6)
        let completed = monthly.filter { !$0.isCurrent && $0.totalCents > 0 }
        let avgMonth = completed.isEmpty ? 0 : jsRound(Double(completed.reduce(0) { $0 + $1.totalCents }) / Double(completed.count))
        let lastMonth = monthly.first { $0.offset == -1 }?.totalCents ?? 0
        let hasOlder = rows.contains { $0.occurredAt < Dates.monthRange(anchor).from }
        let runwayDays = facts.avgPerDayCents > 0 ? jsRound(Double(store.safeTotalCents) / Double(facts.avgPerDayCents)) : 0

        // Month switcher.
        HStack {
            Button { monthOffset -= 1 } label: { Image(systemName: "chevron.left") }
                .disabled(!hasOlder)
            Spacer()
            Text(Dates.monthLabel(anchor))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
            Spacer()
            Button { monthOffset = min(monthOffset + 1, 0) } label: { Image(systemName: "chevron.right") }
                .disabled(isCurrentMonth)
        }
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Theme.carrot)
        .padding(.horizontal, 4)

        if rows.isEmpty || (facts.spendCount == 0 && facts.incomeCents == 0) {
            DarkCard {
                Text(rows.isEmpty ? "Nothin' to chart yet, Doc. Log a few entries and come back."
                                  : "Nothin' logged this month, Doc.")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            }
        } else {
            // Headline: the month so far, the daily rhythm behind it.
            DarkCard(padding: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Text((isCurrentMonth ? "Spent this month" : "Spent").uppercased())
                        .font(.system(size: 11, weight: .semibold)).tracking(0.5)
                        .foregroundStyle(.white.opacity(0.55))
                    Text(Money.format(facts.spentCents, currency))
                        .font(.numeric(40, weight: .heavy))
                        .foregroundStyle(.white)
                        .minimumScaleFactor(0.5).lineLimit(1)
                    Text("\(facts.spendCount) \(facts.spendCount == 1 ? "entry" : "entries") · \(Money.format(facts.avgPerDayCents, currency))/day")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.55))
                    DailyChart(series: series, currency: currency)
                        .frame(height: 110)
                        .padding(.top, 8)
                    Text(isCurrentMonth ? "Last 30 days" : "Day by day")
                        .font(.caption2).foregroundStyle(.white.opacity(0.4))
                }
            }
        }

        if monthly.contains(where: { $0.totalCents > 0 }) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader("Spending by month", color: .white.opacity(0.6))
                DarkCard {
                    VStack(spacing: 12) {
                        MonthlyBars(months: monthly, selectedOffset: monthOffset, currency: currency) { monthOffset = $0 }
                            .frame(height: 140)
                        HStack(spacing: 10) {
                            FactTile(caption: "Per month", value: avgMonth > 0 ? Money.format(avgMonth, currency) : "—",
                                     sub: completed.isEmpty ? nil : "avg of \(completed.count)")
                            FactTile(caption: "Last month", value: lastMonth > 0 ? Money.format(lastMonth, currency) : "—")
                        }
                    }
                }
            }
        }

        if !cats.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader("Where it goes", color: .white.opacity(0.6))
                DarkCard {
                    StatBars(items: cats.map { c in
                        StatBar(id: c.category, label: Categories.label(c.category), category: c.category,
                                value: Money.format(c.totalCents, currency),
                                fraction: Double(c.totalCents) / Double(max(cats[0].totalCents, 1)))
                    })
                }
            }
        }

        VStack(alignment: .leading, spacing: 8) {
            SectionHeader("Fun facts", color: .white.opacity(0.6))
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                FactTile(caption: "Biggest splurge",
                         value: facts.biggestExpense.map { Money.format($0.amountCents, currency) } ?? "—",
                         sub: facts.biggestExpense.map { [Categories.label($0.category), $0.note].compactMap { $0 }.joined(separator: " · ") })
                FactTile(caption: "Busiest day",
                         value: facts.busiestDay.map { "\($0.count) \($0.count == 1 ? "entry" : "entries")" } ?? "—",
                         sub: facts.busiestDay.map { "\(Dates.weekdayDayFormatter.string(from: $0.date)) · \(Money.format($0.totalCents, currency))" })
                FactTile(caption: "Safe runway",
                         value: isCurrentMonth && runwayDays > 0 ? runwayLabel(runwayDays) : "—",
                         sub: isCurrentMonth && runwayDays > 0 ? "at this pace" : nil)
                FactTile(caption: "On pace for",
                         value: isCurrentMonth && facts.forecastCents > 0 ? Money.format(facts.forecastCents, currency) : "—",
                         sub: isCurrentMonth && facts.forecastCents > 0 ? "by month's end" : nil)
                FactTile(caption: "Treat yourself",
                         value: facts.treatCents > 0 ? Money.format(facts.treatCents, currency) : "—",
                         action: isCurrentMonth && facts.treatCents > 0 ? { path.append(.receipts(.treats)) } : nil)
                FactTile(caption: "Weekend spend",
                         value: facts.weekendCents > 0 ? Money.format(facts.weekendCents, currency) : "—",
                         action: isCurrentMonth && facts.weekendCents > 0 ? { path.append(.receipts(.weekend)) } : nil)
                FactTile(caption: "Coffee runs", value: "\(facts.coffeeCount)")
                FactTile(caption: "No-spend days", value: "\(facts.noSpendDays)")
            }
            let flow = facts.incomeCents + facts.spentCents
            if flow > 0 {
                DarkCard(padding: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("IN VS OUT")
                            .font(.system(size: 11, weight: .semibold)).tracking(0.5)
                            .foregroundStyle(.white.opacity(0.55))
                        GeometryReader { geo in
                            HStack(spacing: 0) {
                                Theme.income.frame(width: geo.size.width * Double(facts.incomeCents) / Double(flow))
                                Theme.expense
                            }
                        }
                        .frame(height: 8)
                        .clipShape(Capsule())
                        HStack {
                            Text("+" + Money.format(facts.incomeCents, currency)).foregroundStyle(Theme.income)
                            Spacer()
                            Text("-" + Money.format(facts.spentCents, currency)).foregroundStyle(Theme.expense)
                        }
                        .font(.numeric(12, weight: .semibold))
                    }
                }
            }
        }
    }

    private func runwayLabel(_ days: Int) -> String {
        if days >= 60 { return String(format: "%.1f months", Double(days) / 30.44) }
        return "\(days) \(days == 1 ? "day" : "days")"
    }
}

// MARK: - Pieces

private struct DailyChart: View {
    let series: [Stats.DayPoint]
    let currency: String

    var body: some View {
        Chart(series) { p in
            AreaMark(x: .value("Day", p.date, unit: .day), y: .value("Spent", Double(p.totalCents) / 100))
                .foregroundStyle(LinearGradient(colors: [Theme.carrot.opacity(0.45), Theme.carrot.opacity(0.02)],
                                                startPoint: .top, endPoint: .bottom))
                .interpolationMethod(.monotone)
            LineMark(x: .value("Day", p.date, unit: .day), y: .value("Spent", Double(p.totalCents) / 100))
                .foregroundStyle(Theme.carrot)
                .interpolationMethod(.monotone)
        }
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: 7)) { _ in
                AxisValueLabel(format: .dateTime.day().month(.abbreviated))
                    .foregroundStyle(.white.opacity(0.45))
            }
        }
    }
}

private struct MonthlyBars: View {
    let months: [Stats.MonthSpend]
    let selectedOffset: Int
    let currency: String
    var onSelect: (Int) -> Void

    var body: some View {
        let top = Double(months.map(\.totalCents).max() ?? 1)
        HStack(alignment: .bottom, spacing: 10) {
            ForEach(months) { m in
                let active = m.offset == selectedOffset
                Button { onSelect(m.offset) } label: {
                    VStack(spacing: 6) {
                        GeometryReader { geo in
                            VStack {
                                Spacer(minLength: 0)
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(active ? Theme.carrot : .white.opacity(0.22))
                                    .frame(height: max(geo.size.height * Double(m.totalCents) / max(top, 1), geo.size.height * 0.03))
                            }
                        }
                        Text(m.label.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(active ? Theme.carrotLight : .white.opacity(0.5))
                    }
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("\(m.label): \(Money.format(m.totalCents, currency))")
            }
        }
    }
}

struct StatBar: Identifiable {
    let id: String
    let label: String
    let category: String
    let value: String
    let fraction: Double
}

/// Horizontal bars with the category chip, label and figure.
struct StatBars: View {
    let items: [StatBar]
    var body: some View {
        VStack(spacing: 12) {
            ForEach(items) { item in
                HStack(spacing: 10) {
                    CategoryIcon(category: item.category, size: 28)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(item.label).font(.subheadline.weight(.medium)).foregroundStyle(.white.opacity(0.9))
                            Spacer()
                            Text(item.value).font(.numeric(14, weight: .semibold)).foregroundStyle(.white)
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(.white.opacity(0.1))
                                Capsule().fill(Theme.categoryColor(item.category))
                                    .frame(width: max(geo.size.width * item.fraction, 4))
                            }
                        }
                        .frame(height: 6)
                    }
                }
            }
        }
    }
}

struct FactTile: View {
    let caption: String
    let value: String
    var sub: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(caption.uppercased())
                    .font(.system(size: 11, weight: .semibold)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.55))
                if action != nil {
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.carrotLight)
                }
            }
            Text(value)
                .font(.numeric(19))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.6).lineLimit(1)
            if let sub {
                Text(sub).font(.caption).foregroundStyle(.white.opacity(0.5)).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
        .padding(14)
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

        if let action {
            Button(action: action) { content }.buttonStyle(PressStyle())
        } else {
            content
        }
    }
}

// MARK: - Community

/// The public_stats() RPC: counts only — amounts are ciphertext, so there's
/// nothing money-shaped the server could total.
struct CommunityStatsView: View {
    struct PublicStats: Decodable, Sendable {
        let users: Int
        let transactions: Int
        let encrypted_users: Int
        let top_categories: [Top]?
        struct Top: Decodable, Sendable { let category: String; let count: Int }
    }

    @State private var stats: PublicStats?
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader("Across BucksBuddy", color: .white.opacity(0.6))
            if let stats {
                HStack(spacing: 10) {
                    FactTile(caption: "Wabbits", value: stats.users.formatted())
                    FactTile(caption: "Entries", value: stats.transactions.formatted())
                    FactTile(caption: "E2EE", value: stats.encrypted_users.formatted())
                }
                if let top = stats.top_categories, !top.isEmpty {
                    DarkCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("WHAT EVERYONE LOGS MOST")
                                .font(.system(size: 11, weight: .semibold)).tracking(0.5)
                                .foregroundStyle(.white.opacity(0.55))
                            StatBars(items: top.map { c in
                                StatBar(id: c.category, label: Categories.label(c.category), category: c.category,
                                        value: c.count.formatted(),
                                        fraction: Double(c.count) / Double(max(top[0].count, 1)))
                            })
                        }
                    }
                }
                Text("Counts only, amounts are encrypted. Nobody (including us) can total them. 🔒")
                    .font(.caption).foregroundStyle(.white.opacity(0.4)).padding(.horizontal, 4)
            } else {
                DarkCard {
                    Text(failed ? "Couldn't reach the community stats. Try again later." : "Counting carrots…")
                        .font(.subheadline).foregroundStyle(.white.opacity(0.55))
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .task {
            do {
                stats = try await supabase.rpc("public_stats").execute().value
            } catch {
                failed = true
            }
        }
    }
}

// MARK: - Receipts

/// The entries behind a tappable fun fact ("Treat yourself", "Weekend spend").
struct ReceiptsView: View {
    @Environment(MoneyStore.self) private var store
    let kind: ReceiptsKind

    var body: some View {
        let rows = kind == .treats ? Stats.treatTransactions(store.transactions)
                                   : Stats.weekendTransactions(store.transactions)
        List {
            Section {
                ForEach(rows) { tx in
                    TransactionRowView(tx: tx, currency: store.homeCurrency, showDate: true, dark: true)
                        .listRowBackground(Color.white.opacity(0.08))
                }
            } header: {
                HStack {
                    Text(kind == .treats ? "Fun, shopping & self care" : "Saturdays & Sundays")
                    Spacer()
                    Text(Money.format(rows.reduce(0) { $0 + $1.amountCents }, store.homeCurrency))
                        .font(.numeric(13, weight: .semibold))
                }
                .foregroundStyle(.white.opacity(0.6))
                .textCase(nil)
            }
        }
        .scrollContentBackground(.hidden)
        .roomBackground(Theme.Night.background, floor: Theme.Night.floor)
        .navigationTitle(kind == .treats ? "Treat yourself" : "Weekend spend")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarBackground(Theme.Night.top, for: .navigationBar)
    }
}
