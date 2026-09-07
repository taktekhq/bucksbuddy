// What the page shell's classes actually MEAN, not just which ones got through.
//
// The rest of the suite asserts on className strings, because NativeWind leaves
// them inert under jest. That could not see the bug where three screens carried
// `min-h-full` into a scroll container, so this file compiles the real Tailwind
// config and looks at the numbers instead. See src/test/tailwind.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Screen } from "@/components/ui/Screen";
import { useTailwind } from "@/test/tailwind";

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

const SIZES = ["height", "minHeight", "maxHeight"] as const;

/** Percentage heights are the ones that cannot survive a scroll container. */
function percentageHeights(style: unknown): string[] {
  if (!style || typeof style !== "object") return [];
  const s = style as Record<string, unknown>;
  return SIZES.filter((k) => typeof s[k] === "string" && String(s[k]).endsWith("%")).map(
    (k) => `${k}: ${String(s[k])}`,
  );
}

/** Every class list a screen hands to `Screen`, read from the sources. */
function screenClassLists(): { file: string; classes: string }[] {
  const dir = join(__dirname, "..", "..", "screens");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .flatMap((file) => {
      const source = readFileSync(join(dir, file), "utf8");
      // `<Screen …>` up to the first `>` that ends the opening tag.
      return [...source.matchAll(/<Screen\b[^>]*?>/gs)].flatMap((tag) => {
        const found = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag[0]);
        return found ? [{ file, classes: found[1] ?? found[2] ?? "" }] : [];
      });
    });
}

describe("the page shell, in resolved styles", () => {
  it("puts a plain flexGrow box inside the scroller, and no percentage height", async () => {
    // A percentage height here resolves against a parent whose own height is
    // the scrolling content. `grow` is what fills a short page instead.
    const classes = "flex min-h-full flex-col gap-6 px-4 pb-8 pt-4";
    await useTailwind(`${classes} mx-auto w-full max-w-md grow flex-1`);
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Screen className={classes}>
          <Text>page</Text>
        </Screen>
      </SafeAreaProvider>,
    );

    const scroller = allNodes(screen.toJSON()).find((n) => n.type === "RCTScrollView");
    expect(scroller?.props.contentContainerStyle).toEqual({ flexGrow: 1 });

    const offenders = allNodes(screen.toJSON()).flatMap((n) =>
      percentageHeights(n.props.style).map((v) => `${n.type} ${v}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the width cap and the safe-area padding it is responsible for", async () => {
    await useTailwind("mx-auto w-full max-w-md grow flex-1 px-4");
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Screen className="px-4">
          <Text>page</Text>
        </Screen>
      </SafeAreaProvider>,
    );
    const styles = allNodes(screen.toJSON()).map((n) => n.props.style ?? {});
    // 448 is `max-w-md` at 16px rem. At NativeWind's own default of 14 it would
    // be 392, which is what once made the whole app look zoomed out.
    expect(styles).toContainEqual(expect.objectContaining({ maxWidth: 448 }));
    expect(styles).toContainEqual(
      expect.objectContaining({ paddingTop: 47, paddingBottom: 34 }),
    );
  });
});

describe("every screen, put through the shell", () => {
  const lists = screenClassLists();

  // One compile for all of them; each costs about a second.
  beforeAll(async () => {
    await useTailwind(
      [...lists.map((l) => l.classes), "mx-auto w-full max-w-md grow flex-1"].join(" "),
    );
  });

  it("was found — the scan is worthless if the regex silently matches nothing", () => {
    expect(lists.length).toBeGreaterThanOrEqual(6);
    expect(lists.map((l) => l.file)).toEqual(expect.arrayContaining(["Settings.tsx"]));
  });

  // A new screen is covered the moment it is written, which is the point: the
  // rule is about what the shell renders, not about any one screen's source.
  // Screens still paste the web's class list verbatim; `Screen` is what has to
  // guarantee nothing layout-hostile reaches the scroll container.
  it.each(lists)("$file lays out with no percentage height", async ({ classes }) => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <Screen className={classes}>
          <Text>page</Text>
        </Screen>
      </SafeAreaProvider>,
    );
    const offenders = allNodes(screen.toJSON()).flatMap((n) =>
      percentageHeights(n.props.style).map((v) => `${n.type} ${v}`),
    );
    expect(offenders).toEqual([]);
  });
});
