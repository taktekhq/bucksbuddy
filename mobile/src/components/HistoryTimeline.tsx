import { memo } from "react";
import { Text, View } from "react-native";
import { HistoryStack } from "@/components/HistoryStack";
import { formatSignedUsdCents } from "@/lib/money";
import type { HistoryGroup, TimelineDay } from "@/lib/history";
import type { Transaction } from "@/types/db";

// The chronological history view: one section per day, each headed by the day's
// label and net total, with entries underneath in reverse-chronological order.
// Back-to-back entries of the same category collapse into a HistoryStack; a lone
// entry is just a row. This is the "did I log everything yesterday?" view.
//
// The full-history page has up to 500 rows, so it feeds these same pieces to a
// SectionList instead of mapping over them (PORTING.md §5): `toSections` turns
// the days into its sections and `DayHeader` is each section's `<header>`.
// `HistoryTimeline` below is the plain composition, identical to the web's.

// See lib/money — the mobile copy still returns a hex, so the class version
// lives here until it's put back.
const netColorClass = (cents: number) => {
  if (cents > 0) return "text-income";
  if (cents < 0) return "text-expense";
  return "text-label";
};

export type TimelineSection = TimelineDay & {
  data: HistoryGroup[];
  /** The first section sits flush under the page header; the rest get `gap-5`. */
  first: boolean;
};

export function toSections(days: TimelineDay[]): TimelineSection[] {
  return days.map((day, i) => ({ ...day, data: day.groups, first: i === 0 }));
}

// The web's `<header className="flex items-baseline justify-between px-1">`
// (`flex-row` added — a browser's `flex` is a row, React Native's is a column).
export const DayHeader = memo(function DayHeader({ day }: { day: TimelineDay }) {
  return (
    <View className="flex flex-row items-baseline justify-between px-1">
      <Text
        accessibilityRole="header"
        className="font-display text-xs font-bold uppercase tracking-wide text-white/55"
      >
        {day.label}
      </Text>
      <Text
        className={`font-numeric text-sm font-medium tabular-nums ${
          day.totalCents === 0 ? "text-white/55" : netColorClass(day.totalCents)
        }`}
      >
        {day.masked ? "••••" : formatSignedUsdCents(day.totalCents)}
      </Text>
    </View>
  );
});

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
    <View className="flex flex-col gap-5">
      {days.map((day) => (
        <View key={day.key} className="flex flex-col gap-1.5">
          <DayHeader day={day} />
          <View className="flex flex-col gap-1.5">
            {day.groups.map((g) => (
              // Keyed by the run's category and its newest row, never by index,
              // so a delete above a run doesn't re-key it (or hand its open
              // state to a neighbour).
              <View key={`${day.key}:${g.key}:${g.rows[0].id}`}>
                <HistoryStack group={g} onEdit={onEdit} onDelete={onDelete} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
