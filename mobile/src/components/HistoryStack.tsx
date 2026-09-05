import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn } from "react-native-reanimated";
import { Press } from "@/components/ui/Press";
import { SwipeRow } from "@/components/SwipeRow";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColor, formatSignedUsdCents } from "@/lib/money";
import { numeric, radius, white, withAlpha } from "@/lib/theme";
import type { HistoryGroup } from "@/lib/history";
import type { Transaction } from "@/types/db";

// One category's worth of history on the dark full-history page. A single entry
// is just a plain row. Two or more render as a stacked card (with charcoal
// layers peeking out below) that expands open on tap to reveal every entry —
// and stays open (no collapse, by design). The layers are reserved their own
// room below the front card (the paddingBottom), so the stack reads clearly
// without crowding the next item in the list.
export function HistoryStack({
  group,
  onEdit,
  onDelete,
}: {
  group: HistoryGroup;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}) {
  const [open, setOpen] = useState(false);

  if (group.count === 1) {
    return <SwipeRow tx={group.rows[0]} onEdit={onEdit} onDelete={onDelete} dark />;
  }

  const Icon = categoryIcon(group.category);
  const color = categoryColor(group.category);
  const label = categoryLabel(group.category);
  const total = group.masked
    ? `${group.isIncome ? "+" : "-"}••••`
    : formatSignedUsdCents(group.totalCents);

  if (open) {
    return (
      <Animated.View
        style={styles.list}
        entering={FadeIn.duration(220).easing(Easing.bezier(0.2, 0.8, 0.2, 1))}
      >
        {group.rows.map((tx) => (
          <SwipeRow key={tx.id} tx={tx} onEdit={onEdit} onDelete={onDelete} dark />
        ))}
      </Animated.View>
    );
  }

  return (
    <Press
      accessibilityLabel={`${label}, ${group.count} entries`}
      onPress={() => setOpen(true)}
      style={styles.stack}
    >
      {/* Two charcoal layers peeking out below the front card to read as a
          stack. Each is a touch darker and narrower than the one in front; the
          paddingBottom reserves the 12px they drop into so they never crowd
          the next list item. */}
      <View style={[styles.layer, styles.layerBack]} />
      <View style={[styles.layer, styles.layerMid]} />
      {/* Front card. */}
      <View style={styles.front}>
        <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.2) }]}>
          <Icon size={20} strokeWidth={2} color={color} />
        </View>
        <View style={styles.body}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.count}>{group.count} entries</Text>
        </View>
        <Text style={[styles.total, { color: amountColor(group.isIncome) }]}>{total}</Text>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, overflow: "hidden" },
  stack: { position: "relative", paddingBottom: 12 },
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 12,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: white(0.05),
  },
  layerBack: {
    backgroundColor: "#2E2E30",
    transform: [{ translateY: 12 }, { scaleX: 0.9 }],
  },
  layerMid: {
    backgroundColor: "#343436",
    transform: [{ translateY: 6 }, { scaleX: 0.95 }],
  },
  front: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: "#3A3A3C",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: white(0.05),
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: "#FFF" },
  count: { fontSize: 12, lineHeight: 16, color: white(0.55) },
  total: { ...numeric, fontSize: 16, lineHeight: 24, fontWeight: "500" },
});
