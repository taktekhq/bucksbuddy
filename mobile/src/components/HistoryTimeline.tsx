import { StyleSheet, Text, View } from "react-native";
import { HistoryStack } from "@/components/HistoryStack";
import { formatSignedUsdCents, netColor } from "@/lib/money";
import { display, numeric, white } from "@/lib/theme";
import type { TimelineDay } from "@/lib/history";
import type { Transaction } from "@/types/db";

// The chronological history view: one section per day, each headed by the day's
// label and net total, with entries underneath in reverse-chronological order.
// Back-to-back entries of the same category collapse into a HistoryStack; a lone
// entry is just a row. This is the "did I log everything yesterday?" view.
export function HistoryTimeline({
  days,
  onEdit,
  onDelete,
}: {
  days: TimelineDay[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  return (
    <View style={styles.days}>
      {days.map((day) => (
        <View key={day.key} style={styles.day}>
          <View style={styles.header}>
            <Text style={styles.label}>{day.label}</Text>
            <Text
              style={[
                styles.total,
                { color: day.totalCents === 0 ? white(0.55) : netColor(day.totalCents) },
              ]}
            >
              {day.masked ? "••••" : formatSignedUsdCents(day.totalCents)}
            </Text>
          </View>
          <View style={styles.list}>
            {day.groups.map((g, i) => (
              <HistoryStack
                key={`${day.key}:${i}`}
                group={g}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  days: { gap: 20 },
  day: { gap: 6 },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  label: {
    ...display,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    color: white(0.55),
  },
  total: { ...numeric, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  list: { gap: 6 },
});
