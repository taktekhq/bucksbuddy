import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  Banknote,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  Lock,
  Settings,
  Vault,
} from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SparkArea } from "@/components/ui/SparkArea";
import { Carrot } from "@/components/ui/Carrot";
import { AddComposer } from "@/components/AddComposer";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import posthog from "@/lib/posthog";
import { takePendingEdit } from "@/lib/editIntent";
import { isToday, monthLabel } from "@/lib/dates";
import { dailySpendSeries } from "@/lib/stats";
import { formatUsdCents } from "@/lib/money";
import { formatGrams } from "@/lib/gold";
import { colors, SAVINGS, withAlpha } from "@/lib/theme";
import type { Transaction } from "@/types/db";

// Amber/gold that reads on the light card (the metal, but legible).
const GOLD_INK = "#A16207";

export function Home() {
  const {
    transactions,
    balanceCents,
    loading,
    deleteTransaction,
    safeTotalCents,
    safeGoldGrams,
    locked,
  } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);
  // `window.scrollTo` — the page's own scroller.
  const scrollRef = useRef<ScrollView>(null);

  // The full history lives on its own "/history" page; the page itself only
  // lists today's entries so it doesn't grow without bound.
  const todays = transactions.filter((t) => isToday(t.occurred_at));

  // Editing a row on the full-history page navigates back here with the target
  // stashed; pick it up once the matching transaction is in hand. Home is the
  // root of the native stack and never unmounts, so besides the first-mount
  // read the stash is checked again every time the page comes back into focus.
  const [pendingEditId, setPendingEditId] = useState<string | null>(takePendingEdit);
  useFocusEffect(
    useCallback(() => {
      const id = takePendingEdit();
      if (id) setPendingEditId(id);
    }, []),
  );
  useEffect(() => {
    if (!pendingEditId) return;
    const tx = transactions.find((t) => t.id === pendingEditId);
    if (tx) {
      setEditing(tx);
      setPendingEditId(null);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [pendingEditId, transactions]);

  // The safe balance is private by default — tap the eye to reveal it.
  const [safeShown, setSafeShown] = useState(false);

  // When there's money or gold tucked away, the whole page picks up a soft
  // savings tint so it's obvious at a glance that the safe is in play.
  const hasSavings = safeTotalCents > 0 || safeGoldGrams > 0;

  // (The web's `useThemeColor` painted the browser chrome; Screen's StatusBar
  // does that here.)

  function handleEdit(tx: Transaction) {
    setEditing(tx);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function clearEdit() {
    setEditing(null);
  }

  // window.confirm → Alert.alert (PORTING §1), so the confirm branch runs in
  // the button's callback instead of after an awaited prompt.
  function handleDelete(tx: Transaction) {
    Alert.alert("Delete this entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTransaction(tx.id);
          posthog.capture("transaction_deleted", {
            category: tx.category,
            is_income: tx.is_income,
          });
        },
      },
    ]);
  }

  // When locked (this device doesn't have the passphrase yet) amounts show
  // obscured, so the safe balance can't be revealed either.
  const reveal = safeShown && !locked;

  // The last 30 days of spending, washed faintly behind the hero — the same
  // daily chart the Stats page draws, dialed down to sit on the light card.
  // Hidden while locked: masked amounts read as zeros, and a flat line would
  // be a lie.
  const sparkValues = useMemo(
    () => dailySpendSeries(transactions, 30).map((p) => p.totalCents),
    [transactions],
  );

  return (
    // Savings tint as a fixed, viewport-filling backdrop so the gradient spans
    // the full width (instead of being clipped to the centered max-w-md column)
    // and never flashes the canvas on overscroll. `gradientFixed` is Screen's
    // version of the web's `fixed inset-0` layer. The web writes
    // `transition-[background] duration-500`, but a CSS gradient can't actually
    // transition to `none` — it snaps there too, so it snaps here.
    <Screen
      scrollRef={scrollRef}
      gradient={hasSavings ? SAVINGS : undefined}
      gradientFixed
      className="flex min-h-full flex-col gap-5 px-4 pb-8 pt-4"
    >
      {/* Carrot mark + wordmark + safe + settings — the plain Apple nav bar. */}
      <View className="flex flex-row items-center justify-between px-1">
        <View className="flex flex-row items-center gap-2">
          <Carrot size={24} />
          <Text className="font-display text-sm font-bold uppercase leading-none text-label-muted">
            {"Bucks\nBuddy"}
          </Text>
        </View>
        <View className="flex flex-row items-center gap-4">
          <Press
            onPress={() => navigate("/safe")}
            className="-m-2 p-2 text-label-secondary"
            accessibilityLabel="Safe"
          >
            <Vault size={24} strokeWidth={1.75} color={colors.labelSecondary} />
          </Press>
          <Press
            onPress={() => navigate("/settings")}
            className="-m-2 p-2 text-label-secondary"
            accessibilityLabel="Settings"
          >
            <Settings size={24} strokeWidth={1.75} color={colors.labelSecondary} />
          </Press>
        </View>
      </View>

      {/* Money for the month — month caption above the net number. The safe
          balance rides along underneath so saved money shows in the picture.
          Tapping the number opens the Stats page; the spending sparkline sits
          washed-out behind everything (overflow-hidden clips it to the card's
          radius). */}
      <View>
        {/* min-h matches the Stats headline card exactly, so tapping through
            feels like the same card changing rooms. (Keep in sync with
            Stats.tsx.) */}
        <View className="relative min-h-[188px] overflow-hidden rounded-card bg-surface px-5 py-5 shadow-card">
          {!locked && (
            // SparkArea bakes in the web's
            // `pointer-events-none absolute inset-0 h-full w-full`.
            <SparkArea
              className="pointer-events-none absolute inset-0 h-full w-full"
              values={sparkValues}
              stroke="rgba(245, 99, 0, 0.4)"
              fill="rgba(245, 99, 0, 0.1)"
            />
          )}
          <Press
            onPress={() => navigate("/stats")}
            accessibilityLabel="See your stats"
            className="relative block w-full text-left"
          >
            {/* The headline is the running balance — it carries across months
                instead of resetting to $0 on the 1st. Just the month rides
                underneath for context: a per-month net would be misleading here,
                since a carried-over surplus or deficit isn't money earned or
                lost this month. (Per-month spending lives on the Stats page.) */}
            <NetTotal cents={balanceCents} label="Balance" masked={locked} />
            <Text className="mt-1 text-[13px] font-medium text-label-secondary">
              {monthLabel()}
            </Text>
            {/* iOS-style disclosure hint: this number goes somewhere. */}
            <View
              accessible={false}
              pointerEvents="none"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-label-muted"
            >
              <ChevronRight size={20} strokeWidth={2} color={colors.labelMuted} />
            </View>
          </Press>
          {/* Only the number is the stats tap target — this row already has
              buttons of its own, and nesting them would be invalid HTML.
              `relative` keeps the row above the sparkline. */}
          <View className="relative mt-4 flex flex-row items-center gap-3 rounded-card bg-income/10 px-4 py-3">
            <Press
              onPress={() => navigate("/safe")}
              className="flex min-w-0 flex-1 flex-row items-center gap-3 text-left"
            >
              <View className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-income/15 text-income">
                <Vault size={20} strokeWidth={2} color={colors.income} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-income">
                  In the safe
                </Text>
                <View className="flex flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
                  <View className="flex flex-row items-center gap-1 font-numeric text-xl font-bold tabular-nums text-income">
                    <Banknote size={16} strokeWidth={2} color={colors.income} />
                    <Text className="font-numeric text-xl font-bold tabular-nums text-income">
                      {reveal ? formatUsdCents(safeTotalCents) : "••••"}
                    </Text>
                  </View>
                  {/* The web's `style={{ color: GOLD_INK }}` on this span is
                      inherited by its children; here the icon takes it as a
                      prop and the Text carries it itself (§2a/§2b). */}
                  <View className="flex flex-row items-center gap-1 font-numeric text-sm font-bold tabular-nums">
                    <Coins size={14} strokeWidth={2} color={GOLD_INK} />
                    <Text
                      className="font-numeric text-sm font-bold tabular-nums"
                      style={{ color: GOLD_INK }}
                    >
                      {reveal ? formatGrams(safeGoldGrams) : "•••"}
                    </Text>
                  </View>
                </View>
              </View>
            </Press>
            <Press
              onPress={() => setSafeShown((v) => !v)}
              disabled={locked}
              accessibilityLabel={reveal ? "Hide safe balance" : "Show safe balance"}
              accessibilityState={{ selected: reveal }}
              className="-m-2 shrink-0 p-2 text-income/70 disabled:opacity-40"
            >
              {reveal ? (
                <EyeOff size={20} strokeWidth={2} color={withAlpha(colors.income, 0.7)} />
              ) : (
                <Eye size={20} strokeWidth={2} color={withAlpha(colors.income, 0.7)} />
              )}
            </Press>
          </View>
        </View>
      </View>

      {/* "What's up, Doc?" — the add form is always visible and ready. While
          locked you can't encrypt new entries, so it's a nudge to unlock. */}
      <View className="flex flex-col gap-2">
        <SectionHeader>What&apos;s up, Doc?</SectionHeader>
        {locked ? (
          <Press
            onPress={() => navigate("/settings")}
            className="flex w-full flex-row items-center gap-3 rounded-card bg-surface px-4 py-3.5 text-left shadow-card"
          >
            <View className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grouped text-label-secondary">
              <Lock size={20} strokeWidth={2} color={colors.labelSecondary} />
            </View>
            <Text className="flex-1 text-sm text-label">
              Locked — enter your passphrase in Settings to view and add.
            </Text>
          </Press>
        ) : (
          <View className="rounded-card bg-surface shadow-card">
            <AddComposer editing={editing} onClearEdit={clearEdit} />
          </View>
        )}
      </View>

      {/* History — today's entries inline; everything else in the drawer. */}
      <View className="flex flex-col gap-2">
        <View className="flex flex-row items-center justify-between">
          <SectionHeader>History</SectionHeader>
          {transactions.length > 0 && (
            <Press onPress={() => navigate("/history")} className="px-2 text-sm font-semibold text-carrot">
              <Text className="text-sm font-semibold text-carrot">Show all</Text>
            </Press>
          )}
        </View>
        {loading && transactions.length === 0 ? (
          <Text className="py-10 text-center text-label-secondary">Loading…</Text>
        ) : todays.length > 0 ? (
          <HistoryList rows={todays} onEdit={handleEdit} onDelete={handleDelete} />
        ) : (
          <Text className="py-10 text-center text-label-secondary">
            {transactions.length > 0
              ? "Nothin' today, Doc."
              : "Nothin' here yet, Doc. Add your first one above."}
          </Text>
        )}
      </View>
    </Screen>
  );
}
