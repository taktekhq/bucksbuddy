import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useThemeColor } from "@/lib/useThemeColor";

function metaContent(): string | null {
  return document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.getAttribute("content") ?? null;
}

describe("useThemeColor", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("creates the meta tag when none exists and sets the color", () => {
    renderHook(() => useThemeColor("#123456"));
    expect(metaContent()).toBe("#123456");
  });

  it("restores the previous color on unmount when one existed", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute("content", "#000000");
    document.head.appendChild(meta);

    const { unmount } = renderHook(() => useThemeColor("#ffffff"));
    expect(metaContent()).toBe("#ffffff");
    unmount();
    expect(metaContent()).toBe("#000000");
  });

  it("leaves the created tag in place when there was no previous color", () => {
    const { unmount } = renderHook(() => useThemeColor("#abcdef"));
    expect(metaContent()).toBe("#abcdef");
    unmount();
    // No prior content to restore to, so the last value stays.
    expect(metaContent()).toBe("#abcdef");
  });
});
