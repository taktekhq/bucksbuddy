import SwiftUI

/// The full history: a day-by-day timeline (runs of the same category stack)
/// or everything folded by category. Swipe to edit or delete, pull to refresh,
/// search by note or category. Mirrors src/screens/History.tsx.
struct HistoryView: View {
    @Environment(MoneyStore.self) private var store
    @AppStorage("historyMode") private var mode: Mode = .timeline
    @State private var query = ""
    @State private var editing: Transaction?
    @State private var deleting: Transaction?

    enum Mode: String { case timeline, category }

    private var rows: [Transaction] {
        let q = normalizeNote(query)
        guard !q.isEmpty else { return store.transactions }
        return store.transactions.filter {
            normalizeNote(Categories.label($0.category)).contains(q)
                || normalizeNote($0.note ?? "").contains(q)
        }
    }

    var body: some View {
        List {
            Section {
                PillToggle(
                    options: [(Mode.timeline, "Timeline", "calendar"), (Mode.category, "By category", "square.stack.3d.up")],
                    selection: $mode,
                    activeText: { _ in Theme.label }
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }

            if rows.isEmpty {
                Text(query.isEmpty ? "Nothin' here yet, Doc." : "No entries match “\(query)”.")
                    .foregroundStyle(Theme.labelSecondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                    .listRowBackground(Color.clear)
            } else if mode == .timeline {
                ForEach(HistoryGrouping.byDay(rows)) { day in
                    Section {
                        ForEach(day.groups) { group in
                            HistoryGroupRow(group: group, currency: store.homeCurrency,
                                            onEdit: { editing = $0 }, onDelete: { deleting = $0 })
                        }
                    } header: {
                        HStack {
                            Text(day.label)
                            Spacer()
                            Text(day.masked ? "•••" : Money.formatSigned(day.totalCents, store.homeCurrency))
                                .font(.numeric(13, weight: .semibold))
                                .foregroundStyle(day.masked ? Theme.labelSecondary : Theme.netColor(day.totalCents))
                        }
                        .textCase(nil)
                        .font(.system(size: 13, weight: .semibold))
                    }
                }
            } else {
                Section {
                    ForEach(HistoryGrouping.byCategory(rows)) { group in
                        HistoryGroupRow(group: group, currency: store.homeCurrency, showDates: true,
                                        onEdit: { editing = $0 }, onDelete: { deleting = $0 })
                    }
                }
            }

            if store.transactions.count >= Stats.fetchCap {
                Text("Showing your latest \(Stats.fetchCap) entries. Export from Settings for everything.")
                    .font(.footnote)
                    .foregroundStyle(Theme.labelSecondary)
                    .listRowBackground(Color.clear)
            } else if !rows.isEmpty {
                Text("That's all, folks. 🥕")
                    .font(.footnote)
                    .foregroundStyle(Theme.labelSecondary)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.canvas.ignoresSafeArea())
        .searchable(text: $query, prompt: "Search notes & categories")
        .refreshable { await store.refresh() }
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .entryEditing(editing: $editing, deleting: $deleting, store: store)
    }
}

// MARK: - Recurring

/// The subscriptions, rent, salary and other entries that keep coming back,
/// found from the history on the device (Recurring.swift). Read-only.
struct RecurringView: View {
    @Environment(MoneyStore.self) private var store
    @AppStorage("recurringView") private var side: Side = .monthly

    enum Side: String { case monthly, yearly }

    private func sideOf(_ p: RecurringPayment) -> Side { p.cadence == .yearly ? .yearly : .monthly }
    private func perPeriod(_ p: RecurringPayment) -> Int { p.cadence == .yearly ? p.amountCents : p.monthlyCents }

    var body: some View {
        let summary = detectRecurring(store.transactions, userId: store.userId)
        let masked = store.locked || summary.anyMasked
        let shown = summary.payments.filter { sideOf($0) == side }
        let outgoings = shown.filter { !$0.isIncome }
        let income = shown.filter(\.isIncome)
        let period = side == .yearly ? "year" : "month"

        ScrollView {
            VStack(spacing: 20) {
                if masked {
                    DarkCard {
                        Label("These entries are encrypted. Enter your passphrase in Settings to see them.",
                              systemImage: "lock.fill")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.85))
                    }
                } else {
                    PillToggle(
                        options: [(Side.monthly, "Monthly", nil), (Side.yearly, "Yearly", nil)],
                        selection: $side,
                        activeFill: { _ in .white.opacity(0.18) },
                        activeText: { _ in .white },
                        inactiveText: .white.opacity(0.55),
                        track: .black.opacity(0.25)
                    )

                    if shown.isEmpty {
                        DarkCard {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Nothin' recurring yet, Doc.").font(.headline).foregroundStyle(.white)
                                Text(side == .yearly
                                     ? "Log a yearly renewal twice, or put “(yearly)” or a domain name in the note, and it shows up here."
                                     : "Log the same entry twice on a regular schedule — weekly, every two weeks or monthly — and it shows up here. Or put “(monthly)” in the note and it counts right away.")
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.6))
                            }
                        }
                    } else {
                        HStack(spacing: 10) {
                            totalTile("Going out", outgoings.reduce(0) { $0 + perPeriod($1) }, isIncome: false, period: period)
                            totalTile("Coming in", income.reduce(0) { $0 + perPeriod($1) }, isIncome: true, period: period)
                        }
                        if !outgoings.isEmpty { sideSection("Going out", outgoings, period: period) }
                        if !income.isEmpty { sideSection("Coming in", income, period: period) }
                    }
                }
            }
            .padding(16)
        }
        .roomBackground(Theme.Night.background, floor: Theme.Night.floor)
        .navigationTitle("Recurring")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarBackground(Theme.Night.top, for: .navigationBar)
    }

    private func totalTile(_ title: String, _ cents: Int, isIncome: Bool, period: String) -> some View {
        DarkCard(padding: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .semibold)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.55))
                Text((isIncome ? "+" : "-") + Money.format(cents, store.homeCurrency))
                    .font(.numeric(20))
                    .foregroundStyle(Theme.amountColor(isIncome: isIncome))
                    .minimumScaleFactor(0.6).lineLimit(1)
                Text("per \(period)").font(.caption).foregroundStyle(.white.opacity(0.45))
            }
        }
    }

    private func sideSection(_ title: String, _ payments: [RecurringPayment], period: String) -> some View {
        var order: [String] = []
        var groups: [String: [RecurringPayment]] = [:]
        for p in payments {
            if groups[p.category] == nil { order.append(p.category) }
            groups[p.category, default: []].append(p)
        }
        let blocks = order
            .map { category -> RecurringBlock in
                let list = groups[category] ?? []
                return RecurringBlock(category: category, payments: list,
                                      total: list.reduce(0) { sum, p in sum + perPeriod(p) })
            }
            .sorted { $0.total > $1.total }

        return VStack(alignment: .leading, spacing: 14) {
            SectionHeader(title, color: .white.opacity(0.6))
            ForEach(blocks, id: \.category) { block in
                VStack(spacing: 6) {
                    HStack(spacing: 10) {
                        Image(systemName: Categories.symbol(block.category))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.categoryColor(block.category))
                            .frame(width: 28, height: 28)
                            .background(Theme.categoryColor(block.category).opacity(0.2), in: Circle())
                        Text(Categories.label(block.category))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.85))
                        Spacer()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text((block.payments[0].isIncome ? "+" : "-") + Money.format(block.total, store.homeCurrency))
                                .font(.numeric(14, weight: .semibold))
                                .foregroundStyle(Theme.amountColor(isIncome: block.payments[0].isIncome))
                            Text("per \(period)").font(.system(size: 11)).foregroundStyle(.white.opacity(0.45))
                        }
                    }
                    ForEach(block.payments) { p in
                        PaymentCard(payment: p, currency: store.homeCurrency)
                    }
                }
            }
        }
    }
}

private struct RecurringBlock {
    let category: String
    let payments: [RecurringPayment]
    let total: Int
}

private struct PaymentCard: View {
    let payment: RecurringPayment
    let currency: String
    @State private var open = false

    var body: some View {
        let name = payment.note ?? Categories.label(payment.category)
        let due = payment.overdue
            ? "was due \(Dates.shortDay(payment.nextDueAt))"
            : "next \(Dates.shortDay(payment.nextDueAt))"
        VStack(spacing: 0) {
            Button { withAnimation(.snappy) { open.toggle() } } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(.system(size: 16, weight: .medium)).foregroundStyle(.white).lineLimit(1)
                        Text("\(payment.cadence.label) · \(due)")
                            .font(.caption)
                            .foregroundStyle(payment.overdue ? Theme.carrotLight : .white.opacity(0.55))
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text((payment.isIncome ? "+" : "-") + Money.format(payment.amountCents, currency))
                            .font(.numeric(16, weight: .medium))
                            .foregroundStyle(Theme.amountColor(isIncome: payment.isIncome))
                        Text(payment.previousAmountCents.map { "was \(Money.format($0, currency))" }
                             ?? "\(payment.count) \(payment.count == 1 ? "time" : "times")")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.45))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())

            if open {
                Divider().overlay(.white.opacity(0.1))
                ForEach(payment.rows) { tx in
                    HStack {
                        Text(Dates.shortDay(tx.occurredAt)).foregroundStyle(.white.opacity(0.7))
                        Spacer()
                        Text(Money.format(tx.amountCents, currency)).font(.numeric(14, weight: .medium))
                            .foregroundStyle(.white.opacity(0.85))
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
        }
        .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
    }
}
