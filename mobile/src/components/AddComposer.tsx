import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronRight, StickyNote, Tag } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatUsdCents } from "@/lib/money";
import posthog from "@/lib/posthog";
import { colors, numeric, radius } from "@/lib/theme";
import type { Transaction } from "@/types/db";

const INCOME_COLOR = "#34C759";
const EXPENSE_COLOR = "#FF3B30";
const SYMBOL: Record<Currency, string> = { USD: "$", LBP: "LL" };

// Keep the typed string clean: digits, a single dot, max two decimals.
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) {
    v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 2);
  }
  return v;
}

function groupInt(s: string): string {
  const [i, d] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${grouped}.${d}` : grouped;
}

export function AddComposer({
  editing,
  onClearEdit,
}: {
  editing: Transaction | null;
  onClearEdit: () => void;
}) {
  const { lbpPerUsd, addTransaction, updateTransaction } = useStore();
  const [isIncome, setIsIncome] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [note, setNote] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setIsIncome(editing.is_income);
      setCategory(editing.category);
      setCurrency(editing.original_currency);
      setDisplay(String(editing.original_amount));
      setNote(editing.note ?? "");
      setError(null);
    } else {
      setIsIncome(false);
      setCategory(null);
      setCurrency("USD");
      setDisplay("");
      setNote("");
      setError(null);
    }
    setSheetOpen(false);
  }, [editing]);

  const amount = parseAmountString(display);
  const usdCents = toUsdCents(amount, currency, lbpPerUsd);
  const canSave = category !== null && amount > 0 && !saving;

  function changeDirection(next: boolean) {
    setIsIncome(next);
    setCategory(null);
  }

  function pickCategory(id: string) {
    setCategory(id);
    setSheetOpen(false);
  }

  async function save() {
    if (!canSave || category === null) return;
    setSaving(true);
    setError(null);

    const trimmedNote = note.trim();
    const payload = {
      is_income: isIncome,
      category,
      amount_usd_cents: usdCents,
      original_currency: currency,
      original_amount: amount,
      rate_used: lbpPerUsd,
      note: trimmedNote === "" ? null : trimmedNote,
    };

    const { error: saveError } = editing
      ? await updateTransaction(editing.id, payload)
      : await addTransaction(payload);

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    if (editing) {
      posthog.capture("transaction_updated", { category, is_income: isIncome, currency });
      onClearEdit();
    } else {
      posthog.capture("transaction_added", { category, is_income: isIncome, currency });
      setDisplay("");
      setCategory(null);
      setNote("");
    }
  }

  const SelectedIcon = category ? categoryIcon(category) : null;
  const catColor = category ? categoryColor(category) : "#8E8E93";
  const dirColor = isIncome ? INCOME_COLOR : EXPENSE_COLOR;

  const amountLabel =
    currency === "USD" ? formatUsdCents(usdCents) : `${groupInt(display)} LBP`;
  const cta = saving
    ? "Saving…"
    : !canSave
      ? amount <= 0
        ? "Enter an amount"
        : "Choose a category"
      : `${editing ? "Save" : "Add"} ${amountLabel}`;

  return (
    <View style={styles.composer}>
      {/* AMOUNT — always visible, edited with the native keyboard. */}
      <View style={styles.field}>
        <View style={styles.symbol}>
          <Text style={styles.symbolText}>{SYMBOL[currency]}</Text>
        </View>
        <TextInput
          keyboardType="decimal-pad"
          value={groupInt(display)}
          onChangeText={(t) => setDisplay(sanitizeAmount(t))}
          placeholder="0.00"
          placeholderTextColor={colors.labelSecondary}
          accessibilityLabel="Amount"
          style={styles.amountInput}
        />
        <Press
          onPress={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
          accessibilityLabel="Switch currency"
          style={styles.currency}
          pressedStyle={{ backgroundColor: colors.grouped }}
        >
          <Text style={styles.currencyText}>{currency}</Text>
        </Press>
      </View>
      {currency === "LBP" && amount > 0 && (
        <Text style={styles.approx}>≈ {formatUsdCents(usdCents)}</Text>
      )}

      {/* CATEGORY — wide card; opens the sheet. Shows the pick + direction. */}
      {category && SelectedIcon ? (
        <View style={[styles.field, styles.fieldTight]}>
          <View style={[styles.symbol, { backgroundColor: catColor }]}>
            <SelectedIcon size={20} strokeWidth={2} color="#FFF" />
          </View>
          <View style={styles.body}>
            <Text style={[styles.direction, { color: dirColor }]}>
              {isIncome ? "Income" : "Expense"}
            </Text>
            <Text style={styles.categoryName} numberOfLines={1}>
              {categoryLabel(category)}
            </Text>
          </View>
          <Press onPress={() => setSheetOpen(true)} style={styles.change}>
            <Text style={styles.changeText}>Change ›</Text>
          </Press>
        </View>
      ) : (
        <Press onPress={() => setSheetOpen(true)} style={styles.pickCategory}>
          <View style={styles.symbol}>
            <Tag size={20} strokeWidth={2} color={colors.carrot} />
          </View>
          <View>
            <Text style={styles.categoryName}>Add Category</Text>
            <Text style={styles.hint}>Income or expense</Text>
          </View>
          <View style={{ marginLeft: "auto" }}>
            <ChevronRight size={20} strokeWidth={2} color={colors.labelSecondary} />
          </View>
        </Press>
      )}

      {/* NOTE — optional, available once a category is chosen. */}
      {category && (
        <View style={[styles.field, styles.fieldTight]}>
          <StickyNote size={20} strokeWidth={2} color={colors.labelSecondary} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.labelSecondary}
            accessibilityLabel="Note"
            maxLength={140}
            style={styles.noteInput}
          />
        </View>
      )}

      {/* CTA — contextual, shows the amount when ready. */}
      <Press
        onPress={save}
        disabled={!canSave}
        style={[styles.cta, { backgroundColor: canSave ? colors.carrot : colors.separator }]}
      >
        <Text style={[styles.ctaText, { color: canSave ? "#FFF" : colors.labelSecondary }]}>
          {cta}
        </Text>
      </Press>

      {error && <Text style={styles.error}>{error}</Text>}
      {editing && (
        <Press onPress={onClearEdit} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel edit</Text>
        </Press>
      )}

      <CategorySheet
        open={sheetOpen}
        isIncome={isIncome}
        selected={category}
        onChangeDirection={changeDirection}
        onSelect={pickCategory}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { gap: 12, paddingHorizontal: 16, paddingBottom: 20, paddingTop: 16 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldTight: { paddingVertical: 12 },
  symbol: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.carrotSoft,
  },
  symbolText: { fontSize: 16, fontWeight: "700", color: colors.carrot },
  amountInput: {
    ...numeric,
    flex: 1,
    minWidth: 0,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    color: colors.label,
    padding: 0,
  },
  currency: { borderRadius: radius.lg, paddingHorizontal: 8, paddingVertical: 4 },
  currencyText: { fontSize: 14, fontWeight: "700", color: colors.labelSecondary },
  approx: { marginTop: -4, paddingHorizontal: 4, fontSize: 12, lineHeight: 16, color: colors.labelSecondary },
  body: { flex: 1, minWidth: 0 },
  direction: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  categoryName: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.label },
  hint: { fontSize: 14, lineHeight: 20, color: colors.labelSecondary },
  change: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.carrot,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  changeText: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.carrot },
  pickCategory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(245,99,0,0.4)",
    backgroundColor: "rgba(255,241,230,0.4)",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noteInput: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, color: colors.label, padding: 0 },
  cta: {
    marginTop: 4,
    width: "100%",
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { fontSize: 18, lineHeight: 28, fontWeight: "600" },
  error: { textAlign: "center", fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.danger },
  cancel: { alignSelf: "center", paddingVertical: 4 },
  cancelText: { fontSize: 14, lineHeight: 20, color: colors.carrot },
});
