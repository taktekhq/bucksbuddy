import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Banknote, ChevronRight, Coins, Eye, EyeOff, Lock, Settings, Vault } from "lucide-react-native";

import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SparkArea } from "@/components/ui/SparkArea";
import { Carrot } from "@/components/ui/Carrot";
import { AddComposer } from "@/components/AddComposer";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { takePendingEdit } from "@bucksbuddy/core/editIntent";
import { isToday, monthLabel } from "@bucksbuddy/core/dates";
import { dailySpendSeries } from "@bucksbuddy/core/stats";
import { formatUsdCents } from "@bucksbuddy/core/money";
import { formatGrams } from "@bucksbuddy/core/gold";
import type { Transaction } from "@bucksbuddy/core/types";

// Amber/gold that reads on the light card (the metal, but legible).
const GOLD_INK = "#A16207";

// Mirrors src/screens/Home.tsx. Analytics isn't wired up on mobile yet
// (posthog), so it's omitted rather than faked. navigate("/settings")/("/stats")
// point at not-yet-built placeholder routes — next in Phase 2's order.
export function HomeScreen() {
  const { transactions, balanceCents, loading, deleteTransaction, safeTotalCents, safeGoldGrams, locked } =
    useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Editing a row on the History screen stashes the target id (editIntent.ts)
  // and pops back here — router.back() returns to this same still-mounted
  // instance rather than remounting it, so a plain mount effect wouldn't
  // fire again. useFocusEffect does, covering both the first mount and every
  // return trip.
  useFocusEffect(
    useCallback(() => {
      const pendingId = takePendingEdit();
      if (!pendingId) return;
      const tx = transactions.find((t) => t.id === pendingId);
      if (tx) setEditing(tx);
    }, [transactions]),
  );

  // The full history lives on its own "/history" screen; this screen only
  // lists today's entries so it doesn't grow without bound.
  const todays = transactions.filter((t) => isToday(t.occurred_at));

  // The safe balance is private by default — tap the eye to reveal it.
  const [safeShown, setSafeShown] = useState(false);
  const hasSavings = safeTotalCents > 0 || safeGoldGrams > 0;

  function handleEdit(tx: Transaction) {
    setEditing(tx);
  }

  function clearEdit() {
    setEditing(null);
  }

  function handleDelete(tx: Transaction) {
    Alert.alert("Delete this entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteTransaction(tx.id) },
    ]);
  }

  // When locked (this device doesn't have the passphrase yet) amounts show
  // obscured, so the safe balance can't be revealed either.
  const reveal = safeShown && !locked;

  // The last 30 days of spending, washed faintly behind the hero — the same
  // daily chart the Stats page draws, dialed down to sit on the light card.
  const sparkValues = useMemo(() => dailySpendSeries(transactions, 30).map((p) => p.totalCents), [transactions]);

  return (
    <View className="flex-1" style={{ backgroundColor: hasSavings ? "#E6F8EE" : "#F2F2F7" }}>
      <SafeAreaView className="flex-1">
        <ScrollView
          contentContainerStyle={{ gap: 20, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Carrot mark + wordmark + safe + settings — the plain Apple nav bar. */}
          <View className="flex-row items-center justify-between px-1">
            <View className="flex-row items-center gap-2">
              <Carrot className="text-2xl" />
              <Text className="font-display text-sm font-bold uppercase leading-none text-label-muted">
                Bucks{"\n"}Buddy
              </Text>
            </View>
            <View className="flex-row items-center gap-4">
              <Pressable accessibilityRole="button" accessibilityLabel="Safe" onPress={() => router.push("/safe")} className="-m-2 p-2">
                <Vault size={24} strokeWidth={1.75} color="#8E8E93" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Settings"
                onPress={() => router.push("/settings")}
                className="-m-2 p-2"
              >
                <Settings size={24} strokeWidth={1.75} color="#8E8E93" />
              </Pressable>
            </View>
          </View>

          {/* Money for the month — month caption above the net number. The safe
              balance rides along underneath so saved money shows in the picture. */}
          <View className="relative min-h-[188px] overflow-hidden rounded-card bg-surface px-5 py-5 shadow-card">
            {!locked && (
              <SparkArea
                values={sparkValues}
                stroke="rgba(245, 99, 0, 0.4)"
                fill="rgba(245, 99, 0, 0.1)"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              />
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="See your stats" onPress={() => router.push("/stats")}>
              <NetTotal cents={balanceCents} label="Balance" masked={locked} />
              <Text className="mt-1 text-[13px] font-medium text-label-secondary">{monthLabel()}</Text>
              <View pointerEvents="none" className="absolute right-0 top-1/2 -translate-y-1/2">
                <ChevronRight size={20} strokeWidth={2} color="#48484A" />
              </View>
            </Pressable>
            <View className="relative mt-4 flex-row items-center gap-3 rounded-card bg-income/10 px-4 py-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/safe")}
                className="flex-1 flex-row items-center gap-3"
              >
                <View className="h-9 w-9 items-center justify-center rounded-full bg-income/15">
                  <Vault size={20} strokeWidth={2} color="#34C759" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-income">In the safe</Text>
                  <View className="flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
                    <View className="flex-row items-center gap-1">
                      <Banknote size={16} strokeWidth={2} color="#34C759" />
                      <Text className="font-numeric text-xl font-bold tabular-nums text-income">
                        {reveal ? formatUsdCents(safeTotalCents) : "••••"}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Coins size={14} strokeWidth={2} color={GOLD_INK} />
                      <Text style={{ color: GOLD_INK }} className="font-numeric text-sm font-bold tabular-nums">
                        {reveal ? formatGrams(safeGoldGrams) : "•••"}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={reveal ? "Hide safe balance" : "Show safe balance"}
                onPress={() => setSafeShown((v) => !v)}
                disabled={locked}
                className="-m-2 p-2"
                style={{ opacity: locked ? 0.4 : 1 }}
              >
                {reveal ? <EyeOff size={20} strokeWidth={2} color="#34C759" /> : <Eye size={20} strokeWidth={2} color="#34C759" />}
              </Pressable>
            </View>
          </View>

          {/* "What's up, Doc?" — the add form is always visible and ready. While
              locked you can't encrypt new entries, so it's a nudge to unlock. */}
          <View className="gap-2">
            <SectionHeader>What&apos;s up, Doc?</SectionHeader>
            {locked ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/settings")}
                className="w-full flex-row items-center gap-3 rounded-card bg-surface px-4 py-3.5 shadow-card"
              >
                <View className="h-9 w-9 items-center justify-center rounded-full bg-grouped">
                  <Lock size={20} strokeWidth={2} color="#8E8E93" />
                </View>
                <Text className="flex-1 text-sm text-label">Locked — enter your passphrase in Settings to view and add.</Text>
              </Pressable>
            ) : (
              <View className="rounded-card bg-surface shadow-card">
                <AddComposer editing={editing} onClearEdit={clearEdit} />
              </View>
            )}
          </View>

          {/* History — today's entries inline; everything else in the drawer. */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <SectionHeader>History</SectionHeader>
              {transactions.length > 0 && (
                <Pressable accessibilityRole="button" onPress={() => router.push("/history")} className="px-2">
                  <Text className="text-sm font-semibold text-carrot">Show all</Text>
                </Pressable>
              )}
            </View>
            {loading && transactions.length === 0 ? (
              <Text className="py-10 text-center text-label-secondary">Loading…</Text>
            ) : todays.length > 0 ? (
              <HistoryList rows={todays} onEdit={handleEdit} onDelete={handleDelete} />
            ) : (
              <Text className="py-10 text-center text-label-secondary">
                {transactions.length > 0 ? "Nothin' today, Doc." : "Nothin' here yet, Doc. Add your first one above."}
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
