import SwiftUI

/// Account, encryption, currencies, export, feedback, and the danger zone.
/// Mirrors src/screens/Settings.tsx, as a native grouped Form.
struct SettingsView: View {
    @Environment(MoneyStore.self) private var store
    @Binding var path: [Route]
    @State private var confirmSignOut = false

    var body: some View {
        Form {
            Section {
                LabeledContent("Signed in", value: store.email ?? "—")
                Button("Sign out", role: .destructive) { confirmSignOut = true }
            } header: { SectionHeader("Account").padding(.horizontal, -8) }

            EncryptionSection()

            CurrencySection()

            Section {
                Button { path.append(.review) } label: {
                    settingsRow("chart.bar.xaxis", "Spending review", "Your logged months, charted")
                }
                ExportSection()
            } header: { SectionHeader("Data").padding(.horizontal, -8) }

            Section {
                Button { path.append(.feedback) } label: {
                    settingsRow("bubble.left.and.text.bubble.right", "Send feedback", "Report a bug or share an idea")
                }
                Link(destination: AppConfig.webURL.appending(path: "privacy")) {
                    settingsRow("hand.raised", "Privacy & terms", nil)
                }
                Link(destination: URL(string: "mailto:\(AppConfig.contactEmail)")!) {
                    settingsRow("envelope", "Contact", AppConfig.contactEmail)
                }
            } header: { SectionHeader("Help").padding(.horizontal, -8) }

            DeleteAccountSection()

            Section {
                Text("That's all, folks. 🥕")
                    .font(.footnote)
                    .foregroundStyle(Theme.labelSecondary)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.canvas.ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Sign out of BucksBuddy?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await store.signOut() } }
        } message: {
            Text(store.e2eMode == .passphrase
                 ? "Your passphrase is forgotten on this device. You'll need it to unlock again."
                 : "Your data stays in your account.")
        }
    }

    private func settingsRow(_ symbol: String, _ title: String, _ subtitle: String?) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).foregroundStyle(Theme.carrot).frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).foregroundStyle(Theme.label)
                if let subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(Theme.labelSecondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.labelSecondary)
        }
    }
}

// MARK: - Encryption

/// On/off, with the passphrase shown (masked once saved, with an eye). When
/// it's on but this device doesn't have it yet, the same field unlocks.
private struct EncryptionSection: View {
    @Environment(MoneyStore.self) private var store
    @State private var pass = ""
    @State private var reveal = false
    @State private var busy = false
    @State private var error: String?
    @State private var confirmOff = false

    private var on: Bool { store.e2eMode == .passphrase }

    var body: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.shield.fill" : "lock.fill")
                    .foregroundStyle(on ? .white : Theme.labelSecondary)
                    .frame(width: 40, height: 40)
                    .background(on ? Theme.income : Theme.grouped, in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("End-to-end encryption").font(.headline)
                    Text(on ? (store.locked ? "On · locked on this device" : "On") : "Off")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(on ? Theme.income : Theme.labelSecondary)
                }
            }
            if !on {
                Text("Turn it on so no one else — not even whoever runs the server — can see your amounts or notes.")
                    .font(.subheadline)
            }

            HStack {
                Group {
                    if on && !store.locked && !reveal {
                        SecureField("Passphrase", text: $pass)
                    } else {
                        TextField("Passphrase", text: $pass)
                    }
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textContentType(.password)
                if on && !store.locked {
                    Button { reveal.toggle() } label: {
                        Image(systemName: reveal ? "eye.slash" : "eye").foregroundStyle(Theme.labelSecondary)
                    }
                    .buttonStyle(.borderless)
                }
            }

            Button(action: submit) {
                Text(busy ? "Saving…" : store.locked ? "Unlock" : on ? "Save passphrase" : "Turn on encryption")
                    .frame(maxWidth: .infinity)
                    .fontWeight(.semibold)
            }
            .disabled(busy || pass.isEmpty)

            if on && !store.locked {
                Button("Turn off encryption", role: .destructive) { confirmOff = true }
                    .disabled(busy)
            }

            if let error {
                Text(error).font(.footnote.weight(.medium)).foregroundStyle(Theme.danger)
            }
        } header: {
            SectionHeader("Encryption").padding(.horizontal, -8)
        } footer: {
            Text("The passphrase stays on this device (in the Keychain) and is never sent anywhere. If you forget it, the data cannot be recovered.")
        }
        .listRowBackground(on ? Theme.income.opacity(0.12) : Theme.surface)
        .onAppear { pass = store.passphrase ?? "" }
        .onChange(of: store.passphrase) { _, new in pass = new ?? "" }
        .confirmationDialog("Turn off encryption?", isPresented: $confirmOff, titleVisibility: .visible) {
            Button("Turn off", role: .destructive) {
                run { await store.disableEncryption() }
            }
        } message: {
            Text("Your amounts stay encrypted, but with the app's public key again — readable by whoever runs the server.")
        }
    }

    private func submit() {
        let value = pass
        let unlocking = store.locked
        run {
            if unlocking { return await store.unlock(passphrase: value) }
            return await store.enableEncryption(passphrase: value)
        }
    }

    private func run(_ action: @escaping () async -> String?) {
        busy = true
        error = nil
        Task {
            error = await action()
            busy = false
        }
    }
}

// MARK: - Currencies

/// The main currency (what totals are shown in) and the others, each with
/// its rate "per 1 main". Mirrors src/components/CurrencySettings.tsx.
private struct CurrencySection: View {
    @Environment(MoneyStore.self) private var store
    @State private var pendingHome: String?
    @State private var error: String?
    @State private var adding = false

    var body: some View {
        Section {
            Menu {
                ForEach(Currencies.all, id: \.code) { c in
                    Button("\(c.code) — \(c.name)") { askSwitch(c.code) }
                }
            } label: {
                LabeledContent("Main currency") {
                    Text("\(store.homeCurrency) \(Currencies.symbol(store.homeCurrency))")
                        .foregroundStyle(Theme.carrot)
                        .fontWeight(.semibold)
                }
            }
            .foregroundStyle(Theme.label)

            ForEach(store.currencies, id: \.code) { rate in
                RateRow(rate: rate, home: store.homeCurrency) { newRate in
                    save(store.currencies.map { $0.code == rate.code ? CurrencyRate(code: $0.code, rate: newRate) : $0 })
                }
            }
            .onDelete { idx in
                var list = store.currencies
                list.remove(atOffsets: idx)
                save(list)
            }

            Button { adding = true } label: {
                Label("Add currency", systemImage: "plus.circle.fill")
            }

            if let error {
                Text(error).font(.footnote).foregroundStyle(Theme.danger)
            }
        } header: {
            SectionHeader("Currencies").padding(.horizontal, -8)
        } footer: {
            Text("Entries are stored in your main currency. Tap the currency code next to an amount to type in another one.")
        }
        .sheet(isPresented: $adding) {
            AddCurrencySheet(exclude: Set([store.homeCurrency] + store.currencies.map(\.code)),
                             home: store.homeCurrency) { code, rate in
                save(store.currencies + [CurrencyRate(code: code, rate: rate)])
                adding = false
            }
            .presentationDetents([.medium, .large])
        }
        .confirmationDialog("Change main currency?", isPresented: Binding(
            get: { pendingHome != nil }, set: { if !$0 { pendingHome = nil } }
        ), titleVisibility: .visible, presenting: pendingHome) { code in
            Button("Switch to \(code)") { switchHome(code) }
        } message: { code in
            Text("Saved amounts aren't converted — their numbers stay and are read in \(code).")
        }
    }

    private func askSwitch(_ code: String) {
        guard code != store.homeCurrency else { return }
        // A fresh account won't notice; one with history gets a confirmation.
        if store.transactions.isEmpty { switchHome(code) } else { pendingHome = code }
    }

    private func switchHome(_ code: String) {
        Task { error = await store.setHomeCurrency(code) }
    }

    private func save(_ list: [CurrencyRate]) {
        Task { error = await store.setCurrencies(list) }
    }
}

private struct RateRow: View {
    let rate: CurrencyRate
    let home: String
    var onCommit: (Double) -> Void
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(rate.code).fontWeight(.semibold)
                Text("\(rate.code) per \(Money.symbolPrefix(home).trimmingCharacters(in: .whitespaces))1")
                    .font(.caption).foregroundStyle(Theme.labelSecondary)
            }
            Spacer()
            TextField("Rate", text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(.numeric(17, weight: .semibold))
                .focused($focused)
                .frame(maxWidth: 160)
                .onSubmit(commit)
        }
        .onAppear { text = JSNumber.string(rate.rate) }
        .onChange(of: rate.rate) { _, new in if !focused { text = JSNumber.string(new) } }
        .onChange(of: focused) { _, isFocused in if !isFocused { commit() } }
    }

    private func commit() {
        guard let value = Currencies.parseRate(text) else {
            text = JSNumber.string(rate.rate)
            return
        }
        if value != rate.rate { onCommit(value) }
    }
}

private struct AddCurrencySheet: View {
    let exclude: Set<String>
    let home: String
    var onAdd: (String, Double) -> Void
    @State private var code: String?
    @State private var rateText = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Picker("Currency", selection: $code) {
                    Text("Choose…").tag(String?.none)
                    ForEach(Currencies.all.filter { !exclude.contains($0.code) }, id: \.code) { c in
                        Text("\(c.code) — \(c.name)").tag(Optional(c.code))
                    }
                }
                if let code {
                    Section {
                        TextField("Rate", text: $rateText).keyboardType(.decimalPad)
                    } footer: {
                        Text("How many \(code) per \(Money.symbolPrefix(home).trimmingCharacters(in: .whitespaces))1.")
                    }
                }
            }
            .navigationTitle("Add currency")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        if let code, let rate = Currencies.parseRate(rateText) { onAdd(code, rate) }
                    }
                    .disabled(code == nil || Currencies.parseRate(rateText) == nil)
                }
            }
        }
    }
}

// MARK: - Export

private struct ExportSection: View {
    @Environment(MoneyStore.self) private var store
    @State private var range: ExportRange = .thisMonth
    @State private var csvURL: URL?
    @State private var pdfURL: URL?

    private var masked: Bool { store.locked || store.transactions.contains(where: \.isMasked) }

    var body: some View {
        if masked {
            Label("Unlock to export.", systemImage: "lock.fill")
                .foregroundStyle(Theme.labelSecondary)
        } else {
            let rows = range.filter(store.transactions)
            Picker(selection: $range) {
                ForEach(ExportRange.allCases) { r in Text(r.label).tag(r) }
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "square.and.arrow.up").foregroundStyle(Theme.carrot).frame(width: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Export")
                        Text("\(rows.count) \(rows.count == 1 ? "entry" : "entries")")
                            .font(.caption).foregroundStyle(Theme.labelSecondary)
                    }
                }
            }
            HStack(spacing: 12) {
                share("CSV", url: csvURL)
                share("PDF", url: pdfURL)
            }
            .onAppear(perform: build)
            .onChange(of: range) { build() }
            .onChange(of: store.transactions) { build() }
        }
    }

    private func share(_ title: String, url: URL?) -> some View {
        Group {
            if let url {
                ShareLink(item: url) {
                    Label(title, systemImage: title == "CSV" ? "tablecells" : "doc.richtext")
                        .frame(maxWidth: .infinity)
                        .fontWeight(.semibold)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.bordered)
        .tint(Theme.carrot)
    }

    /// Write both files to a temporary folder so the share sheet can hand
    /// them to Files, Mail, AirDrop…
    private func build() {
        let rows = range.filter(store.transactions)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("export", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let csv = dir.appendingPathComponent(range.filename(ext: "csv"))
        let pdf = dir.appendingPathComponent(range.filename(ext: "pdf"))
        try? Data(CSVExport.csv(rows, homeCurrency: store.homeCurrency).utf8).write(to: csv, options: .completeFileProtection)
        try? PDFStatement.render(rows: rows, homeCurrency: store.homeCurrency, rangeLabel: range.describe())
            .write(to: pdf, options: .completeFileProtection)
        csvURL = csv
        pdfURL = pdf
    }
}

// MARK: - Danger zone

private struct DeleteAccountSection: View {
    @Environment(MoneyStore.self) private var store
    @State private var confirming = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Section {
            Button(role: .destructive) { confirming = true } label: {
                HStack {
                    Text(busy ? "Deleting…" : "Delete account")
                    Spacer()
                    Image(systemName: "trash")
                }
            }
            .disabled(busy)
            if let error {
                Text(error).font(.footnote).foregroundStyle(Theme.danger)
            }
        } header: {
            SectionHeader("Danger zone").padding(.horizontal, -8)
        }
        .confirmationDialog("Delete everything?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Delete everything", role: .destructive) {
                busy = true
                Task {
                    error = await store.deleteAccount()
                    busy = false
                }
            }
        } message: {
            Text("This permanently deletes your account and all your data. This can't be undone.")
        }
    }
}
