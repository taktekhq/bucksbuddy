import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { HistoryStack } from "@/components/HistoryStack";
import { formatSignedUsdCents, netColor } from "@/lib/money";
import { display, numeric, text, trackingWide, weight, white } from "@/lib/theme";
import type { HistoryGroup, TimelineDay } from "@/lib/history";
import type { Transaction } from "@/types/db";

// The chronological history view: one section per day, each headed by the day's
// label and net total, with entries underneath in reverse-chronological order.
// Back-to-back entries of the same category collapse into a HistoryStack; a lone
// entry is just a row. This is the "did I log everything yesterday?" view.
//
// The full-history page virtualizes this through a SectionList, so the pieces
// are exported on their own: `toSections` turns the days into sections and
// `DayHeader` is the `<header>` of each. `HistoryTimeline` below is the plain,
// non-virtualized composition of the same parts.

/** `gap-5` between day sections. */
export const SECTION_GAP = 20;
/** `gap-1.5` between a day's header and its rows, and between rows. */
export const ROW_GAP = 6;

export type TimelineSection = TimelineDay & {
  data: HistoryGroup[];
  /** The first section sits flush under the page header; the rest get `gap-5`. */
  first: boolean;
};

export function toSections(days: TimelineDay[]): TimelineSection[] {
  return days.map((day, i) => ({ ...day, data: day.groups, first: i === 0 }));
}

// <header class="flex items-baseline justify-between px-1">
export const DayHeader = memo(function DayHeader({
  day,
  first = true,
}: {
  day: TimelineDay;
  first?: boolean;
}) {
  return (
    <View style={[styles.header, !first && { marginTop: SECTION_GAP }]}>
      <Text style={styles.label} accessibilityRole="header">
        {day.label}
      </Text>
      <Text
        style={[
          styles.total,
          { color: day.totalCents === 0 ? white(0.55) : netColor(day.totalCents) },
        ]}
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
    <View style={styles.days}>
      {days.map((day) => (
        <View key={day.key} style={styles.day}>
          <DayHeader day={day} />
          <View style={styles.list}>
            {day.groups.map((g, i) => (
              <HistoryStack
                key={`${day.key}:${i}`}
                group={g}
                stackKey={`${day.key}:${i}`}
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
  // flex flex-col gap-5
  days: { gap: SECTION_GAP },
  // flex flex-col gap-1.5 — the header carries the gap to the first row.
  day: {},
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4, // px-1
    marginBottom: ROW_GAP,
  },
  // font-display text-xs font-bold uppercase tracking-wide text-white/55
  label: {
    ...display,
    ...text.xs,
    letterSpacing: trackingWide(12),
    color: white(0.55),
  },
  // font-numeric text-sm font-medium tabular-nums
  total: { ...numeric, ...text.sm, fontWeight: weight.medium },
  // flex flex-col gap-1.5
  list: { gap: ROW_GAP },
});
