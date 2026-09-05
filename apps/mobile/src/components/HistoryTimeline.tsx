import { Text, View } from "react-native";

import { HistoryStack } from "@/components/HistoryStack";
import { formatSignedUsdCents, netColorClass } from "@bucksbuddy/core/money";
import type { TimelineDay } from "@bucksbuddy/core/history";
import type { Transaction } from "@bucksbuddy/core/types";

// The chronological history view: one section per day, each headed by the day's
// label and net total, with entries underneath in reverse-chronological order.
// Mirrors src/components/HistoryTimeline.tsx.
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
    <View className="gap-5">
      {days.map((day) => (
        <View key={day.key} className="gap-1.5">
          <View className="flex-row items-baseline justify-between px-1">
            <Text className="font-display text-xs font-bold uppercase tracking-wide text-white/55">{day.label}</Text>
            <Text
              className={`font-numeric text-sm font-medium tabular-nums ${
                day.totalCents === 0 ? "text-white/55" : netColorClass(day.totalCents)
              }`}
            >
              {day.masked ? "••••" : formatSignedUsdCents(day.totalCents)}
            </Text>
          </View>
          <View className="gap-1.5">
            {day.groups.map((g, i) => (
              <HistoryStack key={`${day.key}:${i}`} group={g} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
