import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";

import { HistoryStack } from "@/components/HistoryStack";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { useStore } from "@/lib/store";
import { useHistoryGrouping } from "@/lib/useHistoryGrouping";
import { requestEdit } from "@bucksbuddy/core/editIntent";
import { currentMonthRange, monthAnchor, monthLabel } from "@bucksbuddy/core/dates";
import { groupByCategory, groupByDay } from "@bucksbuddy/core/history";
import type { Transaction } from "@bucksbuddy/core/types";

// The full history in its own screen — a deep, neutral-charcoal "rabbit hole"
// you drop into to see everything, deliberately distinct from the bright daily
// tracker. Mirrors src/screens/History.tsx. Editing happens back on Home
// (where the composer lives): tapping edit stashes the target via
// editIntent.requestEdit and pops back to it, where a focus effect picks it
// up (see HomeScreen.tsx) — router.back() returns to the same still-mounted
// Home instance rather than remounting it, so no fresh navigation is needed
// the way web's hash router requires.
//
// The gradient stops are approximated as fractions rather than web's fixed
// pixel stops (0/220px/460px) — native screens vary in height, so this reads
// close rather than pixel-identical.
export function HistoryScreen() {
  const { transactions, deleteTransaction } = useStore();
  const [grouping, setGrouping] = useHistoryGrouping();
  const days = useMemo(() => groupByDay(transactions), [transactions]);

  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = useMemo(() => monthAnchor(monthOffset), [monthOffset]);
  const monthTx = useMemo(() => {
    const { from, to } = currentMonthRange(anchor);
    return transactions.filter((t) => {
      const d = new Date(t.occurred_at);
      return d >= from && d < to;
    });
  }, [transactions, anchor]);
  const groups = useMemo(() => groupByCategory(monthTx), [monthTx]);
  const hasOlder = useMemo(() => {
    const { from } = currentMonthRange(anchor);
    return transactions.some((t) => new Date(t.occurred_at) < from);
  }, [transactions, anchor]);

  function handleEdit(tx: Transaction) {
    requestEdit(tx.id);
    router.back();
  }

  function handleDelete(tx: Transaction) {
    Alert.alert("Delete this entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void deleteTransaction(tx.id) },
    ]);
  }

  return (
    <View className="flex-1 bg-[#1C1C1E]">
      <LinearGradient
        colors={["#2C2C2E", "#232325", "#1C1C1E"]}
        locations={[0, 0.3, 0.6]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView className="flex-1">
        <ScrollView contentContainerStyle={{ gap: 20, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 }}>
          {/* Dark nav: back chevron + centered title. */}
          <View className="relative flex-row items-center justify-center py-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={{ position: "absolute", left: 0 }}
              className="-m-2 p-2"
            >
              <ChevronLeft size={24} strokeWidth={2.5} color="#F56300" />
            </Pressable>
            <Text className="font-display text-base font-bold uppercase tracking-wide text-white/90">
              All History
            </Text>
          </View>

          {transactions.length === 0 ? (
            <Text className="py-10 text-center text-white/45">Nothin' here yet, Doc.</Text>
          ) : (
            <>
              {/* Segmented control: flip between the day-by-day timeline and the
                  all-time per-category stacks. */}
              <View className="flex-row rounded-pill bg-white/10 p-0.5">
                {(
                  [
                    ["timeline", "Timeline"],
                    ["category", "By category"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: grouping === value }}
                    onPress={() => setGrouping(value)}
                    className={`flex-1 items-center rounded-pill px-3 py-1.5 ${
                      grouping === value ? "bg-white" : ""
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${grouping === value ? "text-[#1C1C1E]" : "text-white/55"}`}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {grouping === "timeline" ? (
                <HistoryTimeline days={days} onEdit={handleEdit} onDelete={handleDelete} />
              ) : (
                <View className="gap-3">
                  <MonthSwitcher
                    label={monthLabel(anchor)}
                    onPrev={() => setMonthOffset((o) => o - 1)}
                    onNext={() => setMonthOffset((o) => Math.min(o + 1, 0))}
                    canPrev={hasOlder}
                    canNext={monthOffset < 0}
                  />
                  {groups.length === 0 ? (
                    <Text className="py-10 text-center text-white/45">Nothin&apos; logged this month, Doc.</Text>
                  ) : (
                    <View className="gap-1.5">
                      {groups.map((g) => (
                        <HistoryStack key={g.key} group={g} onEdit={handleEdit} onDelete={handleDelete} />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
