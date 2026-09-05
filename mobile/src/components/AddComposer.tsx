import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ChevronRight, StickyNote, Tag } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatUsdCents } from "@/lib/money";
import posthog from "@/lib/posthog";
import {
  colors,
  motion,
  numeric,
  radius,
  space,
  text,
  trackingWide,
  weight,
} from "@/lib/theme";
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

  // The CTA's `transition`: blend bg-separator ↔ bg-carrot (and the label's
  // grey ↔ white) over 150ms instead of flipping.
  const ready = useSharedValue(canSave ? 1 : 0);
  useEffect(() => {
    ready.value = withTiming(canSave ? 1 : 0, { duration: motion.transition });
  }, [canSave, ready]);
  const ctaStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(ready.value, [0, 1], [colors.separator, colors.carrot]),
  }));
  const ctaLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(ready.value, [0, 1], [colors.labelSecondary, colors.white]),
  }));

  function changeDirection(next: boolean) {
    setIsIncome(next);
    setCategory(null);
  }

  function pickCategory(id: string) {
    setCategory(id);
    setSheetOpen(false);
  }

  async function save() {
    // Defensive guard: the CTA is disabled unless canSave, so this never
    // returns in practice — it's here for safety and to narrow `category`.
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
      posthog.capture("transaction_updated", {
        category,
        is_income: isIncome,
        currency,
      });
      onClearEdit();
    } else {
      posthog.capture("transaction_added", {
        category,
        is_income: isIncome,
        currency,
      });
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
      <View style={[styles.field, styles.fieldRoomy]}>
        <View style={[styles.badge, styles.badgeSoft]}>
          <Text style={styles.symbol}>{SYMBOL[currency]}</Text>
        </View>
        <TextInput
          keyboardType="decimal-pad"
          value={groupInt(display)}
          onChangeText={(t) => setDisplay(sanitizeAmount(t))}
          placeholder="0.00"
          placeholderTextColor={colors.labelSecondary}
          accessibilityLabel="Amount"
          style={styles.amount}
        />
        <Press
          onPress={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
          accessibilityLabel="Switch currency"
          style={styles.currency}
          pressedStyle={styles.currencyPressed}
        >
          <Text style={styles.currencyText}>{currency}</Text>
        </Press>
      </View>
      {currency === "LBP" && amount > 0 && (
        <Text style={styles.approx}>≈ {formatUsdCents(usdCents)}</Text>
      )}

      {/* CATEGORY — wide card; opens the sheet. Shows the pick + direction. */}
      {category && SelectedIcon ? (
        <View style={styles.field}>
          <View style={[styles.badge, { backgroundColor: catColor }]}>
            <SelectedIcon size={20} strokeWidth={2} color={colors.white} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.direction, { color: dirColor }]}>
              {isIncome ? "Income" : "Expense"}
            </Text>
            <Text style={styles.strong} numberOfLines={1}>
              {categoryLabel(category)}
            </Text>
          </View>
          <Press onPress={() => setSheetOpen(true)} style={styles.change}>
            <Text style={styles.changeText}>Change ›</Text>
          </Press>
        </View>
      ) : (
        <Press onPress={() => setSheetOpen(true)} style={styles.addCategory}>
          <View style={[styles.badge, styles.badgeSoft]}>
            <Tag size={20} strokeWidth={2} color={colors.carrot} />
          </View>
          <View>
            <Text style={styles.strong}>Add Category</Text>
            <Text style={styles.hint}>Income or expense</Text>
          </View>
          <View style={styles.trailing}>
            <ChevronRight size={20} strokeWidth={2} color={colors.labelSecondary} />
          </View>
        </Press>
      )}

      {/* NOTE — optional, available once a category is chosen. */}
      {category && (
        <View style={styles.field}>
          <StickyNote size={20} strokeWidth={2} color={colors.labelSecondary} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.labelSecondary}
            accessibilityLabel="Note"
            maxLength={140}
            style={styles.note}
          />
        </View>
      )}

      {/* CTA — contextual, shows the amount when ready. */}
      <Press onPress={save} disabled={!canSave} style={styles.ctaPress}>
        <Animated.View style={[styles.cta, ctaStyle]}>
          <Animated.Text style={[styles.ctaText, ctaLabelStyle]}>{cta}</Animated.Text>
        </Animated.View>
      </Press>

      {error && <Text style={styles.error}>{error}</Text>}
      {editing && (
        <View style={styles.center}>
          <Press onPress={onClearEdit} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel edit</Text>
          </Press>
        </View>
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
  // flex flex-col gap-3 px-4 pb-5 pt-4
  composer: {
    gap: space(3),
    paddingHorizontal: space(4),
    paddingBottom: space(5),
    paddingTop: space(4),
  },
  // flex items-center gap-3 rounded-card border border-separator px-4 py-3
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.separator,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  // py-3.5 (the amount field)
  fieldRoomy: { paddingVertical: space(3.5) },
  // h-10 w-10 rounded-full
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeSoft: { backgroundColor: colors.carrotSoft },
  // text-base font-bold text-carrot
  symbol: { ...text.base, fontWeight: weight.bold, color: colors.carrot },
  // min-w-0 flex-1 font-numeric text-3xl font-bold tabular-nums text-label
  amount: {
    ...numeric,
    ...text["3xl"],
    flex: 1,
    minWidth: 0,
    fontWeight: weight.bold,
    color: colors.label,
    padding: 0,
  },
  // rounded-lg px-2 py-1 text-sm font-bold text-label-secondary active:bg-grouped
  currency: {
    borderRadius: radius.lg,
    paddingHorizontal: space(2),
    paddingVertical: space(1),
  },
  currencyPressed: { backgroundColor: colors.grouped },
  currencyText: { ...text.sm, fontWeight: weight.bold, color: colors.labelSecondary },
  // -mt-1 px-1 text-xs text-label-secondary
  approx: {
    marginTop: -space(1),
    paddingHorizontal: space(1),
    ...text.xs,
    color: colors.labelSecondary,
  },
  body: { flex: 1, minWidth: 0 },
  // text-[11px] font-semibold uppercase tracking-wide
  direction: {
    ...text["11"],
    fontWeight: weight.semibold,
    textTransform: "uppercase",
    letterSpacing: trackingWide(11),
  },
  // font-bold text-label
  strong: { ...text.base, fontWeight: weight.bold, color: colors.label },
  // text-sm text-label-secondary
  hint: { ...text.sm, color: colors.labelSecondary },
  // rounded-pill border border-carrot px-3 py-1 text-sm font-semibold text-carrot
  change: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.carrot,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  changeText: { ...text.sm, fontWeight: weight.semibold, color: colors.carrot },
  // flex w-full items-center gap-3 rounded-card border border-dashed
  // border-carrot/40 bg-carrot-soft/40 px-4 py-3.5
  addCategory: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(245,99,0,0.4)",
    backgroundColor: "rgba(255,241,230,0.4)",
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
  },
  trailing: { marginLeft: "auto" },
  // min-w-0 flex-1 text-base text-label
  note: {
    ...text.base,
    flex: 1,
    minWidth: 0,
    color: colors.label,
    padding: 0,
  },
  // mt-1 w-full rounded-pill
  ctaPress: { marginTop: space(1), width: "100%", borderRadius: radius.pill },
  // py-3.5, bg animated
  cta: {
    borderRadius: radius.pill,
    paddingVertical: space(3.5),
    alignItems: "center",
  },
  // text-lg font-semibold
  ctaText: { ...text.lg, fontWeight: weight.semibold },
  // text-center text-sm font-medium text-danger
  error: {
    ...text.sm,
    textAlign: "center",
    fontWeight: weight.medium,
    color: colors.danger,
  },
  center: { alignItems: "center" },
  // py-1 text-sm text-carrot
  cancel: { paddingVertical: space(1) },
  cancelText: { ...text.sm, color: colors.carrot },
});
