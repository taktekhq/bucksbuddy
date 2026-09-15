import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFloorColor } from "@/lib/useFloorColor";

describe("useFloorColor", () => {
  beforeEach(() => {
    document.documentElement.style.background = "";
    document.body.style.background = "";
  });

  it("paints html and body in the floor color while mounted", () => {
    renderHook(() => useFloorColor("rgb(20, 20, 40)"));
    expect(document.documentElement.style.background).toBe("rgb(20, 20, 40)");
    expect(document.body.style.background).toBe("rgb(20, 20, 40)");
  });

  it("restores whatever was there before on unmount", () => {
    document.body.style.background = "rgb(1, 2, 3)";
    const { unmount } = renderHook(() => useFloorColor("rgb(20, 20, 40)"));
    expect(document.body.style.background).toBe("rgb(20, 20, 40)");
    unmount();
    expect(document.documentElement.style.background).toBe("");
    expect(document.body.style.background).toBe("rgb(1, 2, 3)");
  });

  it("follows a changed color", () => {
    const { rerender } = renderHook(({ c }) => useFloorColor(c), {
      initialProps: { c: "rgb(1, 1, 1)" },
    });
    rerender({ c: "rgb(2, 2, 2)" });
    expect(document.documentElement.style.background).toBe("rgb(2, 2, 2)");
  });
});
