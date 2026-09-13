import { describe, it, expect } from "vitest";
import {
  FOIL,
  cardPalette,
  darken,
  flameColor,
  lighten,
  luminance,
  mix,
} from "@/components/recap/palette";

const HEX = /^#[0-9a-f]{6}$/;

describe("mix", () => {
  it("moves each channel the given fraction of the way, rounded to a byte", () => {
    // 127.5 rounds up to 0x80, so a half mix of black and white is #808080.
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#ff0000", "#0000ff", 0.5)).toBe("#800080");
    // 63.75 rounds to 0x40.
    expect(mix("#000000", "#ffffff", 0.25)).toBe("#404040");
  });

  it("stays put at 0 and lands on the target at 1", () => {
    expect(mix("#8B5E3C", "#ffffff", 0)).toBe("#8b5e3c");
    expect(mix("#8B5E3C", "#ffffff", 1)).toBe("#ffffff");
  });

  it("zero-pads single-digit channels so the hex stays six wide", () => {
    expect(mix("#000000", "#ffffff", 0.02)).toBe("#050505");
  });
});

describe("darken and lighten", () => {
  it("are mixes toward black and toward white", () => {
    expect(darken("#ffffff", 0.5)).toBe("#808080");
    expect(darken("#ffffff", 0.5)).toBe(mix("#ffffff", "#000000", 0.5));
    expect(lighten("#000000", 0.25)).toBe("#404040");
    expect(lighten("#000000", 0.25)).toBe(mix("#000000", "#ffffff", 0.25));
  });
});

describe("luminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(luminance("#000000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1, 10);
  });

  it("uses the linear leg of the sRGB curve for a channel at or under 0.03928", () => {
    // 10/255 = 0.0392 sits just under the knee: every channel is s / 12.92.
    expect(luminance("#0a0a0a")).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it("uses the power leg for a brighter channel", () => {
    // 128/255 = 0.502, well over the knee: ((s + 0.055) / 1.055) ^ 2.4.
    const s = ((128 / 255 + 0.055) / 1.055) ** 2.4;
    expect(luminance("#808080")).toBeCloseTo(s, 10);
  });

  it("weights green the most and blue the least", () => {
    expect(luminance("#00ff00")).toBeCloseTo(0.7152, 10);
    expect(luminance("#ff0000")).toBeCloseTo(0.2126, 10);
    expect(luminance("#0000ff")).toBeCloseTo(0.0722, 10);
  });
});

describe("cardPalette", () => {
  it("derives every field from the base color", () => {
    // Coffee brown, a dark category color.
    expect(cardPalette("#8B5E3C")).toEqual({
      base: "#8B5E3C",
      ground: "#efe5db",
      ink: "#432d1d",
      soft: "#e5dcd4",
      glow: "#ab8b73",
      onBase: "#ffffff",
    });
  });

  it("uses dark text on a bright base so a yellow card stays legible", () => {
    // Tips / Savings yellow has luminance ≈ 0.64, over the 0.5 line.
    const p = cardPalette("#FFCC00");
    expect(p.onBase).toBe("#4d3d00");
    expect(p.onBase).toBe(darken("#FFCC00", 0.7));
  });

  it("uses white text on a dark base", () => {
    expect(cardPalette("#8B5E3C").onBase).toBe("#ffffff");
    expect(cardPalette("#000000").onBase).toBe("#ffffff");
  });
});

describe("flameColor", () => {
  it("is grey under a week, then bronze, silver and gold at 7, 14 and 21", () => {
    expect(flameColor(0)).toBe("#8E8E93");
    expect(flameColor(6)).toBe("#8E8E93");
    expect(flameColor(7)).toBe("#B0793A");
    expect(flameColor(13)).toBe("#B0793A");
    expect(flameColor(14)).toBe("#9AA3AF");
    expect(flameColor(20)).toBe("#9AA3AF");
    expect(flameColor(21)).toBe("#E0A400");
    expect(flameColor(31)).toBe("#E0A400");
  });
});

describe("FOIL", () => {
  it("has a silver, holo and gold run of hex colors", () => {
    expect(Object.keys(FOIL)).toEqual(["silver", "holo", "gold"]);
    expect(FOIL.silver).toHaveLength(5);
    expect(FOIL.holo).toHaveLength(6);
    expect(FOIL.gold).toHaveLength(5);
    for (const run of Object.values(FOIL)) {
      for (const color of run) expect(color).toMatch(HEX);
    }
  });
});
