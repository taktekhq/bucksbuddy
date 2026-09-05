// Screen has no web test — on the web it is a `<main>` plus a fixed floor div.
// The port adds the two things the browser did for free, and those are what
// this covers: the safe-area insets, and where the gradient sits relative to
// the scroller.
import type { ReactElement } from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GradientLayer, Screen, ScreenFrame, toLocations } from "@/components/ui/Screen";
import { colors, OBSERVATORY, RABBIT_HOLE, SAVINGS, VAULT } from "@/lib/theme";

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type Node = { type: string; props: Record<string, unknown>; children: unknown[] | null };

function allNodes(root: unknown): Node[] {
  if (!root || typeof root !== "object") return [];
  const node = root as Node;
  return [node, ...(node.children ?? []).flatMap(allNodes)];
}

const find = (type: string, root: unknown = screen.toJSON()) =>
  allNodes(root).filter((n) => n.type === type);

/** The safe-area provider the app mounts at its root. */
function withSafeArea(ui: ReactElement) {
  return <SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>;
}

const style = (node: Node | undefined) =>
  (node?.props.style ?? {}) as Record<string, unknown>;

describe("toLocations", () => {
  it("normalizes the web's pixel offsets to 0..1", () => {
    expect(toLocations([0, 220, 460])).toEqual([0, 220 / 460, 1]);
    expect(toLocations([0, 260])).toEqual([0, 1]);
  });

  it("falls back to a unit scale when the last stop is 0", () => {
    // Nothing to divide by — dividing would give NaN and blank the gradient.
    expect(toLocations([0, 0])).toEqual([0, 0]);
  });
});

describe("GradientLayer", () => {
  it("paints the gradient's colors at its normalized stops", async () => {
    await render(<GradientLayer gradient={RABBIT_HOLE} />);
    const layer = find("LinearGradient")[0];
    expect(layer.props.colors).toEqual(RABBIT_HOLE.colors);
    expect(layer.props.locations).toEqual(toLocations(RABBIT_HOLE.stops));
  });

  it("is as tall as the gradient's last stop and never eats a touch", async () => {
    await render(<GradientLayer gradient={VAULT} />);
    const layer = find("LinearGradient")[0];
    expect(layer.props.pointerEvents).toBe("none");
    expect(layer.props.style).toContainEqual({ height: 640 });
  });
});

describe("ScreenFrame", () => {
  it("renders its children on the canvas when there is no gradient", async () => {
    await render(
      <ScreenFrame>
        <Text>bare</Text>
      </ScreenFrame>,
    );
    expect(screen.getByText("bare")).toBeOnTheScreen();
    expect(style(find("View")[0]).backgroundColor).toBe(colors.canvas);
    expect(find("LinearGradient")).toHaveLength(0);
  });

  it("floors in the gradient's terminal color, so an overscroll bounce matches", async () => {
    await render(
      <ScreenFrame gradient={OBSERVATORY}>
        <Text>dark</Text>
      </ScreenFrame>,
    );
    expect(style(find("View")[0]).backgroundColor).toBe(OBSERVATORY.floor);
  });

  it("takes an explicit floor over the gradient's", async () => {
    await render(
      <ScreenFrame gradient={OBSERVATORY} floor="#000000">
        <Text>dark</Text>
      </ScreenFrame>,
    );
    expect(style(find("View")[0]).backgroundColor).toBe("#000000");
  });

  it("leaves a scrolling gradient to the Screen's scroller", async () => {
    await render(
      <ScreenFrame gradient={SAVINGS}>
        <Text>home</Text>
      </ScreenFrame>,
    );
    expect(find("LinearGradient")).toHaveLength(0);
  });

  it("paints a viewport-fixed gradient itself, behind the content", async () => {
    await render(
      <ScreenFrame gradient={SAVINGS} gradientFixed>
        <Text>home</Text>
      </ScreenFrame>,
    );
    expect(find("LinearGradient")).toHaveLength(1);
  });
});

describe("Screen", () => {
  it("renders its children inside the scroller", async () => {
    await render(
      withSafeArea(
        <Screen>
          <Text>hello</Text>
        </Screen>,
      ),
    );
    expect(screen.getByText("hello")).toBeOnTheScreen();
    const scroller = find("RCTScrollView")[0];
    expect(find("Text", scroller)).toHaveLength(1);
  });

  it("adds the device's safe-area insets to the padding", async () => {
    await render(
      withSafeArea(
        <Screen>
          <Text>hello</Text>
        </Screen>,
      ),
    );
    // The web writes `pt-[calc(1rem+var(--safe-top))]`; there is no env() here,
    // so the insets go on a wrapper and the screen's own padding stacks on top.
    const padded = allNodes(screen.toJSON()).find(
      (n) => typeof style(n).paddingTop === "number",
    );
    expect(style(padded)).toEqual({ paddingTop: 47, paddingBottom: 34 });
  });

  it("scrolls the gradient with the content by default", async () => {
    await render(
      withSafeArea(
        <Screen gradient={RABBIT_HOLE}>
          <Text>history</Text>
        </Screen>,
      ),
    );
    const scroller = find("RCTScrollView")[0];
    // Inside the scroller, so it travels up as the page scrolls.
    expect(find("LinearGradient", scroller)).toHaveLength(1);
  });

  it("pins the gradient to the viewport when asked", async () => {
    await render(
      withSafeArea(
        <Screen gradient={SAVINGS} gradientFixed>
          <Text>home</Text>
        </Screen>,
      ),
    );
    const scroller = find("RCTScrollView")[0];
    expect(find("LinearGradient")).toHaveLength(1);
    // Behind the scroller rather than inside it — Home's savings tint stays put.
    expect(find("LinearGradient", scroller)).toHaveLength(0);
  });

  it("renders no gradient when none is given", async () => {
    await render(
      withSafeArea(
        <Screen className="gap-4 px-4">
          <Text>plain</Text>
        </Screen>,
      ),
    );
    expect(find("LinearGradient")).toHaveLength(0);
    expect(style(find("View")[0]).backgroundColor).toBe(colors.canvas);
  });

  it("takes a light status bar for the dark rooms", async () => {
    await render(
      withSafeArea(
        <Screen gradient={OBSERVATORY} statusBar="light" floor="#141428">
          <Text>stats</Text>
        </Screen>,
      ),
    );
    expect(screen.getByText("stats")).toBeOnTheScreen();
    expect(style(find("View")[0]).backgroundColor).toBe("#141428");
  });

  it("keeps taps working while the keyboard is up", async () => {
    await render(
      withSafeArea(
        <Screen>
          <Text>form</Text>
        </Screen>,
      ),
    );
    const scroller = find("RCTScrollView")[0];
    expect(scroller.props.keyboardShouldPersistTaps).toBe("handled");
    expect(scroller.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });
});
