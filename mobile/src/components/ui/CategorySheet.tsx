import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { InOutToggle } from "@/components/ui/InOutToggle";
import { CategoryGrid } from "@/components/ui/CategoryGrid";
import {
  categoriesFor,
  categoryColor,
  categoryIcon,
  categoryLabel,
  composeCategory,
  splitCategory,
  subcategoriesFor,
} from "@/lib/categories";
import { colors, radius, shadowCard, withAlpha } from "@/lib/theme";

type Props = {
  open: boolean;
  isIncome: boolean;
  selected: string | null;
  onChangeDirection: (isIncome: boolean) => void;
  // Receives the stored id: "parent" or "parent/sub".
  onSelect: (id: string) => void;
  onClose: () => void;
};

const SLIDE = { duration: 250, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
const OFFSCREEN = 900;

// Bottom sheet with two steps. Step 1: the colorful category grid + the In/Out
// toggle pinned at the bottom. Step 2 (only for categories that have them): the
// subcategory picker, reached by tapping a category with a dot. Drag down to
// dismiss.
export function CategorySheet({
  open,
  isIncome,
  selected,
  onChangeDirection,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  // Which parent's subcategories are currently shown (null = the grid step).
  const [expanded, setExpanded] = useState<string | null>(null);
  // The Modal stays mounted a beat after `open` flips off so the exit
  // animation can play (AnimatePresence's job on the web).
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(OFFSCREEN);
  const startY = useSharedValue(0);
  const dim = useSharedValue(0);

  // Always reopen on the grid step.
  useEffect(() => {
    if (open) {
      setExpanded(null);
      setMounted(true);
      y.value = withTiming(0, SLIDE);
      dim.value = withTiming(1, SLIDE);
    } else if (mounted) {
      dim.value = withTiming(0, SLIDE);
      y.value = withTiming(OFFSCREEN, SLIDE, (done) => {
        if (done) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .onStart(() => {
      startY.value = y.value;
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      // Can't drag above the top; past the bottom it gives with dragElastic 0.6.
      y.value = next < 0 ? 0 : next * 0.6;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) runOnJS(onClose)();
      else y.value = withTiming(0, SLIDE);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  function pickCategory(baseId: string) {
    if (subcategoriesFor(baseId).length > 0) {
      setExpanded(baseId);
    } else {
      onSelect(baseId);
    }
  }

  const selectedBase = selected ? splitCategory(selected).base : null;

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, dimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <GestureDetector gesture={drag}>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: 24 + insets.bottom },
            sheetStyle,
          ]}
        >
          {/* Grabber. */}
          <View style={styles.grabber} />

          {expanded ? (
            <SubcategoryStep
              baseId={expanded}
              selected={selected}
              onBack={() => setExpanded(null)}
              onSelect={onSelect}
            />
          ) : (
            <>
              {/* Categories on top (variable height). */}
              <CategoryGrid
                categories={categoriesFor(isIncome)}
                selected={selectedBase}
                onSelect={pickCategory}
              />

              {/* In/Out pinned at the bottom. */}
              <View style={{ marginTop: 16 }}>
                <InOutToggle isIncome={isIncome} onChange={onChangeDirection} />
              </View>
            </>
          )}
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

// Step 2: a back header that doubles as "use the parent only", then the
// subcategory chips tinted with the parent's color.
function SubcategoryStep({
  baseId,
  selected,
  onBack,
  onSelect,
}: {
  baseId: string;
  selected: string | null;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const color = categoryColor(baseId);
  const Icon = categoryIcon(baseId);
  const label = categoryLabel(baseId);
  const subs = subcategoriesFor(baseId);
  const { base: selBase, sub: selSub } = selected
    ? splitCategory(selected)
    : { base: null, sub: null };

  const [width, setWidth] = useState(0);
  const chipW = width > 0 ? (width - 10) / 2 : undefined;

  return (
    <View>
      <View style={styles.subHeader}>
        <Press onPress={onBack} accessibilityLabel="Back to categories" style={styles.subBack} hitSlop={8}>
          <ChevronLeft size={20} strokeWidth={2.5} color={colors.labelSecondary} />
        </Press>
        <View style={[styles.subBadge, { backgroundColor: color }]}>
          <Icon size={16} strokeWidth={2} color="#FFF" />
        </View>
        <Text style={styles.subTitle}>{label}</Text>
      </View>

      <View style={styles.chips} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* "Just the parent" — no subcategory. */}
        {(() => {
          const active = selBase === baseId && !selSub;
          return (
            <Press
              onPress={() => onSelect(composeCategory(baseId, null))}
              style={[styles.chip, { width: chipW, backgroundColor: active ? color : withAlpha(color, 0.1) }]}
            >
              <Text style={[styles.chipLabel, { color: active ? "#FFFFFF" : color }]}>
                Just {label}
              </Text>
            </Press>
          );
        })()}
        {subs.map((s) => {
          const active = selBase === baseId && selSub === s.id;
          return (
            <Press
              key={s.id}
              onPress={() => onSelect(composeCategory(baseId, s.id))}
              style={[styles.chip, { width: chipW, backgroundColor: active ? color : withAlpha(color, 0.1) }]}
            >
              <Text style={[styles.chipLabel, { color: active ? "#FFFFFF" : color }]}>
                {s.label}
              </Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    maxWidth: 448,
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 8,
    ...shadowCard,
  },
  grabber: {
    alignSelf: "center",
    marginBottom: 16,
    height: 6,
    width: 40,
    borderRadius: 3,
    backgroundColor: colors.grouped,
  },
  subHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  subBack: { padding: 8, margin: -8 },
  subBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  subTitle: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.label },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  chipLabel: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
});
