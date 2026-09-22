import SwiftUI

/// The Safe: a dark green vault. Cash moved here is a normal transaction in
/// the "safe" category (so it leaves the spendable balance); gold is tracked
/// separately in grams, with a live price when one can be fetched.
/// Mirrors src/screens/Safe.tsx.
struct SafeView: View {
    @Environment(MoneyStore.self) private var store

    enum Asset: String { case cash, gold }

    @State private var asset: Asset = .cash
    @State private var isDeposit = true
    @State private var currency = ""
    @State private var display = ""
    @State private var note = ""
    @State private var saving = false
    @State private var error: String?
    @State private var goldUSDPerGram: Double?
    @State private var pendingDelete: Move?
    @State private var savedTick = 0

    struct Move: Identifiable {
        let id: String
        /// The row id in its own table.
        let rawId: String
        let asset: Asset
        let isDeposit: Bool
        let occurredAt: Date
        let note: String?
        var cents: Int = 0
        var grams: Double = 0
        var foreign: String?
        var mask: String?
    }

    private var isGold: Bool { asset == .gold }
    private var choices: [CurrencyRate] { store.currencyChoices }
    private var selected: CurrencyRate { choices.first { $0.code == currency } ?? choices[0] }
    private var isHome: Bool { selected.code == store.homeCurrency }
    private var amount: Double { Currencies.parseAmount(display) }
    private var cents: Int { Currencies.toHomeCents(amount, rate: selected.rate) }
    private var canSave: Bool { amount > 0 && !saving && !store.locked }

    /// The live gold price in home currency per gram — needs USD in the list.
    private var goldPerGramHome: Double? {
        guard let usd = goldUSDPerGram,
              let rate = Currencies.rate(for: "USD", home: store.homeCurrency, currencies: store.currencies)
        else { return nil }
        return usd / rate
    }

    private var movements: [Move] {
        let cash = store.transactions.filter { $0.category == Categories.safeId }.map { t in
            Move(id: "cash-\(t.id)", rawId: t.id, asset: .cash, isDeposit: !t.isIncome, occurredAt: t.occurredAt, note: t.note,
                 cents: t.amountCents, foreign: t.originalCurrency == store.homeCurrency ? nil : t.originalCurrency,
                 mask: t.amountMask)
        }
        let gold = store.safeGoldEntries.map { e in
            Move(id: "gold-\(e.id)", rawId: e.id, asset: .gold, isDeposit: e.isDeposit, occurredAt: e.occurredAt, note: e.note,
                 grams: e.grams, mask: e.gramsMask)
        }
        return (cash + gold).sorted { $0.occurredAt > $1.occurredAt }
    }

    private var actionColor: Color { isGold ? Theme.Vault.gold : isDeposit ? Theme.Vault.add : Theme.Vault.take }
    private var actionText: Color { isGold ? Theme.Vault.floor : .white }

    private var cta: String {
        if store.locked { return "Unlock in Settings to move money" }
        if saving { return "Saving…" }
        if amount <= 0 { return isGold ? "Enter an amount of gold" : "Enter an amount" }
        let label = isGold ? Gold.format(amount)
            : isHome ? Money.format(cents, store.homeCurrency)
            : "\(Money.formatPlain(amount, decimals: Currencies.info(selected.code).decimals)) \(selected.code)"
        return isDeposit ? "Add \(label) to safe" : "Take \(label) out"
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                totals
                composer
                history
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .roomBackground(Theme.Vault.background, floor: Theme.Vault.floor)
        .navigationTitle("The Safe")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbarBackground(Theme.Vault.top, for: .navigationBar)
        .tint(Theme.Vault.gold)
        .task { goldUSDPerGram = await Gold.fetchUSDPerGram() }
        .onAppear { if currency.isEmpty { currency = store.homeCurrency } }
        .confirmationDialog("Delete this safe movement?", isPresented: Binding(
            get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }
        ), titleVisibility: .visible, presenting: pendingDelete) { move in
            Button("Delete", role: .destructive) {
                Task {
                    if move.asset == .gold {
                        await store.deleteSafeGold(id: move.rawId)
                    } else {
                        await store.deleteTransaction(id: move.rawId)
                    }
                }
            }
        }
    }

    // MARK: Totals

    private var totals: some View {
        DarkCard(padding: 20) {
            VStack(alignment: .leading, spacing: 4) {
                Label("IN THE SAFE", systemImage: "lock.shield.fill")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
                caption("CASH", "banknote").padding(.top, 10)
                Text(store.locked ? Money.formatMasked("•••••", store.homeCurrency)
                                  : Money.formatSigned(store.safeTotalCents, store.homeCurrency))
                    .font(.numeric(36))
                    .foregroundStyle(store.safeTotalCents < 0 ? Color(hex: "#FF8A8A") : Theme.Vault.mint)
                    .minimumScaleFactor(0.5).lineLimit(1)
                caption("GOLD", "circle.hexagongrid.fill").padding(.top, 10)
                Text(store.locked ? "••••" : Gold.format(store.safeGoldGrams))
                    .font(.numeric(36))
                    .foregroundStyle(Theme.Vault.gold)
                Group {
                    if store.locked {
                        Text("Locked — unlock in Settings to see the safe.")
                    } else if let perGram = goldPerGramHome {
                        Text("≈ \(Money.format(jsRound(store.safeGoldGrams * perGram * 100), store.homeCurrency)) · \(Money.format(jsRound(perGram * 100), store.homeCurrency))/g (live)")
                    } else if Currencies.rate(for: "USD", home: store.homeCurrency, currencies: store.currencies) == nil {
                        Text("Tracked in grams — add USD in Settings to see a live value.")
                    } else {
                        Text("Tracked in grams — live price unavailable.")
                    }
                }
                .font(.caption)
                .foregroundStyle(.white.opacity(0.45))
                Text("Cash here is moved out of your spendable balance; gold is tracked separately in grams.")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.45))
                    .padding(.top, 10)
            }
        }
    }

    private func caption(_ title: String, _ symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.5)
            .foregroundStyle(.white.opacity(0.45))
    }

    // MARK: Composer

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader("Move money", color: .white.opacity(0.55))
            DarkCard {
                VStack(spacing: 12) {
                    PillToggle(
                        options: [(Asset.cash, "Cash", "banknote"), (Asset.gold, "Gold", "circle.hexagongrid.fill")],
                        selection: Binding(get: { asset }, set: { asset = $0; display = ""; error = nil }),
                        activeFill: { $0 == .gold ? Theme.Vault.gold : .white.opacity(0.15) },
                        activeText: { $0 == .gold ? Theme.Vault.floor : .white },
                        inactiveText: .white.opacity(0.55),
                        track: .black.opacity(0.25)
                    )
                    PillToggle(
                        options: [(true, "Add", "arrow.down.to.line"), (false, "Take out", "arrow.up.to.line")],
                        selection: $isDeposit,
                        activeFill: { _ in actionColor },
                        activeText: { _ in actionText },
                        inactiveText: .white.opacity(0.55),
                        track: .black.opacity(0.25)
                    )

                    HStack(spacing: 12) {
                        Text(isGold ? "g" : Currencies.symbol(selected.code))
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(isGold ? Theme.Vault.gold : Theme.Vault.mint)
                            .minimumScaleFactor(0.6)
                            .frame(width: 40, height: 40)
                            .background(.white.opacity(0.1), in: Circle())
                        TextField("", text: Binding(
                            get: { display },
                            set: { display = Money.sanitizeTyped($0.replacingOccurrences(of: ",", with: "."),
                                                                 decimals: isGold ? 3 : 2) }
                        ), prompt: Text(isGold ? "0.000" : "0.00").foregroundStyle(.white.opacity(0.3)))
                        .keyboardType(.decimalPad)
                        .font(.numeric(28))
                        .foregroundStyle(.white)
                        if !isGold && choices.count > 1 {
                            Button(selected.code) {
                                let i = choices.firstIndex { $0.code == selected.code } ?? 0
                                currency = choices[(i + 1) % choices.count].code
                            }
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white.opacity(0.6))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.black.opacity(0.15), in: RoundedRectangle(cornerRadius: Theme.cardRadius))
                    .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius).strokeBorder(.white.opacity(0.15)))

                    if isGold, amount > 0, let perGram = goldPerGramHome {
                        Text("≈ \(Money.format(jsRound(amount * perGram * 100), store.homeCurrency)) at today's price")
                            .font(.caption).foregroundStyle(.white.opacity(0.5))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else if !isGold, !isHome, amount > 0 {
                        Text("≈ \(Money.format(cents, store.homeCurrency))")
                            .font(.caption).foregroundStyle(.white.opacity(0.5))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    HStack(spacing: 12) {
                        Image(systemName: "note.text").foregroundStyle(.white.opacity(0.5))
                        TextField("", text: $note, prompt: Text("Note (optional)").foregroundStyle(.white.opacity(0.35)))
                            .foregroundStyle(.white)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.black.opacity(0.15), in: RoundedRectangle(cornerRadius: Theme.cardRadius))

                    Button(cta, action: save)
                        .buttonStyle(PrimaryButtonStyle(color: actionColor, foreground: actionText, enabled: canSave))
                        .disabled(!canSave)
                        .sensoryFeedback(.success, trigger: savedTick)

                    if let error {
                        Text(error).font(.footnote.weight(.medium)).foregroundStyle(Color(hex: "#FF8A8A"))
                    }
                }
            }
        }
    }

    private func save() {
        guard canSave else { return }
        saving = true
        error = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let noteValue = trimmed.isEmpty ? nil : trimmed
        Task {
            let failure: String?
            if isGold {
                failure = await store.addSafeGold(NewSafeGoldEntry(isDeposit: isDeposit, grams: amount, note: noteValue))
            } else {
                failure = await store.addTransaction(NewTransaction(
                    isIncome: !isDeposit, category: Categories.safeId, amountCents: cents,
                    originalCurrency: selected.code, originalAmount: amount, rateUsed: selected.rate, note: noteValue))
            }
            saving = false
            if let failure {
                error = failure
            } else {
                savedTick += 1
                display = ""
                note = ""
            }
        }
    }

    // MARK: History

    @ViewBuilder
    private var history: some View {
        let moves = movements
        if !moves.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader("History", color: .white.opacity(0.55))
                DarkCard(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(moves.enumerated()), id: \.element.id) { i, m in
                            if i > 0 { Divider().overlay(.white.opacity(0.1)).padding(.leading, 60) }
                            moveRow(m)
                                .contextMenu {
                                    Button(role: .destructive) { pendingDelete = m } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
                Text("Long-press a movement to delete it.")
                    .font(.caption).foregroundStyle(.white.opacity(0.35)).padding(.horizontal, 4)
            }
        }
    }

    private func moveRow(_ m: Move) -> some View {
        let tint = m.asset == .gold ? Theme.Vault.gold : m.isDeposit ? Theme.Vault.mint : Color(hex: "#FFA866")
        let amount: String = {
            if let mask = m.mask { return m.asset == .gold ? "\(mask) g" : Money.formatMasked(mask, store.homeCurrency) }
            let sign = m.isDeposit ? "+" : "-"
            return m.asset == .gold ? sign + Gold.format(m.grams) : sign + Money.format(m.cents, store.homeCurrency)
        }()
        return HStack(spacing: 12) {
            Image(systemName: m.isDeposit ? "arrow.down.to.line" : "arrow.up.to.line")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 36, height: 36)
                .background(tint.opacity(0.15), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("\(m.isDeposit ? "Added" : "Took out") \(m.asset == .gold ? "gold" : "cash")")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(.white)
                Text([Dates.shortDay(m.occurredAt), m.foreign, m.note].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.5))
                    .lineLimit(1)
            }
            Spacer()
            Text(amount).font(.numeric(15)).foregroundStyle(tint)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}
