import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { FONT_FAMILY, FONT_WEIGHT } from "@/lib/recapText";
import { FOIL } from "@/components/recap/palette";
import { FoilDefs, RarityStars, Sparkle, Star, T, framePaint } from "@/components/recap/svg";

// Everything here is SVG content, so it only renders inside an <svg>.
function inSvg(children: ReactNode) {
  return render(<svg>{children}</svg>).container;
}

describe("T", () => {
  it("sets the font stack, weight, size, fill and position for its font id", () => {
    const text = inSvg(
      <T x={10} y={20} font="grobold" size={32} fill="#123456">
        Hello
      </T>,
    ).querySelector("text")!;
    expect(text).toHaveTextContent("Hello");
    expect(text).toHaveAttribute("x", "10");
    expect(text).toHaveAttribute("y", "20");
    expect(text).toHaveAttribute("font-family", FONT_FAMILY.grobold);
    expect(text).toHaveAttribute("font-weight", String(FONT_WEIGHT.grobold));
    expect(text).toHaveAttribute("font-size", "32");
    expect(text).toHaveAttribute("fill", "#123456");
  });

  it("anchors at the start unless told otherwise, and leaves optional attrs off", () => {
    const text = inSvg(
      <T x={0} y={0} font="nunito700" size={12} fill="#000">
        a
      </T>,
    ).querySelector("text")!;
    expect(text).toHaveAttribute("text-anchor", "start");
    expect(text).toHaveAttribute("font-weight", "700");
    expect(text).not.toHaveAttribute("letter-spacing");
    expect(text).not.toHaveAttribute("opacity");
  });

  it("passes an explicit anchor, letter-spacing and opacity through", () => {
    const text = inSvg(
      <T x={0} y={0} font="nunito900" size={12} fill="#000" anchor="middle" spacing={1.5} opacity={0.6}>
        a
      </T>,
    ).querySelector("text")!;
    expect(text).toHaveAttribute("text-anchor", "middle");
    expect(text).toHaveAttribute("font-weight", "900");
    expect(text).toHaveAttribute("letter-spacing", "1.5");
    expect(text).toHaveAttribute("opacity", "0.6");
  });
});

describe("Sparkle", () => {
  it("is a closed path centered on (x, y), unrotated by default, white and near-opaque", () => {
    const path = inSvg(<Sparkle x={10} y={20} r={4} />).querySelector("path")!;
    expect(path).toHaveAttribute("transform", "translate(10 20) rotate(0)");
    expect(path).toHaveAttribute("fill", "#ffffff");
    expect(path).toHaveAttribute("opacity", "0.9");
    const d = path.getAttribute("d")!;
    // Starts at the top tip and closes back there.
    expect(d.startsWith("M0,-4 ")).toBe(true);
    expect(d.endsWith("0,-4 Z")).toBe(true);
  });

  it("takes a rotation, fill and opacity", () => {
    const path = inSvg(
      <Sparkle x={1} y={2} r={3} rotate={30} fill="#ff0" opacity={0.5} />,
    ).querySelector("path")!;
    expect(path).toHaveAttribute("transform", "translate(1 2) rotate(30)");
    expect(path).toHaveAttribute("fill", "#ff0");
    expect(path).toHaveAttribute("opacity", "0.5");
  });
});

describe("Star", () => {
  it("is a ten-point polygon (five tips, five inner corners) with the first tip straight up", () => {
    const polygon = inSvg(<Star x={50} y={50} r={10} fill="#abc" />).querySelector("polygon")!;
    const points = polygon.getAttribute("points")!.split(" ");
    expect(points).toHaveLength(10);
    expect(points[0]).toBe("50.0,40.0");
    expect(polygon).toHaveAttribute("fill", "#abc");
    expect(polygon).toHaveAttribute("opacity", "1");
  });

  it("takes an opacity", () => {
    const polygon = inSvg(<Star x={0} y={0} r={1} fill="#abc" opacity={0.3} />).querySelector(
      "polygon",
    )!;
    expect(polygon).toHaveAttribute("opacity", "0.3");
  });
});

describe("RarityStars", () => {
  it("draws five stars with the first `count` lit and the rest faint", () => {
    const polygons = inSvg(<RarityStars x={0} y={0} count={3} fill="#fff" />).querySelectorAll(
      "polygon",
    );
    expect(polygons).toHaveLength(5);
    expect([...polygons].map((p) => p.getAttribute("opacity"))).toEqual([
      "1",
      "1",
      "1",
      "0.22",
      "0.22",
    ]);
    for (const p of polygons) expect(p).toHaveAttribute("fill", "#fff");
  });

  it("lights every star for five and none for zero", () => {
    const lit = (count: number) =>
      [...inSvg(<RarityStars x={0} y={0} count={count} fill="#fff" />).querySelectorAll("polygon")]
        .map((p) => p.getAttribute("opacity"));
    expect(lit(5)).toEqual(["1", "1", "1", "1", "1"]);
    expect(lit(0)).toEqual(["0.22", "0.22", "0.22", "0.22", "0.22"]);
  });

  it("spaces the stars by size and gap from the left edge", () => {
    // Each star's top tip is at (cx, y - size): cx = x + size + i * (2 * size + gap).
    const polygons = inSvg(
      <RarityStars x={10} y={100} count={1} size={10} gap={5} fill="#fff" />,
    ).querySelectorAll("polygon");
    const tips = [...polygons].map((p) => p.getAttribute("points")!.split(" ")[0]);
    expect(tips).toEqual(["20.0,90.0", "45.0,90.0", "70.0,90.0", "95.0,90.0", "120.0,90.0"]);
  });
});

describe("FoilDefs", () => {
  const stopColors = (el: Element) =>
    [...el.querySelectorAll("stop")].map((s) => s.getAttribute("stop-color"));

  it("defines every gradient and pattern under the prefix", () => {
    const c = inSvg(<FoilDefs prefix="card" base="#111111" glow="#222222" />);
    for (const id of ["sheen", "dual", "dual-art", "silver", "gold", "holo", "holo2", "spot", "ink"]) {
      expect(c.querySelector(`#card-${id}`), id).not.toBeNull();
    }
    for (const id of ["dots", "grid", "stars"]) {
      expect(c.querySelector(`pattern#card-${id}`), id).not.toBeNull();
    }
    // The foils run their palette end to end, evenly spaced.
    expect(stopColors(c.querySelector("#card-silver")!)).toEqual(FOIL.silver);
    expect(stopColors(c.querySelector("#card-gold")!)).toEqual(FOIL.gold);
    expect(stopColors(c.querySelector("#card-holo")!)).toEqual(FOIL.holo);
    expect(stopColors(c.querySelector("#card-holo2")!)).toEqual([...FOIL.holo].reverse());
    expect(
      [...c.querySelector("#card-silver")!.querySelectorAll("stop")].map((s) => s.getAttribute("offset")),
    ).toEqual(["0%", "25%", "50%", "75%", "100%"]);
    // The sheen alternates base and glow.
    expect(stopColors(c.querySelector("#card-sheen")!)).toEqual([
      "#111111",
      "#222222",
      "#111111",
      "#222222",
      "#111111",
    ]);
  });

  it("keeps two sets of defs apart on one page by their prefixes", () => {
    const c = inSvg(
      <>
        <FoilDefs prefix="a" base="#111111" glow="#222222" />
        <FoilDefs prefix="b" base="#333333" glow="#444444" />
      </>,
    );
    expect(c.querySelectorAll("#a-sheen")).toHaveLength(1);
    expect(c.querySelectorAll("#b-sheen")).toHaveLength(1);
    expect(stopColors(c.querySelector("#b-sheen")!)[0]).toBe("#333333");
  });

  it("splits the dual gradients between the base and the second color", () => {
    const c = inSvg(<FoilDefs prefix="p" base="#111111" glow="#222222" second="#abcdef" />);
    expect(stopColors(c.querySelector("#p-dual")!)).toEqual([
      "#111111",
      "#111111",
      "#ffffff",
      "#ffffff",
      "#abcdef",
      "#abcdef",
    ]);
    expect(stopColors(c.querySelector("#p-dual-art")!)).toEqual(["#222222", "#111111", "#abcdef"]);
  });

  it("falls back to the base on both ends of the dual gradients without a second color", () => {
    const c = inSvg(<FoilDefs prefix="p" base="#111111" glow="#222222" />);
    expect(stopColors(c.querySelector("#p-dual")!)).toEqual([
      "#111111",
      "#111111",
      "#ffffff",
      "#ffffff",
      "#111111",
      "#111111",
    ]);
    expect(stopColors(c.querySelector("#p-dual-art")!)).toEqual(["#222222", "#111111", "#111111"]);
  });
});

describe("framePaint", () => {
  it("is the plain type color for common, a sheen for uncommon, and a foil above that", () => {
    expect(framePaint("p", "common", "#111111")).toBe("#111111");
    expect(framePaint("p", "uncommon", "#111111")).toBe("url(#p-sheen)");
    expect(framePaint("p", "rare", "#111111")).toBe("url(#p-silver)");
    expect(framePaint("p", "epic", "#111111")).toBe("url(#p-holo)");
    expect(framePaint("p", "legendary", "#111111")).toBe("url(#p-gold)");
  });

  it("splits the plain frame for a dual type, but never a foil", () => {
    expect(framePaint("p", "common", "#111111", true)).toBe("url(#p-dual)");
    expect(framePaint("p", "uncommon", "#111111", true)).toBe("url(#p-dual)");
    // Rarity shows in the foil; a dual type doesn't get to hide it.
    expect(framePaint("p", "rare", "#111111", true)).toBe("url(#p-silver)");
    expect(framePaint("p", "epic", "#111111", true)).toBe("url(#p-holo)");
    expect(framePaint("p", "legendary", "#111111", true)).toBe("url(#p-gold)");
  });
});
