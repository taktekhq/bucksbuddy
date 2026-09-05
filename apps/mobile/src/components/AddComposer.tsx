import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ChevronRight, StickyNote, Tag } from "lucide-react-native";

import { CategorySheet } from "@/components/ui/CategorySheet";
import { useStore } from "@/lib/store";
import { resolveCategoryIcon } from "@/lib/categoryIcons";
import { categoryColor, categoryIconName, categoryLabel } from "@bucksbuddy/core/categories";
import { type Currency, parseAmountString, toUsdCents } from "@bucksbuddy/core/currency";
import { formatUsdCents } from "@bucksbuddy/core/money";
import type { Transaction } from "@bucksbuddy/core/types";

// Mirrors src/components/AddComposer.tsx. Analytics (posthog) isn't wired up
// on mobile yet, so the two capture() calls the web version makes on save
// are omitted here rather than silently no-op'd against a fake client.
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

export function AddComposer({ editing, onClearEdit }: { editing: Transaction | null; onClearEdit: () => void }) {
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
    /* v8 ignore start */
    if (!canSave || category === null) return;
    /* v8 ignore stop */
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
      onClearEdit();
    } else {
      setDisplay("");
      setCategory(null);
      setNote("");
    }
  }

  const SelectedIcon = category ? resolveCategoryIcon(categoryIconName(category)) : null;
  const catColor = category ? categoryColor(category) : "#8E8E93";
  const dirColor = isIncome ? INCOME_COLOR : EXPENSE_COLOR;

  const amountLabel = currency === "USD" ? formatUsdCents(usdCents) : `${groupInt(display)} LBP`;
  const cta = saving
    ? "Saving…"
    : !canSave
      ? amount <= 0
        ? "Enter an amount"
        : "Choose a category"
      : `${editing ? "Save" : "Add"} ${amountLabel}`;

  return (
    <View className="gap-3 px-4 pb-5 pt-4">
      {/* AMOUNT — always visible, edited with the native keyboard. */}
      <View className="flex-row items-center gap-3 rounded-card border border-separator px-4 py-3.5">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-carrot-soft">
          <Text className="text-base font-bold text-carrot">{SYMBOL[currency]}</Text>
        </View>
        <TextInput
          inputMode="decimal"
          value={groupInt(display)}
          onChangeText={(t) => setDisplay(sanitizeAmount(t))}
          placeholder="0.00"
          accessibilityLabel="Amount"
          className="min-w-0 flex-1 font-numeric text-3xl font-bold tabular-nums text-label"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch currency"
          onPress={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
          className="rounded-lg px-2 py-1"
        >
          <Text className="text-sm font-bold text-label-secondary">{currency}</Text>
        </Pressable>
      </View>
      {currency === "LBP" && amount > 0 && (
        <Text className="-mt-1 px-1 text-xs text-label-secondary">≈ {formatUsdCents(usdCents)}</Text>
      )}

      {/* CATEGORY — wide card; opens the sheet. Shows the pick + direction. */}
      {category && SelectedIcon ? (
        <View className="flex-row items-center gap-3 rounded-card border border-separator px-4 py-3">
          <View style={{ backgroundColor: catColor }} className="h-10 w-10 items-center justify-center rounded-full">
            <SelectedIcon size={20} strokeWidth={2} color="#FFFFFF" />
          </View>
          <View className="min-w-0 flex-1">
            <Text style={{ color: dirColor }} className="text-[11px] font-semibold uppercase tracking-wide">
              {isIncome ? "Income" : "Expense"}
            </Text>
            <Text numberOfLines={1} className="font-bold text-label">
              {categoryLabel(category)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheetOpen(true)}
            className="rounded-pill border border-carrot px-3 py-1"
          >
            <Text className="text-sm font-semibold text-carrot">Change ›</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setSheetOpen(true)}
          className="w-full flex-row items-center gap-3 rounded-card border border-dashed border-carrot/40 bg-carrot-soft/40 px-4 py-3.5"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-carrot-soft">
            <Tag size={20} strokeWidth={2} color="#F56300" />
          </View>
          <View className="flex-1">
            <Text className="font-bold text-label">Add Category</Text>
            <Text className="text-sm text-label-secondary">Income or expense</Text>
          </View>
          <ChevronRight size={20} strokeWidth={2} color="#8E8E93" />
        </Pressable>
      )}

      {/* NOTE — optional, available once a category is chosen. */}
      {category && (
        <View className="flex-row items-center gap-3 rounded-card border border-separator px-4 py-3">
          <StickyNote size={20} strokeWidth={2} color="#8E8E93" />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)"
            accessibilityLabel="Note"
            maxLength={140}
            className="min-w-0 flex-1 text-base text-label"
          />
        </View>
      )}

      {/* CTA — contextual, shows the amount when ready. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => void save()}
        disabled={!canSave}
        className={`mt-1 w-full items-center rounded-pill py-3.5 ${canSave ? "bg-carrot" : "bg-separator"}`}
      >
        <Text className={`text-lg font-semibold ${canSave ? "text-white" : "text-label-secondary"}`}>{cta}</Text>
      </Pressable>

      {error && <Text className="text-center text-sm font-medium text-danger">{error}</Text>}
      {editing && (
        <Pressable accessibilityRole="button" onPress={onClearEdit} className="items-center py-1">
          <Text className="text-sm text-carrot">Cancel edit</Text>
        </Pressable>
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
