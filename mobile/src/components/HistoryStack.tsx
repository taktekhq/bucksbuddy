import { memo, useCallback, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { Press } from "@/components/ui/Press";
import { SwipeRow } from "@/components/SwipeRow";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { amountColor, formatSignedUsdCents } from "@/lib/money";
import { colors, motion, numeric, radius, shadows, text, weight, white, withAlpha } from "@/lib/theme";
import type { HistoryGroup } from "@/lib/history";
import type { Transaction } from "@/types/db";

// The web's `height: 0 → auto` tween, 0.22s cubic-bezier(0.2, 0.8, 0.2, 1):
// the always-mounted wrapper clips (`overflow-hidden`) and its frame grows
// through a layout transition while the revealed rows fade in.
const EXPAND = LinearTransition.duration(motion.pop);
const REVEAL = FadeIn.duration(motion.pop);

// One category's worth of history on the dark full-history page. A single entry
// is just a plain row. Two or more render as a stacked card (with charcoal
// layers peeking out below) that expands open on tap to reveal every entry —
// and stays open (no collapse, by design). The layers are reserved their own
// room below the front card (the `pb`), so the stack reads clearly without
// crowding the next item in the list.
//
// `open`/`onOpen`/`stackKey` are optional: the virtualized History list keeps
// the open set itself so a stack stays open even after its cell is recycled
// off-screen. Without them the stack owns its state, as on the web.
export const HistoryStack = memo(function HistoryStack({
  group,
  onEdit,
  onDelete,
  open,
  onOpen,
  stackKey,
}: {
  group: HistoryGroup;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  open?: boolean;
  onOpen?: (key: string) => void;
  stackKey?: string;
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const isOpen = open ?? openLocal;
  // A recycled cell that remounts already open shouldn't replay the reveal.
  const mountedOpen = useRef(isOpen);
  const key = stackKey ?? group.key;
  const handleOpen = useCallback(() => {
    setOpenLocal(true);
    onOpen?.(key);
  }, [key, onOpen]);

  if (group.count === 1) {
    return <SwipeRow tx={group.rows[0]} onEdit={onEdit} onDelete={onDelete} dark />;
  }

  const Icon = categoryIcon(group.category);
  const color = categoryColor(group.category);
  const label = categoryLabel(group.category);
  const total = group.masked
    ? `${group.isIncome ? "+" : "-"}••••`
    : formatSignedUsdCents(group.totalCents);

  if (isOpen) {
    return (
      <Animated.View layout={EXPAND} style={styles.list}>
        {group.rows.map((tx) => (
          <Animated.View key={tx.id} entering={mountedOpen.current ? undefined : REVEAL}>
            <SwipeRow tx={tx} onEdit={onEdit} onDelete={onDelete} dark />
          </Animated.View>
        ))}
      </Animated.View>
    );
  }

  return (
    <Animated.View layout={EXPAND} style={styles.clip}>
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`${label}, ${group.count} entries`}
        onPress={handleOpen}
        style={styles.stack}
      >
        {/* Two charcoal layers peeking out below the front card to read as a
            stack. Each is a touch darker and narrower than the one in front; the
            button's pb-3 reserves the 12px they drop into so they never crowd the
            next list item. */}
        <View accessibilityElementsHidden style={[styles.layer, styles.layerBack]} />
        <View accessibilityElementsHidden style={[styles.layer, styles.layerMid]} />
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
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // flex flex-col gap-1.5 overflow-hidden
  list: { gap: 6, overflow: "hidden" },
  clip: { overflow: "hidden" },
  // press relative block w-full pb-3 text-left
  stack: { position: "relative", width: "100%", paddingBottom: 12 },
  // absolute inset-x-0 bottom-3 top-0 rounded-card ring-1 ring-inset ring-white/5
  layer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 12,
    borderRadius: radius.card,
    boxShadow: shadows.ringWhite5,
  },
  // translate-y-3 scale-x-[0.90] bg-[#2E2E30]
  layerBack: {
    backgroundColor: "#2E2E30",
    transform: [{ translateY: 12 }, { scaleX: 0.9 }],
  },
  // translate-y-1.5 scale-x-[0.95] bg-[#343436]
  layerMid: {
    backgroundColor: "#343436",
    transform: [{ translateY: 6 }, { scaleX: 0.95 }],
  },
  // relative flex items-center gap-3 rounded-card bg-[#3A3A3C] px-4 py-3.5 ring-1 ring-inset ring-white/5
  front: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: "#3A3A3C",
    paddingHorizontal: 16,
    paddingVertical: 14,
    boxShadow: shadows.ringWhite5,
  },
  // h-10 w-10 shrink-0 rounded-pill
  badge: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  label: { ...text.base, fontWeight: weight.medium, color: colors.white },
  count: { ...text.xs, color: white(0.55) },
  total: { ...numeric, ...text.base, fontWeight: weight.medium },
});
