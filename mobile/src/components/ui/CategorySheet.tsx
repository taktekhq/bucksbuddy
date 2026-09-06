import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
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
import {
  categoriesFor,
  categoryColor,
  categoryIcon,
  categoryLabel,
  composeCategory,
  splitCategory,
  subcategoriesFor,
} from "@/lib/categories";
import { colors, motion } from "@/lib/theme";

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
//
// framer-motion's AnimatePresence is a Modal that stays mounted a beat after
// `open` flips off so the exit slide can play; the scrim and the sheet are
// Animated.Views carrying nothing but opacity/translateY, with every class name
// on a plain View inside them (Reanimated's views aren't className-aware).
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
  const [mounted, setMounted] = useState(open);

  // `y: "100%"` is the sheet's own height; until it's measured the window
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

  // drag="y" with dragConstraints {top: 0, bottom: 0}: no travel above the
  // resting point, rubber-band below. Release past 120px — or flicking faster
  // than 600px/s — dismisses; otherwise it snaps home.
  const drag = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.value = e.translationY > 0 ? e.translationY * ELASTIC_BOTTOM : 0;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 600) runOnJS(onClose)();
      else y.value = withTiming(0, SLIDE);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
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
      {/* Gestures inside a Modal need their own root on Android. Not a class:
          GestureHandlerRootView isn't className-aware. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]} pointerEvents="box-none">
          <Pressable
            className="absolute inset-0 z-40 bg-black/30"
            onPress={onClose}
            accessibilityLabel="Close"
          />
        </Animated.View>
        <View className="absolute inset-x-0 bottom-0 z-50" pointerEvents="box-none">
          <GestureDetector gesture={drag}>
            <Animated.View
              style={sheetStyle}
              onLayout={(e) => {
                sheetHeight.value = e.nativeEvent.layout.height;
              }}
            >
              <View className="mx-auto w-full max-w-md rounded-t-[28px] bg-surface px-4 pb-6 pt-2 shadow-card">
                {/* pb-[calc(1.5rem+var(--safe-bottom))]: `pb-6` is the class
                    above, the inset is added here (PORTING §2d). */}
                <View style={{ paddingBottom: insets.bottom }}>
                  {/* Grabber. */}
                  <View className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-grouped" />

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
                      <View className="mt-4">
                        <InOutToggle isIncome={isIncome} onChange={onChangeDirection} />
                      </View>
                    </>
                  )}
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// `grid grid-cols-2 gap-2.5` — no CSS grid here, so the chips wrap and take a
// width measured off the container (PORTING §4).
const CHIP_COLS = 2;
const CHIP_GAP = 10; // gap-2.5

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
  const chipWidth = width > 0 ? (width - CHIP_GAP * (CHIP_COLS - 1)) / CHIP_COLS : 0;

  return (
    <View>
      <View className="mb-3 flex flex-row items-center gap-2">
        <Press onPress={onBack} accessibilityLabel="Back to categories" className="-m-2 p-2 text-label-secondary">
          <ChevronLeft size={20} strokeWidth={2.5} color={colors.labelSecondary} />
        </Press>
        <View
          className="flex h-8 w-8 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          <Icon size={16} strokeWidth={2} color={colors.white} />
        </View>
        <Text className="font-bold text-label">{label}</Text>
      </View>

      <View
        className="flex-row flex-wrap gap-2.5"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {/* "Just the parent" — no subcategory. */}
        <Press
          onPress={() => onSelect(composeCategory(baseId, null))}
          className="rounded-card px-3 py-3.5 text-sm font-medium"
          style={{
            width: chipWidth,
            backgroundColor: selBase === baseId && !selSub ? color : `${color}1A`,
          }}
        >
          <Text
            className="text-center text-sm font-medium"
            style={{ color: selBase === baseId && !selSub ? "#FFFFFF" : color }}
          >
            Just {label}
          </Text>
        </Press>
        {subs.map((s) => {
          const active = selBase === baseId && selSub === s.id;
          return (
            <Press
              key={s.id}
              onPress={() => onSelect(composeCategory(baseId, s.id))}
              className="rounded-card px-3 py-3.5 text-sm font-medium"
              style={{
                width: chipWidth,
                backgroundColor: active ? color : `${color}1A`,
              }}
            >
              <Text
                className="text-center text-sm font-medium"
                style={{ color: active ? "#FFFFFF" : color }}
              >
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
  // The Modal's own root — GestureHandlerRootView takes no className.
  root: { flex: 1 },
});
