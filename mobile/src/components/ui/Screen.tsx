import type { ReactNode, Ref } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colors, space } from "@/lib/theme";

// The page shell, in two layers:
//
//   ScreenFrame — the full-screen backdrop: floor color, status-bar style, and
//                 (for the dark rooms) the gradient painted over the first
//                 few hundred points. Lists that virtualize (History) use the
//                 frame directly and bring their own SectionList/FlatList.
//   Screen      — ScreenFrame + a ScrollView + the centered `max-w-md` column
//                 with safe-area padding. What `<main>` is on the web.
//
// The web's gradient trick: the gradient sits on the scrolling content and a
// fixed "floor" in the gradient's terminal color sits behind it, so an
// overscroll bounce never flashes the light canvas. Home's savings tint is
// the exception — it's viewport-fixed there (`gradientFixed`).
export type Gradient = {
  colors: readonly [string, string, ...string[]];
  // Pixel stops, like the web's "0px, 220px, 460px".
  stops: readonly number[];
  floor: string;
};

export function GradientLayer({ gradient }: { gradient: Gradient }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={gradient.colors}
      locations={toLocations(gradient.stops)}
      style={[StyleSheet.absoluteFill, { height: gradient.stops[gradient.stops.length - 1] }]}
    />
  );
}

export function ScreenFrame({
  children,
  gradient,
  gradientFixed = false,
  floor,
  statusBar = "dark",
}: {
  children: ReactNode;
  gradient?: Gradient;
  gradientFixed?: boolean;
  floor?: string;
  statusBar?: "light" | "dark";
}) {
  const floorColor = floor ?? gradient?.floor ?? colors.canvas;
  return (
    <View style={[styles.root, { backgroundColor: floorColor }]}>
      <StatusBar style={statusBar} />
      {gradient && gradientFixed && <GradientLayer gradient={gradient} />}
      {children}
    </View>
  );
}

type Props = {
  children: ReactNode;
  gradient?: Gradient;
  gradientFixed?: boolean;
  floor?: string;
  /** `gap-*` between the column's children (web default gap-5 = 20). */
  gap?: number;
  /** `px-*` (web default px-4 = 16). */
  paddingX?: number;
  /** Top/bottom padding before safe areas (web: 1rem top, 2rem bottom). */
  paddingTop?: number;
  paddingBottom?: number;
  /** "light" = white status bar text, for the dark rooms. */
  statusBar?: "light" | "dark";
  contentStyle?: StyleProp<ViewStyle>;
  /** Center the column vertically (Landing's email flow, Reset). */
  center?: boolean;
  scrollRef?: Ref<ScrollView>;
};

export function Screen({
  children,
  gradient,
  gradientFixed = false,
  floor,
  gap = space(5),
  paddingX = space(4),
  paddingTop = 16,
  paddingBottom = 32,
  statusBar = "dark",
  contentStyle,
  center = false,
  scrollRef,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenFrame gradient={gradient} gradientFixed={gradientFixed} floor={floor} statusBar={statusBar}>
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={[styles.grow, center && styles.center]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // iOS: scroll the focused input into view natively, like the browser
        // does — no KeyboardAvoidingView jump.
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {gradient && !gradientFixed && <GradientLayer gradient={gradient} />}
        <View
          style={[
            styles.column,
            {
              gap,
              paddingHorizontal: paddingX,
              paddingTop: paddingTop + insets.top,
              paddingBottom: paddingBottom + insets.bottom,
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      </ScrollView>
    </ScreenFrame>
  );
}

export function toLocations(stops: readonly number[]): [number, number, ...number[]] {
  const last = stops[stops.length - 1] || 1;
  return stops.map((s) => s / last) as [number, number, ...number[]];
}

// The `max-w-md` column, exported for list screens that lay out their own
// header/footer/rows and want the same gutters.
export const COLUMN_MAX_WIDTH = 448;

const styles = StyleSheet.create({
  root: { flex: 1 },
  grow: { flexGrow: 1 },
  center: { justifyContent: "center" },
  column: {
    flexGrow: 1,
    width: "100%",
    maxWidth: COLUMN_MAX_WIDTH,
    alignSelf: "center",
  },
});
