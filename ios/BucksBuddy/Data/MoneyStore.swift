import CryptoKit
import Foundation
import Observation
import Supabase

// The signed-in account's data, decrypted in memory. The iOS twin of
// src/lib/store.tsx: it owns the master key, so it's the only thing that can
// read or write a money value. Everything else reads from it.

enum E2EMode: String { case `default`, passphrase }

@MainActor
@Observable
final class MoneyStore {
    let userId: String
    let email: String?

    private(set) var loading: Bool
    private(set) var transactions: [Transaction]
    private(set) var homeCurrency: String
    private(set) var currencies: [CurrencyRate]
    private(set) var safeGoldEntries: [SafeGoldEntry]

    /// "default" (operator-readable, no passphrase) or "passphrase" (real E2E).
    private(set) var e2eMode: E2EMode = .default
    /// True when this device doesn't have the passphrase yet: amounts show
    /// obscured until it's entered.
    private(set) var locked = false
    /// The current passphrase, cached on this device (nil when off/unknown).
    private(set) var passphrase: String?
    private(set) var loadError: String?

    /// The decrypted master key. Never persisted, never observed.
    @ObservationIgnored private var masterKey: SymmetricKey?

    static let lockedMessage = "Locked — unlock with your passphrase first."

    init(userId: String, email: String?) {
        self.userId = userId
        self.email = email
        // Paint the last on-device snapshot while the network read runs.
        let cached = SnapshotCache.load(userId)
        loading = cached == nil
        transactions = cached?.transactions ?? []
        homeCurrency = cached?.homeCurrency ?? Currencies.defaultHome
        currencies = cached?.currencies ?? Currencies.defaultSecondaries
        safeGoldEntries = cached?.gold ?? []
    }

    // MARK: Derived

    /// The carried-forward balance: net of everything held, all-time (bounded
    /// by the fetch cap like the web app).
    var balanceCents: Int { netCents(transactions) }

    var monthlyNetCents: Int {
        let (from, to) = Dates.monthRange()
        return netCents(transactions.filter { $0.occurredAt >= from && $0.occurredAt < to })
    }

    /// Cash in the safe: money sent to the safe (Out) adds, taking it back (In)
    /// subtracts.
    var safeTotalCents: Int {
        transactions.reduce(0) { sum, t in
            t.category == Categories.safeId ? sum + (t.isIncome ? -t.amountCents : t.amountCents) : sum
        }
    }

    var safeGoldGrams: Double {
        safeGoldEntries.reduce(0) { $0 + ($1.isDeposit ? $1.grams : -$1.grams) }
    }

    /// Home first (rate 1), then the secondaries.
    var currencyChoices: [CurrencyRate] {
        [CurrencyRate(code: homeCurrency, rate: 1)] + currencies
    }

    // MARK: Lifecycle

    func start() async {
        await openVault()
        await refresh()
    }

    private func fetchKeyRow() async throws -> KeyRow? {
        let rows: [KeyRow] = try await supabase.from("e2e_keys")
            .select("wrapped_key, wrap_type, verifier")
            .eq("user_id", value: userId)
            .limit(1)
            .execute().value
        return rows.first
    }

    /// Load (and, for a brand-new user, create) the vault. Default-tier users
    /// unlock transparently; passphrase users try the one cached here.
    private func openVault() async {
        do {
            var existing = try await fetchKeyRow()
            if existing == nil {
                let fresh = BBCrypto.generateMasterKey()
                let wrapped = try await Task.detached {
                    try BBCrypto.wrapMasterKey(fresh, passphrase: BBCrypto.defaultPassphrase)
                }.value
                struct NewKey: Encodable {
                    let user_id: String, wrapped_key: String, wrap_type: String, verifier: String
                }
                // Idempotent: never clobbers an existing (maybe passphrase) row.
                try await supabase.from("e2e_keys").upsert(
                    NewKey(user_id: userId, wrapped_key: wrapped, wrap_type: "default",
                           verifier: try BBCrypto.makeVerifier(fresh)),
                    onConflict: "user_id", ignoreDuplicates: true
                ).execute()
                // Re-read: under a race, respect whoever won.
                existing = try await fetchKeyRow()
                if existing == nil {
                    unlock(with: fresh, mode: .default, passphrase: nil)
                    return
                }
            }
            guard let row = existing else { return }
            if row.wrapType == "default" {
                let key = try await Task.detached {
                    try BBCrypto.unwrapMasterKey(row.wrappedKey, passphrase: BBCrypto.defaultPassphrase)
                }.value
                unlock(with: key, mode: .default, passphrase: nil)
                return
            }
            e2eMode = .passphrase
            if let stored = PassphraseStore.load(userId),
               let key = await Self.tryUnwrap(row, passphrase: stored) {
                unlock(with: key, mode: .passphrase, passphrase: stored)
            } else {
                PassphraseStore.clear(userId) // stale (changed elsewhere)
                masterKey = nil
                locked = true
                passphrase = nil
            }
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func unlock(with key: SymmetricKey, mode: E2EMode, passphrase pass: String?) {
        masterKey = key
        e2eMode = mode
        locked = false
        passphrase = pass
    }

    private nonisolated static func tryUnwrap(_ row: KeyRow, passphrase: String) async -> SymmetricKey? {
        await Task.detached { () -> SymmetricKey? in
            guard let key = try? BBCrypto.unwrapMasterKey(row.wrappedKey, passphrase: passphrase),
                  BBCrypto.checkVerifier(key, verifier: row.verifier) else { return nil }
            return key
        }.value
    }

    /// Reload currency settings plus (decrypted, or masked when locked) rows.
    func refresh() async {
        if transactions.isEmpty { loading = true }
        defer { loading = false }
        do {
            let profiles: [ProfileRow] = try await supabase.from("profiles")
                .select().eq("id", value: userId).limit(1).execute().value
            if let settings = profiles.first?.settings {
                homeCurrency = settings.homeCurrency
                currencies = settings.currencies
            }
            let txRows: [TransactionRow] = try await supabase.from("transactions")
                .select().order("occurred_at", ascending: false).limit(Stats.fetchCap).execute().value
            let goldRows: [GoldRow] = try await supabase.from("safe_gold_entries")
                .select().order("occurred_at", ascending: false).limit(Stats.fetchCap).execute().value

            guard let key = masterKey else {
                // Locked: show the rows with obscured amounts, and drop any
                // cached plaintext — this device isn't entitled to it yet.
                transactions = txRows.map(Self.masked)
                safeGoldEntries = goldRows.map(Self.masked)
                SnapshotCache.clear(userId)
                return
            }
            let (txs, gold) = try await Task.detached {
                (try txRows.map { try Self.decrypt($0, key: key) },
                 try goldRows.map { try Self.decrypt($0, key: key) })
            }.value
            transactions = txs
            safeGoldEntries = gold
            loadError = nil
            persist()
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func persist() {
        guard !locked else { return }
        SnapshotCache.save(userId, Snapshot(transactions: transactions, homeCurrency: homeCurrency,
                                            currencies: currencies, gold: safeGoldEntries))
    }

    // MARK: Row ⇄ model

    nonisolated static func decrypt(_ row: TransactionRow, key: SymmetricKey) throws -> Transaction {
        Transaction(
            id: row.id, userId: row.userId, isIncome: row.isIncome, category: row.category,
            amountCents: Int(try row.amountUsdCentsEnc.map { try BBCrypto.decryptNumber($0, key: key) } ?? 0),
            originalCurrency: row.originalCurrency,
            originalAmount: try row.originalAmountEnc.map { try BBCrypto.decryptNumber($0, key: key) } ?? 0,
            rateUsed: row.rateUsed,
            occurredAt: Dates.parseTimestamp(row.occurredAt) ?? Date(),
            note: try row.noteEnc.map { try BBCrypto.decryptString($0, key: key) },
            createdAt: Dates.parseTimestamp(row.createdAt) ?? Date()
        )
    }

    nonisolated static func decrypt(_ row: GoldRow, key: SymmetricKey) throws -> SafeGoldEntry {
        SafeGoldEntry(
            id: row.id, userId: row.userId, isDeposit: row.isDeposit,
            grams: try row.gramsEnc.map { try BBCrypto.decryptNumber($0, key: key) } ?? 0,
            note: try row.noteEnc.map { try BBCrypto.decryptString($0, key: key) },
            occurredAt: Dates.parseTimestamp(row.occurredAt) ?? Date(),
            createdAt: Dates.parseTimestamp(row.createdAt) ?? Date()
        )
    }

    nonisolated static func masked(_ row: TransactionRow) -> Transaction {
        Transaction(
            id: row.id, userId: row.userId, isIncome: row.isIncome, category: row.category,
            amountCents: 0, originalCurrency: row.originalCurrency, originalAmount: 0,
            rateUsed: row.rateUsed, occurredAt: Dates.parseTimestamp(row.occurredAt) ?? Date(),
            note: nil, createdAt: Dates.parseTimestamp(row.createdAt) ?? Date(),
            amountMask: BBCrypto.cipherMask(row.amountUsdCentsEnc)
        )
    }

    nonisolated static func masked(_ row: GoldRow) -> SafeGoldEntry {
        SafeGoldEntry(
            id: row.id, userId: row.userId, isDeposit: row.isDeposit, grams: 0, note: nil,
            occurredAt: Dates.parseTimestamp(row.occurredAt) ?? Date(),
            createdAt: Dates.parseTimestamp(row.createdAt) ?? Date(),
            gramsMask: BBCrypto.cipherMask(row.gramsEnc)
        )
    }

    private func write(_ tx: NewTransaction, key: SymmetricKey, insert: Bool) throws -> TransactionWrite {
        TransactionWrite(
            userId: insert ? userId : nil,
            isIncome: tx.isIncome, category: tx.category,
            originalCurrency: tx.originalCurrency, rateUsed: tx.rateUsed,
            amountUsdCentsEnc: try BBCrypto.encryptNumber(Double(tx.amountCents), key: key),
            originalAmountEnc: try BBCrypto.encryptNumber(tx.originalAmount, key: key),
            noteEnc: try BBCrypto.encryptNote(tx.note, key: key)
        )
    }

    private func inMemory(_ row: TransactionRow, _ tx: NewTransaction) -> Transaction {
        Transaction(
            id: row.id, userId: row.userId, isIncome: tx.isIncome, category: tx.category,
            amountCents: tx.amountCents, originalCurrency: tx.originalCurrency,
            originalAmount: tx.originalAmount, rateUsed: tx.rateUsed,
            occurredAt: Dates.parseTimestamp(row.occurredAt) ?? Date(), note: tx.note,
            createdAt: Dates.parseTimestamp(row.createdAt) ?? Date()
        )
    }

    // MARK: Transactions

    @discardableResult
    func addTransaction(_ tx: NewTransaction) async -> String? {
        guard let key = masterKey else { return Self.lockedMessage }
        do {
            let row: TransactionRow = try await supabase.from("transactions")
                .insert(try write(tx, key: key, insert: true))
                .select().single().execute().value
            transactions.insert(inMemory(row, tx), at: 0)
            persist()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    @discardableResult
    func updateTransaction(id: String, _ tx: NewTransaction) async -> String? {
        guard let key = masterKey else { return Self.lockedMessage }
        do {
            let row: TransactionRow = try await supabase.from("transactions")
                .update(try write(tx, key: key, insert: false))
                .eq("id", value: id)
                .select().single().execute().value
            if let i = transactions.firstIndex(where: { $0.id == id }) {
                transactions[i] = inMemory(row, tx)
            }
            persist()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    @discardableResult
    func deleteTransaction(id: String) async -> String? {
        let before = transactions
        transactions.removeAll { $0.id == id }
        do {
            try await supabase.from("transactions").delete().eq("id", value: id).execute()
            persist()
            return nil
        } catch {
            transactions = before
            return error.localizedDescription
        }
    }

    // MARK: Currencies

    struct CurrencyUpdate: Encodable {
        var home_currency: String?
        let currencies: [CurrencyRate]
    }

    /// Change the home currency. Stored amounts keep their numbers; the rate
    /// list is re-based when it can be, else cleared.
    @discardableResult
    func setHomeCurrency(_ code: String) async -> String? {
        let next = Currencies.switchHome(CurrencySettings(homeCurrency: homeCurrency, currencies: currencies), to: code)
        do {
            try await supabase.from("profiles")
                .update(CurrencyUpdate(home_currency: next.homeCurrency, currencies: next.currencies))
                .eq("id", value: userId).execute()
            homeCurrency = next.homeCurrency
            currencies = next.currencies
            persist()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    @discardableResult
    func setCurrencies(_ list: [CurrencyRate]) async -> String? {
        do {
            try await supabase.from("profiles")
                .update(CurrencyUpdate(currencies: list))
                .eq("id", value: userId).execute()
            currencies = list
            persist()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: Gold

    @discardableResult
    func addSafeGold(_ entry: NewSafeGoldEntry) async -> String? {
        guard let key = masterKey else { return Self.lockedMessage }
        do {
            let payload = GoldWrite(
                userId: userId, isDeposit: entry.isDeposit,
                gramsEnc: try BBCrypto.encryptNumber(entry.grams, key: key),
                noteEnc: try BBCrypto.encryptNote(entry.note, key: key)
            )
            let row: GoldRow = try await supabase.from("safe_gold_entries")
                .insert(payload).select().single().execute().value
            safeGoldEntries.insert(SafeGoldEntry(
                id: row.id, userId: row.userId, isDeposit: entry.isDeposit, grams: entry.grams,
                note: entry.note, occurredAt: Dates.parseTimestamp(row.occurredAt) ?? Date(),
                createdAt: Dates.parseTimestamp(row.createdAt) ?? Date()
            ), at: 0)
            persist()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    @discardableResult
    func deleteSafeGold(id: String) async -> String? {
        let before = safeGoldEntries
        safeGoldEntries.removeAll { $0.id == id }
        do {
            try await supabase.from("safe_gold_entries").delete().eq("id", value: id).execute()
            persist()
            return nil
        } catch {
            safeGoldEntries = before
            return error.localizedDescription
        }
    }

    // MARK: Encryption

    @discardableResult
    func unlock(passphrase pass: String) async -> String? {
        do {
            guard let row = try await fetchKeyRow(),
                  let key = await Self.tryUnwrap(row, passphrase: pass)
            else { return "Wrong passphrase." }
            PassphraseStore.save(userId, pass)
            unlock(with: key, mode: .passphrase, passphrase: pass)
            await refresh()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    struct KeyUpdate: Encodable { let wrapped_key: String; let wrap_type: String }

    /// Turn on E2E (or change the passphrase): re-wrap the master key. Cheap —
    /// the data is untouched.
    @discardableResult
    func enableEncryption(passphrase pass: String) async -> String? {
        guard let key = masterKey else { return Self.lockedMessage }
        do {
            let wrapped = try await Task.detached { try BBCrypto.wrapMasterKey(key, passphrase: pass) }.value
            try await supabase.from("e2e_keys")
                .update(KeyUpdate(wrapped_key: wrapped, wrap_type: "passphrase"))
                .eq("user_id", value: userId).execute()
            PassphraseStore.save(userId, pass)
            passphrase = pass
            e2eMode = .passphrase
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    /// Turn off E2E: re-wrap back under the public passphrase.
    @discardableResult
    func disableEncryption() async -> String? {
        guard let key = masterKey else { return Self.lockedMessage }
        do {
            let wrapped = try await Task.detached {
                try BBCrypto.wrapMasterKey(key, passphrase: BBCrypto.defaultPassphrase)
            }.value
            try await supabase.from("e2e_keys")
                .update(KeyUpdate(wrapped_key: wrapped, wrap_type: "default"))
                .eq("user_id", value: userId).execute()
            PassphraseStore.clear(userId)
            passphrase = nil
            e2eMode = .default
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: Account

    /// Forget this device's secrets. Called on sign-out and account deletion.
    func forgetLocalSecrets() {
        PassphraseStore.clear(userId)
        SnapshotCache.clear(userId)
        masterKey = nil
        passphrase = nil
    }

    func signOut() async {
        forgetLocalSecrets()
        try? await supabase.auth.signOut()
    }

    /// Permanently removes the user and all their data via the
    /// `delete-account` edge function, then ends the session.
    @discardableResult
    func deleteAccount() async -> String? {
        do {
            try await supabase.functions.invoke("delete-account")
        } catch {
            return error.localizedDescription
        }
        await signOut()
        return nil
    }

    // MARK: Review

    /// Every transaction in [from, to), decrypted, paged so a busy account is
    /// read in full rather than capped. Nil when it can't be read completely
    /// (still locked, or a page failed) — never a silently short list.
    func reviewRange(from: Date, to: Date) async -> [Transaction]? {
        guard let key = masterKey else { return nil }
        let pageSize = 500, maxPages = 500
        var all: [Transaction] = []
        for page in 0..<maxPages {
            do {
                let rows: [TransactionRow] = try await supabase.from("transactions")
                    .select()
                    .gte("occurred_at", value: Dates.isoString(from))
                    .lt("occurred_at", value: Dates.isoString(to))
                    .order("occurred_at", ascending: false)
                    .order("id", ascending: false)
                    .range(from: page * pageSize, to: page * pageSize + pageSize - 1)
                    .execute().value
                let batch = try await Task.detached { try rows.map { try Self.decrypt($0, key: key) } }.value
                all += batch
                if rows.count < pageSize { return all }
            } catch {
                return nil
            }
        }
        return nil
    }
}
