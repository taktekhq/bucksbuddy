import { describe, it, expect } from "vitest";
import { MoreHorizontal, ShoppingCart } from "lucide-react";
import {
  categoriesFor,
  categoryColor,
  categoryIcon,
  categoryLabel,
  categorySubLabel,
  composeCategory,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAFE_CATEGORY,
  SAFE_CATEGORY_ID,
  SAFE_SEED_CATEGORY,
  SAFE_SEED_CATEGORY_ID,
  splitCategory,
  subcategoriesFor,
  subcategoryLabel,
} from "@/lib/categories";

describe("categoriesFor", () => {
  it("returns income or expense lists by direction", () => {
    expect(categoriesFor(true)).toBe(INCOME_CATEGORIES);
    expect(categoriesFor(false)).toBe(EXPENSE_CATEGORIES);
  });
});

describe("splitCategory", () => {
  it("splits parent/sub", () => {
    expect(splitCategory("health/pharmacy")).toEqual({
      base: "health",
      sub: "pharmacy",
    });
  });

  it("returns null sub when there is no slash", () => {
    expect(splitCategory("gas")).toEqual({ base: "gas", sub: null });
  });
});

describe("composeCategory", () => {
  it("joins parent and sub, or returns the bare parent", () => {
    expect(composeCategory("health", "doctor")).toBe("health/doctor");
    expect(composeCategory("gas", null)).toBe("gas");
  });
});

describe("subcategoriesFor", () => {
  it("returns the parent's subcategories", () => {
    expect(subcategoriesFor("health").length).toBeGreaterThan(0);
  });

  it("returns an empty array for unknown or sub-less categories", () => {
    expect(subcategoriesFor("gas")).toEqual([]);
    expect(subcategoriesFor("does-not-exist")).toEqual([]);
  });
});

describe("subcategoryLabel", () => {
  it("returns the friendly label", () => {
    expect(subcategoryLabel("health", "pharmacy")).toBe("Pharmacy");
  });

  it("falls back to the id when not found", () => {
    expect(subcategoryLabel("health", "nope")).toBe("nope");
  });
});

describe("categorySubLabel", () => {
  it("returns the sub label for parent/sub", () => {
    expect(categorySubLabel("health/doctor")).toBe("Doctor");
  });

  it("returns null when there is no sub", () => {
    expect(categorySubLabel("gas")).toBeNull();
  });
});

describe("categoryLabel", () => {
  it("returns the parent label", () => {
    expect(categoryLabel("groceries")).toBe("Groceries");
  });

  it("joins parent and sub with a dot", () => {
    expect(categoryLabel("health/pharmacy")).toBe("Health · Pharmacy");
  });

  it("falls back to the id for unknown base", () => {
    expect(categoryLabel("mystery")).toBe("mystery");
  });
});

describe("categoryIcon", () => {
  it("returns the category icon", () => {
    expect(categoryIcon("groceries")).toBe(ShoppingCart);
  });

  it("falls back to MoreHorizontal for unknown ids", () => {
    expect(categoryIcon("mystery")).toBe(MoreHorizontal);
  });
});

describe("categoryColor", () => {
  it("returns the category color", () => {
    expect(categoryColor("groceries")).toBe("#34C759");
  });

  it("falls back to neutral gray for unknown ids", () => {
    expect(categoryColor("mystery")).toBe("#8E8E93");
  });
});

describe("the safe category", () => {
  it("is exported with a stable id and is resolvable", () => {
    expect(SAFE_CATEGORY_ID).toBe("safe");
    expect(SAFE_CATEGORY.id).toBe("safe");
    expect(categoryLabel("safe")).toBe("Safe");
  });
});

describe("the existing-savings seed category", () => {
  it("is exported with a stable id and resolves to a friendly label", () => {
    expect(SAFE_SEED_CATEGORY_ID).toBe("safe_seed");
    expect(SAFE_SEED_CATEGORY.id).toBe("safe_seed");
    expect(categoryLabel("safe_seed")).toBe("Existing savings");
  });
});
