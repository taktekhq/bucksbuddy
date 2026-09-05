import type { ReactNode, Ref } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colors, type Gradient } from "@/lib/theme";

// The page shell — what `<main class="mx-auto flex min-h-full max-w-md …">` is
// on the web, plus the two things a browser handles for us:
//
//   • Safe areas. The web writes `pt-[calc(1rem+var(--safe-top))]`; there is no
//     `env()` here, so the insets come from react-native-safe-area-context and
//     are added to the padding.
//   • The gradient floor. The web paints the gradient on the scrolling <main>
//     and a `fixed inset-0` floor behind it in the gradient's terminal color,
//     so a rubber-band bounce never flashes the light canvas. Same here.
//
// `ScreenFrame` is the backdrop on its own, for pages that bring their own
// virtualized list instead of a ScrollView (History).
export { type Gradient };

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
  /** Home's savings tint is viewport-fixed; the dark rooms scroll with content. */
  gradientFixed?: boolean;
  floor?: string;
  statusBar?: "light" | "dark";
}) {
  const floorColor = floor ?? gradient?.floor ?? colors.canvas;
  return (
    <View style={{ flex: 1, backgroundColor: floorColor }}>
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
  statusBar?: "light" | "dark";
  /**
   * The web's `<main>` classes, verbatim — gaps, padding, text color, `justify-center`.
   * `mx-auto max-w-md` and the safe-area padding are already applied.
   */
  className?: string;
  scrollRef?: Ref<ScrollView>;
};

export function Screen({
  children,
  gradient,
  gradientFixed = false,
  floor,
  statusBar = "dark",
  className = "",
  scrollRef,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenFrame gradient={gradient} gradientFixed={gradientFixed} floor={floor} statusBar={statusBar}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="grow"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // iOS scrolls the focused input into view natively, like the browser.
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {gradient && !gradientFixed && <GradientLayer gradient={gradient} />}
        <View
          className={`mx-auto w-full max-w-md grow ${className}`}
          // pt-[calc(…+var(--safe-top))] / pb-[calc(…+var(--safe-bottom))]:
          // the class supplies the base padding, the inset is added on top.
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
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
