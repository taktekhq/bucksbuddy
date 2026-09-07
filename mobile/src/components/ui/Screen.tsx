import { useCallback, useRef, useState, type ReactNode, type Ref } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colors, type Gradient } from "@/lib/theme";
import { currentRoute } from "@/lib/router";
import posthog from "@/lib/posthog";

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

// A scroller reports itself when it goes somewhere it should not be able to.
//
// Two builds have now gone out with pages that scroll far past their content
// into blank space, and neither the code nor the test suite could say why:
// jest runs no layout, so nothing on this side can see it. This closes that
// gap. It distinguishes the only two shapes the fault can take —
//
//   * content taller than any real page  -> something renders an absurd box
//   * offset beyond the end of content   -> contentInset, i.e. the keyboard path
//
// — and sends the numbers with the route, once per mount, so the next report
// arrives with an answer attached instead of a description.
const OVERSIZE = 3; // a page worth more than three viewports is already odd here
const SLACK = 200; // a rubber-band bounce legitimately overshoots by about this

export type ScrollReport = {
  route: string;
  viewport: number;
  content: number;
  offset: number;
  beyond_end: number;
  oversized: boolean;
  inset_top: number;
  inset_bottom: number;
};

export function useScrollBoundsReport(insets: { top: number; bottom: number }) {
  const [report, setReport] = useState<ScrollReport | null>(null);
  const reported = useRef(false);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (reported.current) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const viewport = layoutMeasurement.height;
      const content = contentSize.height;
      if (viewport <= 0) return;
      const beyondEnd = contentOffset.y - Math.max(content - viewport, 0);
      const oversized = content > viewport * OVERSIZE;
      if (beyondEnd < SLACK && !oversized) return;
      reported.current = true;
      const next: ScrollReport = {
        route: currentRoute(),
        viewport: Math.round(viewport),
        content: Math.round(content),
        offset: Math.round(contentOffset.y),
        beyond_end: Math.round(beyondEnd),
        oversized,
        inset_top: Math.round(insets.top),
        inset_bottom: Math.round(insets.bottom),
      };
      posthog.capture("scroll_out_of_bounds", { ...next });
      setReport(next);
    },
    [insets.top, insets.bottom],
  );
  return { onScroll, report };
}

/**
 * The numbers, on the screen.
 *
 * Temporary and deliberate. Three builds have gone out with pages that scroll
 * past their content, the fault has never been reproducible here, and the
 * analytics key this project has cannot read its own events back. So the page
 * says what it measured, and only when it has already gone wrong — on a healthy
 * build this renders nothing, ever. Delete it once the cause is known.
 */
export function ScrollDiagnostic({ report }: { report: ScrollReport | null }) {
  if (!report) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "#FF3B30",
        paddingHorizontal: 8,
        paddingTop: 44,
        paddingBottom: 6,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
        {report.route} · view {report.viewport} · content {report.content} · at{" "}
        {report.offset} · past {report.beyond_end} · safe {report.inset_top}/
        {report.inset_bottom}
      </Text>
    </View>
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
  const insets = safeAreaPadding(useSafeAreaInsets());
  const { onScroll, report } = useScrollBoundsReport(insets);
  return (
    <ScreenFrame gradient={gradient} gradientFixed={gradientFixed} statusBar={statusBar}>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={250}
        className="flex-1"
        // The web writes `pt-[calc(1rem+var(--safe-top))]`, i.e. base padding
        // PLUS the inset. The insets go here, on the content container, so the
        // screen's own `pt-*` / `pb-*` classes stack on top of them rather than
        // fighting them — and so there is one less nested `grow` between the
        // scroller and the page than there used to be.
        contentContainerClassName="grow"
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // iOS scrolls the focused input into view natively, like the browser.
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {gradient && !gradientFixed && <GradientLayer gradient={gradient} />}
        <View className={`mx-auto w-full max-w-md grow ${withoutMinHFull(className)}`}>
          {children}
        </View>
      </ScrollView>
      <ScrollDiagnostic report={report} />
    </ScreenFrame>
  );
}

// A phone's safe area is tens of points, never hundreds. Anything larger is a
// measurement that has gone wrong, and because this padding sits inside the
// scroller a bad one adds exactly that much blank space below the page — which
// is what "I can scroll forever and then the UI disappears" looks like. Cap it
// rather than lay it out, and let the diagnostic show what came in.
const MAX_INSET = 100;

export function safeAreaPadding(insets: { top: number; bottom: number }) {
  return {
    top: Math.min(Math.max(insets.top, 0), MAX_INSET),
    bottom: Math.min(Math.max(insets.bottom, 0), MAX_INSET),
  };
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
