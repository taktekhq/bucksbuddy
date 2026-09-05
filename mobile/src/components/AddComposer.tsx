import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { ChevronRight, StickyNote, Tag } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatUsdCents } from "@/lib/money";
import posthog from "@/lib/posthog";
import { colors } from "@/lib/theme";
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
    // Defensive guard: the CTA is disabled unless canSave, so this never
    // returns in practice — it's here for safety and to narrow `category`.
    /* istanbul ignore next -- unreachable: the CTA is disabled unless canSave */
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
    }
    else {
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
    <View className="flex flex-col gap-3 px-4 pb-5 pt-4">
      {/* AMOUNT — always visible, edited with the native keyboard. */}
      <View className="flex flex-row items-center gap-3 rounded-card border border-separator px-4 py-3.5">
        <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-base font-bold text-carrot">
          <Text className="text-base font-bold text-carrot">{SYMBOL[currency]}</Text>
        </View>
        <TextInput
          keyboardType="decimal-pad"
          value={groupInt(display)}
          onChangeText={(t) => setDisplay(sanitizeAmount(t))}
          placeholder="0.00"
          placeholderTextColor={colors.labelSecondary}
          accessibilityLabel="Amount"
          className="min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-label placeholder:text-label-secondary"
        />
        <Press
          onPress={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
          accessibilityLabel="Switch currency"
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-label-secondary active:bg-grouped"
        >
          <Text className="text-sm font-bold text-label-secondary">{currency}</Text>
        </Press>
      </View>
      {currency === "LBP" && amount > 0 && (
        <Text className="-mt-1 px-1 text-xs text-label-secondary">
          ≈ {formatUsdCents(usdCents)}
        </Text>
      )}

      {/* CATEGORY — wide card; opens the sheet. Shows the pick + direction. */}
      {category && SelectedIcon ? (
        <View className="flex flex-row items-center gap-3 rounded-card border border-separator px-4 py-3">
          <View
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: catColor }}
          >
            <SelectedIcon size={20} strokeWidth={2} color={colors.white} />
          </View>
          <View className="min-w-0 flex-1">
            <Text
              className="text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: dirColor }}
            >
              {isIncome ? "Income" : "Expense"}
            </Text>
            <Text className="truncate font-bold text-label" numberOfLines={1}>
              {categoryLabel(category)}
            </Text>
          </View>
          <Press
            onPress={() => setSheetOpen(true)}
            className="shrink-0 rounded-pill border border-carrot px-3 py-1 text-sm font-semibold text-carrot"
          >
            <Text className="text-sm font-semibold text-carrot">Change ›</Text>
          </Press>
        </View>
      ) : (
        <Press
          onPress={() => setSheetOpen(true)}
          className="flex w-full flex-row items-center gap-3 rounded-card border border-dashed border-carrot/40 bg-carrot-soft/40 px-4 py-3.5"
        >
          <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-carrot-soft text-carrot">
            <Tag size={20} strokeWidth={2} color={colors.carrot} />
          </View>
          <View className="text-left">
            <Text className="font-bold text-label">Add Category</Text>
            <Text className="text-sm text-label-secondary">Income or expense</Text>
          </View>
          <View className="ml-auto shrink-0">
            <ChevronRight size={20} strokeWidth={2} color={colors.labelSecondary} />
          </View>
        </Press>
      )}

      {/* NOTE — optional, available once a category is chosen. */}
      {category && (
        <View className="flex flex-row items-center gap-3 rounded-card border border-separator px-4 py-3">
          <StickyNote size={20} strokeWidth={2} color={colors.labelSecondary} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.labelSecondary}
            accessibilityLabel="Note"
            maxLength={140}
            className="min-w-0 flex-1 bg-transparent text-base text-label placeholder:text-label-secondary"
          />
        </View>
      )}

      {/* CTA — contextual, shows the amount when ready. */}
      <Press
        onPress={save}
        disabled={!canSave}
        className={`mt-1 w-full rounded-pill py-3.5 text-lg font-semibold text-white transition ${
          canSave ? "bg-carrot" : "bg-separator text-label-secondary"
        }`}
      >
        <Text
          className={`text-center text-lg font-semibold transition ${
            canSave ? "text-white" : "text-label-secondary"
          }`}
        >
          {cta}
        </Text>
      </Press>

      {error && (
        <Text className="text-center text-sm font-medium text-danger">{error}</Text>
      )}
      {editing && (
        <View className="text-center">
          <Press onPress={onClearEdit} className="py-1 text-sm text-carrot">
            <Text className="text-center text-sm text-carrot">Cancel edit</Text>
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
