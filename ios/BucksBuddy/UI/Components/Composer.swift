import SwiftUI

/// The add form (and the edit form, in a sheet): amount → category → optional
/// note → one contextual button. Mirrors src/components/AddComposer.tsx.
struct ComposerView: View {
    @Environment(MoneyStore.self) private var store

    /// The entry being edited, or nil to add a new one.
    var editing: Transaction?
    /// Called after a successful save of an edit (or on cancel).
    var onFinishEdit: (() -> Void)?

    @State private var isIncome = false
    @State private var category: String?
    @State private var currency = ""
    @State private var display = ""
    @State private var note = ""
    @State private var showCategories = false
    @State private var showTips = false
    @State private var saving = false
    @State private var error: String?
    @State private var savedTick = 0
    @FocusState private var focus: Field?

    enum Field { case amount, note }

    /// The currencies on offer: home first, then the secondaries. Editing an
    /// entry typed in a currency since removed keeps it, at its saved rate.
    private var choices: [CurrencyRate] {
        var list = store.currencyChoices
        if let editing, !list.contains(where: { $0.code == editing.originalCurrency }) {
            list.append(CurrencyRate(code: editing.originalCurrency, rate: editing.rateUsed))
        }
        return list
    }

    private var selected: CurrencyRate {
        choices.first { $0.code == currency } ?? choices[0]
    }

    private var isHome: Bool { selected.code == store.homeCurrency }
    private var amount: Double { Currencies.parseAmount(display) }
    private var cents: Int { Currencies.toHomeCents(amount, rate: selected.rate) }
    private var canSave: Bool { category != nil && amount > 0 && !saving }

    private var amountLabel: String {
        isHome ? Money.format(cents, store.homeCurrency)
            : "\(Money.formatPlain(amount, decimals: Currencies.info(selected.code).decimals)) \(selected.code)"
    }

    private var cta: String {
        if saving { return "Saving…" }
        if amount <= 0 { return "Enter an amount" }
        if category == nil { return "Choose a category" }
        return "\(editing == nil ? "Add" : "Save") \(amountLabel)"
    }

    private var suggestions: [String] {
        guard let category else { return [] }
        return noteSuggestions(store.transactions, isIncome: isIncome, category: category, query: note)
    }

    var body: some View {
        VStack(spacing: 12) {
            amountField
            if !isHome && amount > 0 {
                Text("≈ \(Money.format(cents, store.homeCurrency))")
                    .font(.caption)
                    .foregroundStyle(Theme.labelSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
                    .padding(.top, -6)
            }
            categoryField
            if category != nil { noteField }

            Button(cta, action: save)
                .buttonStyle(PrimaryButtonStyle(enabled: canSave))
                .disabled(!canSave)
                .padding(.top, 4)
                .sensoryFeedback(.success, trigger: savedTick)

            if let error {
                Text(error).font(.footnote.weight(.medium)).foregroundStyle(Theme.danger)
            }
            if editing != nil {
                Button("Cancel edit") { onFinishEdit?() }
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.carrot)
            }
        }
        // Many buttons live in one List row on Home; borderless keeps a tap
        // from firing all of them.
        .buttonStyle(.borderless)
        .onAppear(perform: reset)
        .onChange(of: editing?.id) { reset() }
        .sheet(isPresented: $showCategories) {
            CategorySheet(isIncome: $isIncome, selected: category) { picked in
                category = picked
                showCategories = false
            }
            .presentationDetents([.large, .fraction(0.8)])
            .presentationDragIndicator(.visible)
            .onChange(of: isIncome) { _, _ in
                if let c = category, !Categories.forDirection(isIncome: isIncome)
                    .contains(where: { $0.id == Categories.split(c).base }) { category = nil }
            }
        }
        .sheet(isPresented: $showTips) {
            NoteTipsSheet { keyword in
                let trimmed = note.trimmingCharacters(in: .whitespaces)
                note = trimmed.isEmpty ? keyword : "\(trimmed) \(keyword)"
                showTips = false
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: Pieces

    private var amountField: some View {
        HStack(spacing: 12) {
            Text(Currencies.symbol(selected.code))
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Theme.carrot)
                .minimumScaleFactor(0.6)
                .frame(width: 40, height: 40)
                .background(Theme.carrotSoft, in: Circle())
            TextField("0.00", text: Binding(
                get: { display },
                set: { display = Money.sanitizeTyped($0.replacingOccurrences(of: ",", with: ".")) }
            ))
            .keyboardType(.decimalPad)
            .font(.numeric(30))
            .foregroundStyle(Theme.label)
            .focused($focus, equals: .amount)
            if choices.count > 1 {
                Button(selected.code) {
                    let i = choices.firstIndex { $0.code == selected.code } ?? 0
                    currency = choices[(i + 1) % choices.count].code
                }
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(Theme.labelSecondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Theme.grouped.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
                .accessibilityLabel("Switch currency")
            } else {
                Text(selected.code)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.labelSecondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius).strokeBorder(Theme.separator))
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focus = nil }.fontWeight(.semibold)
            }
        }
    }

    @ViewBuilder
    private var categoryField: some View {
        if let category {
            HStack(spacing: 12) {
                CategoryIcon(category: category)
                VStack(alignment: .leading, spacing: 1) {
                    Text(isIncome ? "INCOME" : "EXPENSE")
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(0.5)
                        .foregroundStyle(Theme.amountColor(isIncome: isIncome))
                    Text(Categories.label(category))
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(Theme.label)
                        .lineLimit(1)
                }
                Spacer()
                Button("Change ›") { focus = nil; showCategories = true }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.carrot)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .overlay(Capsule().strokeBorder(Theme.carrot))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius).strokeBorder(Theme.separator))
        } else {
            Button {
                focus = nil
                showCategories = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "tag.fill")
                        .foregroundStyle(Theme.carrot)
                        .frame(width: 40, height: 40)
                        .background(Theme.carrotSoft, in: Circle())
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Add Category").font(.system(size: 17, weight: .bold)).foregroundStyle(Theme.label)
                        Text("Income or expense").font(.subheadline).foregroundStyle(Theme.labelSecondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Theme.labelSecondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Theme.carrotSoft.opacity(0.4), in: RoundedRectangle(cornerRadius: Theme.cardRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.cardRadius)
                        .strokeBorder(Theme.carrot.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                )
            }
            .buttonStyle(PressStyle())
        }
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "note.text").foregroundStyle(Theme.labelSecondary)
                TextField("Add a note (optional)", text: Binding(
                    get: { note },
                    set: { note = String($0.prefix(140)) }
                ))
                .focused($focus, equals: .note)
                .submitLabel(.done)
                Button { showTips = true } label: {
                    Image(systemName: "info.circle").foregroundStyle(Theme.labelSecondary.opacity(0.7))
                }
                .accessibilityLabel("Note tips")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius).strokeBorder(Theme.separator))

            if !suggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(suggestions, id: \.self) { s in
                            Button(s) { note = s }
                                .font(.subheadline)
                                .foregroundStyle(Theme.label)
                                .lineLimit(1)
                                .frame(maxWidth: 220)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(Theme.grouped, in: Capsule())
                        }
                    }
                }
            }
        }
    }

    // MARK: Actions

    private func reset() {
        if let editing {
            isIncome = editing.isIncome
            category = editing.category
            currency = editing.originalCurrency
            display = JSNumber.string(editing.originalAmount)
            note = editing.note ?? ""
        } else {
            isIncome = false
            category = nil
            currency = store.homeCurrency
            display = ""
            note = ""
        }
        error = nil
    }

    private func save() {
        guard canSave, let category else { return }
        saving = true
        error = nil
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload = NewTransaction(
            isIncome: isIncome, category: category, amountCents: cents,
            originalCurrency: selected.code, originalAmount: amount, rateUsed: selected.rate,
            note: trimmed.isEmpty ? nil : trimmed
        )
        Task {
            let failure: String?
            if let editing {
                failure = await store.updateTransaction(id: editing.id, payload)
            } else {
                failure = await store.addTransaction(payload)
            }
            saving = false
            if let failure {
                error = failure
                return
            }
            savedTick += 1
            focus = nil
            if editing != nil {
                onFinishEdit?()
            } else {
                display = ""
                self.category = nil
                note = ""
            }
        }
    }
}

// MARK: - Category sheet

/// Two steps: the colourful grid with the In/Out toggle, then (for
/// categories that have them) the subcategory list.
struct CategorySheet: View {
    @Binding var isIncome: Bool
    var selected: String?
    var onSelect: (String) -> Void

    @State private var expanded: String?

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(Categories.forDirection(isIncome: isIncome)) { c in
                        let active = selected.map { Categories.split($0).base == c.id } ?? false
                        Button {
                            if c.subcategories.isEmpty { onSelect(c.id) } else { expanded = c.id }
                        } label: {
                            VStack(spacing: 8) {
                                CategoryIcon(category: c.id, size: 44)
                                Text(c.label)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Theme.label)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(active ? Theme.carrotSoft : Theme.canvas,
                                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .overlay(alignment: .topTrailing) {
                                if !c.subcategories.isEmpty {
                                    Circle().fill(Theme.labelSecondary.opacity(0.5))
                                        .frame(width: 6, height: 6).padding(10)
                                }
                            }
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .strokeBorder(active ? Theme.carrot : .clear, lineWidth: 2)
                            )
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(16)
            }
            .safeAreaInset(edge: .bottom) {
                PillToggle(
                    options: [(false, "Out", "arrow.up.right"), (true, "In", "arrow.down.left")],
                    selection: $isIncome,
                    activeText: { $0 ? Theme.income : Theme.expense }
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 8)
                .background(.bar)
            }
            .navigationTitle(isIncome ? "Money in" : "Money out")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(item: $expanded) { base in
                SubcategoryList(base: base, selected: selected, onSelect: onSelect)
            }
        }
    }
}

private struct SubcategoryList: View {
    let base: String
    var selected: String?
    var onSelect: (String) -> Void

    var body: some View {
        List {
            Section {
                row(id: base, title: "Just \(Categories.label(base))")
            }
            Section {
                ForEach(Categories.subcategories(of: base)) { sub in
                    row(id: Categories.compose(base, sub.id), title: sub.label)
                }
            }
        }
        .navigationTitle(Categories.label(base))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(id: String, title: String) -> some View {
        Button { onSelect(id) } label: {
            HStack(spacing: 12) {
                CategoryIcon(category: base, size: 30)
                Text(title).foregroundStyle(Theme.label)
                Spacer()
                if selected == id {
                    Image(systemName: "checkmark").foregroundStyle(Theme.carrot).fontWeight(.semibold)
                }
            }
        }
    }
}

// MARK: - Note tips

/// The cheat codes worth teaching (see Notes.swift / Recurring.swift). Tapping
/// a keyword drops it onto the end of the note.
struct NoteTipsSheet: View {
    var onPick: (String) -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Same note, same payment").font(.headline)
                            Text("Reuse a note and the app spots what repeats.")
                                .font(.subheadline).foregroundStyle(Theme.labelSecondary)
                        }
                    } icon: { Image(systemName: "note.text").foregroundStyle(Theme.carrot) }
                }
                Section("Recurring keywords") {
                    tip("Start a recurring item", "First note: add", ["(monthly)", "(yearly)", "(weekly)"])
                    tip("Stop a recurring item", "Last note: add", ["(ended)"])
                    tip("Tell two of the same apart", "Tag one of them — any word in brackets does:", ["(personal)"])
                }
            }
            .navigationTitle("Recurring payments")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func tip(_ title: String, _ body: String, _ keywords: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(body).font(.subheadline).foregroundStyle(Theme.labelSecondary)
            HStack {
                ForEach(keywords, id: \.self) { k in
                    Button(k) { onPick(k) }
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(Theme.label)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.grouped, in: RoundedRectangle(cornerRadius: 6))
                        .buttonStyle(.borderless)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
