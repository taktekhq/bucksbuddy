import Charts
import SwiftUI

/// The one screen that matters: the running balance, the add form, and
/// today's entries. Mirrors src/screens/Home.tsx.
struct HomeView: View {
    @Environment(MoneyStore.self) private var store
    @Binding var path: [Route]

    @State private var editing: Transaction?
    @State private var deleting: Transaction?
    /// The safe balance is private by default — tap the eye to reveal it.
    @State private var safeShown = false

    private var todays: [Transaction] {
        store.transactions.filter { Dates.isToday($0.occurredAt) }
    }

    private var hasSavings: Bool { store.safeTotalCents > 0 || store.safeGoldGrams > 0 }

    var body: some View {
        List {
            Section {
                hero
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }

            Section {
                if store.locked {
                    Button { path.append(.settings) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "lock.fill")
                                .foregroundStyle(Theme.labelSecondary)
                                .frame(width: 36, height: 36)
                                .background(Theme.grouped, in: Circle())
                            Text("Locked — enter your passphrase in Settings to view and add.")
                                .font(.subheadline)
                                .foregroundStyle(Theme.label)
                        }
                    }
                } else {
                    ComposerView()
                        .padding(.vertical, 8)
                }
            } header: {
                SectionHeader("What's up, Doc?").padding(.horizontal, -8)
            }

            Section {
                if store.loading && store.transactions.isEmpty {
                    HStack { Spacer(); ProgressView(); Spacer() }.padding(.vertical, 24)
                } else if todays.isEmpty {
                    Text(store.transactions.isEmpty
                         ? "Nothin' here yet, Doc. Add your first one above."
                         : "Nothin' today, Doc.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.labelSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(todays) { tx in
                        TransactionRowView(tx: tx, currency: store.homeCurrency)
                            .entryActions(tx, onEdit: { editing = $0 }, onDelete: { deleting = $0 })
                    }
                }
            } header: {
                HStack {
                    SectionHeader("History").padding(.horizontal, -8)
                    Spacer()
                    if !store.transactions.isEmpty {
                        Button("Recurring") { path.append(.recurring) }
                        Button("Show all") { path.append(.history) }
                            .padding(.leading, 8)
                    }
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.carrot)
                .textCase(nil)
            }

            if let err = store.loadError {
                Section {
                    Label(err, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Theme.danger)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background {
            LinearGradient(
                colors: [hasSavings ? Color(hex: "#E6F8EE") : Theme.canvas, Theme.canvas],
                startPoint: .top, endPoint: UnitPoint(x: 0.5, y: 0.35)
            )
            .ignoresSafeArea()
            .animation(.easeInOut(duration: 0.5), value: hasSavings)
        }
        .refreshable { await store.refresh() }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                HStack(spacing: 8) {
                    Carrot(size: 22)
                    Wordmark(size: 12)
                }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                navIcon("chart.bar.xaxis", "Spending review") { path.append(.review) }
                navIcon("bubble.left.and.text.bubble.right", "Send feedback") { path.append(.feedback) }
                navIcon("lock.shield", "Safe") { path.append(.safe) }
                navIcon("gearshape", "Settings") { path.append(.settings) }
            }
        }
        .entryEditing(editing: $editing, deleting: $deleting, store: store)
    }

    private func navIcon(_ symbol: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(Theme.labelSecondary)
        }
        .accessibilityLabel(label)
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 16) {
            Button { path.append(.stats) } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        NetTotal(cents: store.balanceCents, label: "Balance",
                                 currency: store.homeCurrency, masked: store.locked)
                        Text(Dates.monthLabel())
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.labelSecondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Theme.labelMuted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityHint("See your stats")

            safeRow
        }
        .padding(20)
        .frame(minHeight: 188)
        .background {
            ZStack {
                Theme.surface
                if !store.locked { SparkArea(values: Stats.dailySpendSeries(store.transactions, days: 30).map(\.totalCents)) }
            }
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 2)
        }
    }

    private var safeRow: some View {
        let reveal = safeShown && !store.locked
        return HStack(spacing: 12) {
            Button { path.append(.safe) } label: {
                HStack(spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .foregroundStyle(Theme.income)
                        .frame(width: 36, height: 36)
                        .background(Theme.income.opacity(0.15), in: Circle())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("IN THE SAFE")
                            .font(.system(size: 11, weight: .semibold))
                            .tracking(0.5)
                            .foregroundStyle(Theme.income)
                        HStack(spacing: 12) {
                            Label(reveal ? Money.format(store.safeTotalCents, store.homeCurrency) : "••••",
                                  systemImage: "banknote")
                                .font(.numeric(19))
                                .foregroundStyle(Theme.income)
                            Label(reveal ? Gold.format(store.safeGoldGrams) : "•••", systemImage: "circle.hexagongrid.fill")
                                .font(.numeric(14))
                                .foregroundStyle(Theme.goldInk)
                        }
                        .labelStyle(TightLabelStyle())
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())

            Button { withAnimation { safeShown.toggle() } } label: {
                Image(systemName: reveal ? "eye.slash" : "eye")
                    .foregroundStyle(Theme.income.opacity(0.7))
            }
            .buttonStyle(.plain)
            .disabled(store.locked)
            .accessibilityLabel(reveal ? "Hide safe balance" : "Show safe balance")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.income.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
    }
}

struct TightLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 4) {
            configuration.icon.font(.system(size: 13, weight: .semibold))
            configuration.title
        }
    }
}

/// The last 30 days of spending, washed faintly behind the hero.
struct SparkArea: View {
    let values: [Int]
    var stroke: Color = Theme.carrot.opacity(0.4)
    var fill: Color = Theme.carrot.opacity(0.1)

    var body: some View {
        if values.contains(where: { $0 > 0 }) {
            Chart(Array(values.enumerated()), id: \.offset) { point in
                AreaMark(x: .value("Day", point.offset), y: .value("Spent", Double(point.element)))
                    .foregroundStyle(fill)
                    .interpolationMethod(.catmullRom)
                LineMark(x: .value("Day", point.offset), y: .value("Spent", Double(point.element)))
                    .foregroundStyle(stroke)
                    .lineStyle(StrokeStyle(lineWidth: 2))
                    .interpolationMethod(.catmullRom)
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .chartLegend(.hidden)
            .chartYScale(domain: 0...(Double(values.max() ?? 1) * 1.6))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}
