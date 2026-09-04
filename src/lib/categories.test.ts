import { describe, it, expect } from "vitest";
import { ShoppingCart, MoreHorizontal } from "lucide-react";
import { categoryIcon, resolveCategoryIcon } from "@/lib/categories";

// This file only covers the web-specific icon-name -> lucide-react component
// resolution added on top of @bucksbuddy/core/categories (which has its own
// tests for everything else — the data, labels, colors, and icon *names*).
describe("resolveCategoryIcon", () => {
  it("resolves a known icon name to its lucide-react component", () => {
    expect(resolveCategoryIcon("ShoppingCart")).toBe(ShoppingCart);
  });

  it("falls back to MoreHorizontal for a name lucide-react doesn't export", () => {
    // Not reachable through categoryIcon()/categoryIconName() today (every
    // stored category's icon name is a real lucide-react export, and so is
    // the fallback name itself) — this is resolveCategoryIcon's own defensive
    // guard against ever being handed something else.
    expect(resolveCategoryIcon("NotARealLucideIcon")).toBe(MoreHorizontal);
  });
});

describe("categoryIcon", () => {
  it("resolves a category id straight to its lucide-react component", () => {
    expect(categoryIcon("groceries")).toBe(ShoppingCart);
  });

  it("falls back to MoreHorizontal for an unknown id", () => {
    expect(categoryIcon("mystery")).toBe(MoreHorizontal);
  });
});
