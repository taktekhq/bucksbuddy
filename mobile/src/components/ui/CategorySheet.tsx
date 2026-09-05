import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
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
import { COLUMN_MAX_WIDTH } from "@/components/ui/Screen";
import {
  categoriesFor,
  categoryColor,
  categoryIcon,
  categoryLabel,
  composeCategory,
  splitCategory,
  subcategoriesFor,
} from "@/lib/categories";
import {
  black,
  colors,
  motion,
  radius,
  shadows,
  space,
  text,
  weight,
  withAlpha,
} from "@/lib/theme";

type Props = {
  open: boolean;
  isIncome: boolean;
  selected: string | null;
  onChangeDirection: (isIncome: boolean) => void;
  // Receives the stored id: "parent" or "parent/sub".
  onSelect: (id: string) => void;
  onClose: () => void;
};

// transition={{ type: "tween", duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
const SLIDE = { duration: motion.sheet, easing: Easing.bezier(...motion.popEase) };
// dragElastic={{ top: 0, bottom: 0.6 }}
const ELASTIC_BOTTOM = 0.6;

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
  const win = useWindowDimensions();
  // Which parent's subcategories are currently shown (null = the grid step).
  const [expanded, setExpanded] = useState<string | null>(null);
  // The Modal stays mounted a beat after `open` flips off so the exit slide
  // can play — AnimatePresence's job on the web.
  const [mounted, setMounted] = useState(open);

  // `y: "100%"` — the sheet's own height. Until it's measured, the window
  // height is a safe "offscreen".
  const sheetHeight = useSharedValue(win.height);
  const y = useSharedValue(win.height);
  const scrim = useSharedValue(0);

  // Always reopen on the grid step.
  useEffect(() => {
    if (open) {
      setExpanded(null);
      setMounted(true);
      y.value = withTiming(0, SLIDE);
      scrim.value = withTiming(1, SLIDE);
    } else {
      scrim.value = withTiming(0, SLIDE);
      y.value = withTiming(sheetHeight.value, SLIDE, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [open, scrim, sheetHeight, y]);

  // drag="y" with constraints {top: 0, bottom: 0}: no travel above the resting
  // point, rubber-band below. Release past 120px (or flicking faster than
  // 600px/s) dismisses; otherwise it snaps home.
  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.value = e.translationY > 0 ? e.translationY * ELASTIC_BOTTOM : 0;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) runOnJS(onClose)();
      else y.value = withTiming(0, SLIDE);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

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
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Gestures inside a Modal need their own root on Android. */}
      <GestureHandlerRootView style={styles.root}>
        {/* fixed inset-0 bg-black/30 */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        {/* fixed inset-x-0 bottom-0 mx-auto max-w-md */}
        <View pointerEvents="box-none" style={styles.dock}>
          <GestureDetector gesture={drag}>
            <Animated.View
              onLayout={(e) => {
                sheetHeight.value = e.nativeEvent.layout.height;
              }}
              style={[styles.sheet, { paddingBottom: space(6) + insets.bottom }, sheetStyle]}
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
                  <View style={styles.toggle}>
                    <InOutToggle isIncome={isIncome} onChange={onChangeDirection} />
                  </View>
                </>
              )}
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// grid-cols-2 gap-2.5
const CHIP_COLS = 2;
const CHIP_GAP = space(2.5);

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

  // Two columns, measured — `(width - gap) / 2`, never a guessed percentage.
  const [width, setWidth] = useState(0);
  const chipWidth = width > 0 ? (width - CHIP_GAP * (CHIP_COLS - 1)) / CHIP_COLS : 0;

  const justParent = selBase === baseId && !selSub;

  return (
    <View>
      <View style={styles.subHeader}>
        <Press
          onPress={onBack}
          accessibilityLabel="Back to categories"
          style={styles.subBack}
        >
          <ChevronLeft size={20} strokeWidth={2.5} color={colors.labelSecondary} />
        </Press>
        <View style={[styles.subBadge, { backgroundColor: color }]}>
          <Icon size={16} strokeWidth={2} color={colors.white} />
        </View>
        <Text style={styles.subTitle}>{label}</Text>
      </View>

      <View style={styles.chips} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* "Just the parent" — no subcategory. */}
        <Press
          onPress={() => onSelect(composeCategory(baseId, null))}
          style={[
            styles.chip,
            { width: chipWidth, backgroundColor: justParent ? color : withAlpha(color, 0.1) },
          ]}
        >
          <Text style={[styles.chipLabel, { color: justParent ? colors.white : color }]}>
            Just {label}
          </Text>
        </Press>
        {subs.map((s) => {
          const active = selBase === baseId && selSub === s.id;
          return (
            <Press
              key={s.id}
              onPress={() => onSelect(composeCategory(baseId, s.id))}
              style={[
                styles.chip,
                { width: chipWidth, backgroundColor: active ? color : withAlpha(color, 0.1) },
              ]}
            >
              <Text style={[styles.chipLabel, { color: active ? colors.white : color }]}>
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
  root: { flex: 1 },
  scrim: { backgroundColor: black(0.3) },
  dock: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: COLUMN_MAX_WIDTH,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    paddingTop: space(2),
    boxShadow: shadows.card,
  },
  grabber: {
    alignSelf: "center",
    marginBottom: space(4),
    height: 6, // h-1.5
    width: 40, // w-10
    borderRadius: radius.pill,
    backgroundColor: colors.grouped,
  },
  toggle: { marginTop: space(4) },
  subHeader: {
    marginBottom: space(3),
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
  },
  subBack: { margin: -space(2), padding: space(2) },
  subBadge: {
    width: 32, // h-8 w-8
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  subTitle: { ...text.base, fontWeight: weight.bold, color: colors.label },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: CHIP_GAP },
  chip: {
    borderRadius: radius.card,
    paddingHorizontal: space(3),
    paddingVertical: space(3.5),
    alignItems: "center",
  },
  chipLabel: { ...text.sm, fontWeight: weight.medium, textAlign: "center" },
});
