import type { ReactNode, Ref } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colors, type Gradient } from "@/lib/theme";

// The page shell — what `<main class="mx-auto flex min-h-full max-w-md …">` is
// on the web, plus the three things a browser handles for us:
//
//   • Safe areas. The web writes `pt-[calc(1rem+var(--safe-top))]`; there is no
//     `env()` here, so the insets come from react-native-safe-area-context and
//     are added to the padding.
//   • Filling a short page. The web's `min-h-full` is `grow` here, and the
//     class itself has to go — see `withoutMinHFull` at the bottom.
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
  statusBar = "dark",
}: {
  children: ReactNode;
  gradient?: Gradient;
  /** Home's savings tint is viewport-fixed; the dark rooms scroll with content. */
  gradientFixed?: boolean;
  statusBar?: "light" | "dark";
}) {
  const floorColor = gradient?.floor ?? colors.canvas;
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
  statusBar = "dark",
  className = "",
  scrollRef,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenFrame gradient={gradient} gradientFixed={gradientFixed} statusBar={statusBar}>
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
        {/* The web writes `pt-[calc(1rem+var(--safe-top))]`, i.e. base padding
            PLUS the inset. An inline style would beat the class rather than add
            to it, so the insets go on a wrapper and the screen's own `pt-*` /
            `pb-*` classes stack on top of them. */}
        <View className="grow" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View className={`mx-auto w-full max-w-md grow ${withoutMinHFull(className)}`}>
            {children}
          </View>
        </View>
      </ScrollView>
    </ScreenFrame>
  );
}

// Internal: drop `min-h-full` from a screen's class list.
//
// The web's `<main>` carries it so a short page still fills the viewport. Here
// that job belongs to `grow` above: the ScrollView's content container already
// stretches to the viewport and `flexGrow` carries it down. Leaving
// `min-h-full` in resolves `minHeight: 100%` against a parent whose own height
// is the scrolling content — a circular constraint. iOS answers it by growing
// the content every layout pass, so the page scrolls forever into blank space
// and the real content ends up far above the viewport.
//
// Screens still paste the web's class list verbatim (PORTING.md); this removes
// the one token that cannot survive the trip.
function withoutMinHFull(className: string): string {
  return className
    .trim()
    .split(/\s+/)
    .filter((name) => name !== "min-h-full")
    .join(" ");
}

// Internal: pixel stops → the 0..1 fractions LinearGradient wants.
function toLocations(stops: readonly number[]): [number, number, ...number[]] {
  const last = stops[stops.length - 1] || 1;
  return stops.map((s) => s / last) as [number, number, ...number[]];
}
