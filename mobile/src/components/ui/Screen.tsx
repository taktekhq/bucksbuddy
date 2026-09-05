import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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

// The `<main>` shell every page shares: a single centered column (max-w-md),
// safe-area padding top and bottom, natural scrolling. Dark rooms (Safe,
// History, Stats) paint a gradient on the content and a solid "floor" behind
// it in the gradient's terminal color, so an overscroll bounce never flashes
// the light canvas through — the same trick as the web.
export type Gradient = {
  colors: readonly [string, string, ...string[]];
  // Pixel stops, like the web's "0px, 220px, 460px". Converted to fractions of
  // the gradient's height, which is the stop span itself.
  stops: readonly number[];
  floor: string;
};

type Props = {
  children: ReactNode;
  gradient?: Gradient;
  floor?: string;
  gap?: number;
  paddingX?: number;
  // Top/bottom padding in rem-ish web terms (1rem = 16), before safe areas.
  paddingTop?: number;
  paddingBottom?: number;
  // "light" = white status bar text, for the dark rooms.
  statusBar?: "light" | "dark";
  contentStyle?: StyleProp<ViewStyle>;
  // Center the column vertically (Landing's email flow, Reset).
  center?: boolean;
  scrollRef?: React.Ref<ScrollView>;
};

export function Screen({
  children,
  gradient,
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
  const floorColor = floor ?? gradient?.floor ?? colors.canvas;

  return (
    <View style={[styles.root, { backgroundColor: floorColor }]}>
      <StatusBar style={statusBar} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.root}
          contentContainerStyle={[
            styles.grow,
            center && styles.center,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces
        >
          {gradient && (
            <LinearGradient
              pointerEvents="none"
              colors={gradient.colors}
              locations={toLocations(gradient.stops)}
              style={[
                StyleSheet.absoluteFill,
                { height: gradient.stops[gradient.stops.length - 1] },
              ]}
            />
          )}
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
      </KeyboardAvoidingView>
    </View>
  );
}

function toLocations(stops: readonly number[]): [number, number, ...number[]] {
  const last = stops[stops.length - 1] || 1;
  return stops.map((s) => s / last) as [number, number, ...number[]];
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grow: { flexGrow: 1 },
  center: { justifyContent: "center" },
  column: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 448, // max-w-md
    alignSelf: "center",
  },
});
