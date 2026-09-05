import {
  colors,
  motion,
  OBSERVATORY,
  RABBIT_HOLE,
  SAVINGS,
  VAULT,
  withAlpha,
  type Gradient,
} from "@/lib/theme";

describe("withAlpha", () => {
  it("appends the 0..1 alpha as an uppercase two-digit hex byte", () => {
    // The `${color}1A` pattern the web writes by hand for a 10% tint.
    expect(withAlpha("#FF3B30", 0.1)).toBe("#FF3B301A");
    expect(withAlpha("#34C759", 0.15)).toBe("#34C75926");
  });

  it("pads a single-digit byte to two characters", () => {
    expect(withAlpha("#000000", 0.02)).toBe("#00000005");
    expect(withAlpha("#000000", 0)).toBe("#00000000");
  });

  it("maps a full alpha to FF", () => {
    expect(withAlpha("#FFFFFF", 1)).toBe("#FFFFFFFF");
  });

  it("rounds rather than truncates", () => {
    // 0.5 * 255 = 127.5 → 128 → "80".
    expect(withAlpha("#123456", 0.5)).toBe("#12345680");
  });
});

describe("the page gradients", () => {
  const gradients: Gradient[] = [RABBIT_HOLE, OBSERVATORY, VAULT, SAVINGS];

  it("each have one stop per color, ascending from 0", () => {
    // A mismatched pair, or a stop out of order, silently blanks the gradient.
    for (const g of gradients) {
      expect(g.colors).toHaveLength(g.stops.length);
      expect(g.stops[0]).toBe(0);
      for (let i = 1; i < g.stops.length; i++) {
        expect(g.stops[i]).toBeGreaterThan(g.stops[i - 1]);
      }
    }
  });

  it("floors the three dark rooms in their own terminal color", () => {
    // The floor is what an overscroll bounce shows, so it has to be the color
    // the gradient ends on or the bounce flashes a seam.
    expect(RABBIT_HOLE.floor).toBe(RABBIT_HOLE.colors[RABBIT_HOLE.colors.length - 1]);
    expect(OBSERVATORY.floor).toBe(OBSERVATORY.colors[OBSERVATORY.colors.length - 1]);
    expect(VAULT.floor).toBe(VAULT.colors[VAULT.colors.length - 1]);
  });

  it("floors Home's savings tint on the light canvas", () => {
    expect(SAVINGS.floor).toBe(colors.canvas);
    expect(SAVINGS.colors[SAVINGS.colors.length - 1]).toBe(colors.canvas);
  });

  it("keeps the exact web pixel offsets", () => {
    expect(RABBIT_HOLE.stops).toEqual([0, 220, 460]);
    expect(OBSERVATORY.stops).toEqual([0, 220, 460]);
    expect(VAULT.stops).toEqual([0, 320, 640]);
    expect(SAVINGS.stops).toEqual([0, 260]);
  });
});

describe("colors", () => {
  it("exposes the tokens React Native needs as props", () => {
    expect(colors.carrot).toBe("#F56300");
    expect(colors.income).toBe("#34C759");
    expect(colors.expense).toBe("#FF3B30");
    expect(colors.canvas).toBe("#F2F2F7");
  });
});

describe("motion", () => {
  it("carries the web's durations and easings", () => {
    expect(motion.press).toBe(100);
    expect(motion.snapEase).toEqual([0.2, 0, 0, 1]);
    expect(motion.popEase).toEqual([0.2, 0.8, 0.2, 1]);
  });
});
