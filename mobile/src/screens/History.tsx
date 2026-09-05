import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { HistoryStack } from "@/components/HistoryStack";
import { HistoryTimeline } from "@/components/HistoryTimeline";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { requestEdit } from "@/lib/editIntent";
import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";
import { groupByCategory, groupByDay } from "@/lib/history";
import { useHistoryGrouping } from "@/lib/useHistoryGrouping";
import posthog from "@/lib/posthog";
import { radius, shadowSegment, white } from "@/lib/theme";
import type { Transaction } from "@/types/db";

// The full history in its own page — a deep, neutral-charcoal "rabbit hole"
// you drop into to see everything, deliberately distinct from the bright daily
// tracker and from the Safe's green vault. The page scrolls naturally. Editing
// happens back on Home (where the composer lives), so tapping edit stashes the
// target and navigates there.
//
// Two ways to read it, switchable from the header (remembered across sessions):
// a day-by-day Timeline (the default) or the old all-time By-category stacks.
const RABBIT_HOLE = {
  colors: ["#2C2C2E", "#232325", "#1C1C1E"] as const,
  stops: [0, 220, 460] as const,
  floor: "#1C1C1E",
};

export function History() {
  const { transactions, deleteTransaction } = useStore();
  const [grouping, setGrouping] = useHistoryGrouping();
  const days = useMemo(() => groupByDay(transactions), [transactions]);

  // The "By category" view is scoped to one month at a time, paged with the
  // switcher (this month, last month, or further back). The timeline stays
  // all-time. Default to the current month.
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
    navigate("/");
  }

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

  return (
    <Screen gradient={RABBIT_HOLE} statusBar="light">
      <NavHeader title="All History" onBack={() => navigate("/")} dark />

      {transactions.length === 0 ? (
        <Text style={styles.empty}>Nothin' here yet, Doc.</Text>
      ) : (
        <>
          {/* Segmented control: flip between the day-by-day timeline and the
              all-time per-category stacks. */}
          <View style={styles.tabs} accessibilityRole="tablist">
            {(
              [
                ["timeline", "Timeline"],
                ["category", "By category"],
              ] as const
            ).map(([value, label]) => {
              const active = grouping === value;
              return (
                <Press
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setGrouping(value)}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                </Press>
              );
            })}
          </View>

          {grouping === "timeline" ? (
            <HistoryTimeline days={days} onEdit={handleEdit} onDelete={handleDelete} />
          ) : (
            <View style={{ gap: 12 }}>
              <MonthSwitcher
                label={monthLabel(anchor)}
                onPrev={() => setMonthOffset((o) => o - 1)}
                onNext={() => setMonthOffset((o) => Math.min(o + 1, 0))}
                canPrev={hasOlder}
                canNext={monthOffset < 0}
              />
              {groups.length === 0 ? (
                <Text style={styles.empty}>Nothin' logged this month, Doc.</Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {groups.map((g) => (
                    <HistoryStack key={g.key} group={g} onEdit={handleEdit} onDelete={handleDelete} />
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 40,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    color: white(0.45),
  },
  tabs: {
    flexDirection: "row",
    borderRadius: radius.pill,
    backgroundColor: white(0.1),
    padding: 2,
  },
  tab: {
    flex: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  tabActive: { backgroundColor: "#FFF", ...shadowSegment },
  tabText: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: white(0.55) },
  tabTextActive: { color: "#1C1C1E" },
});
