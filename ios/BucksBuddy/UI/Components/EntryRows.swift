import SwiftUI

/// One entry: category chip, label + note, time, and the amount in its
/// direction's colour (obscured while the device is locked).
struct TransactionRowView: View {
    let tx: Transaction
    let currency: String
    var showDate = false
    var dark = false

    var body: some View {
        HStack(spacing: 12) {
            CategoryIcon(category: tx.category, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(Categories.label(tx.category))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(dark ? .white : Theme.label)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(dark ? .white.opacity(0.55) : Theme.labelSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(amountText)
                    .font(.numeric(16))
                    .foregroundStyle(tx.isMasked ? Theme.labelSecondary : Theme.amountColor(isIncome: tx.isIncome))
                if !tx.isMasked, tx.originalCurrency != currency {
                    Text("\(Money.formatPlain(tx.originalAmount, decimals: Currencies.info(tx.originalCurrency).decimals)) \(tx.originalCurrency)")
                        .font(.numeric(11, weight: .medium))
                        .foregroundStyle(dark ? .white.opacity(0.45) : Theme.labelSecondary)
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        let when = showDate
            ? "\(Dates.shortDay(tx.occurredAt)) · \(Dates.timeFormatter.string(from: tx.occurredAt))"
            : Dates.timeFormatter.string(from: tx.occurredAt)
        if let note = tx.note, !note.isEmpty { return "\(note) · \(when)" }
        return when
    }

    private var amountText: String {
        if let mask = tx.amountMask { return Money.formatMasked(mask, currency) }
        return (tx.isIncome ? "+" : "-") + Money.format(tx.amountCents, currency)
    }
}

/// A run or stack of same-category entries: one row with the count and the
/// total, expanding to the entries underneath.
struct HistoryGroupRow: View {
    let group: HistoryGroup
    let currency: String
    var showDates = false
    var onEdit: (Transaction) -> Void
    var onDelete: (Transaction) -> Void
    @State private var expanded = false

    var body: some View {
        if group.count == 1, let tx = group.rows.first {
            TransactionRowView(tx: tx, currency: currency, showDate: showDates)
                .entryActions(tx, onEdit: onEdit, onDelete: onDelete)
        } else {
            DisclosureGroup(isExpanded: $expanded) {
                ForEach(group.rows) { tx in
                    TransactionRowView(tx: tx, currency: currency, showDate: showDates)
                        .entryActions(tx, onEdit: onEdit, onDelete: onDelete)
                }
            } label: {
                HStack(spacing: 12) {
                    CategoryIcon(category: group.category, size: 36)
                        .overlay(alignment: .bottomTrailing) {
                            Text("\(group.count)")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Theme.label, in: Capsule())
                                .offset(x: 6, y: 4)
                        }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Categories.label(group.category))
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.label)
                        Text("\(group.count) entries")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.labelSecondary)
                    }
                    Spacer()
                    Text(group.masked ? Money.formatMasked("•••", currency) : Money.formatSigned(group.totalCents, currency))
                        .font(.numeric(16))
                        .foregroundStyle(group.masked ? Theme.labelSecondary : Theme.netColor(group.totalCents))
                }
            }
            .tint(Theme.labelSecondary)
        }
    }
}

extension View {
    /// Swipe right-to-left for delete, left-to-right for edit, plus the same
    /// two in a long-press menu. Masked (locked) rows can only be deleted.
    func entryActions(_ tx: Transaction, onEdit: @escaping (Transaction) -> Void,
                      onDelete: @escaping (Transaction) -> Void) -> some View {
        self
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button(role: .destructive) { onDelete(tx) } label: { Label("Delete", systemImage: "trash") }
            }
            .swipeActions(edge: .leading) {
                if !tx.isMasked {
                    Button { onEdit(tx) } label: { Label("Edit", systemImage: "pencil") }
                        .tint(Theme.carrot)
                }
            }
            .contextMenu {
                if !tx.isMasked {
                    Button { onEdit(tx) } label: { Label("Edit", systemImage: "pencil") }
                }
                Button(role: .destructive) { onDelete(tx) } label: { Label("Delete", systemImage: "trash") }
            }
    }

    /// The shared edit sheet + delete confirmation for any screen that lists
    /// entries.
    func entryEditing(editing: Binding<Transaction?>, deleting: Binding<Transaction?>,
                      store: MoneyStore) -> some View {
        self
            .sheet(item: editing) { tx in
                NavigationStack {
                    ScrollView {
                        ComposerView(editing: tx) { editing.wrappedValue = nil }
                            .padding(16)
                    }
                    .background(Theme.canvas)
                    .navigationTitle("Edit entry")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { editing.wrappedValue = nil }
                        }
                    }
                }
                .environment(store)
                .presentationDetents([.large])
            }
            .confirmationDialog(
                "Delete this entry?",
                isPresented: Binding(get: { deleting.wrappedValue != nil },
                                     set: { if !$0 { deleting.wrappedValue = nil } }),
                titleVisibility: .visible,
                presenting: deleting.wrappedValue
            ) { tx in
                Button("Delete", role: .destructive) {
                    Task { await store.deleteTransaction(id: tx.id) }
                }
            } message: { tx in
                Text("\(Categories.label(tx.category)) · \(Dates.dayLabel(tx.occurredAt))")
            }
    }
}
