import { describe, it, expect } from "vitest";
import {
  categoriesFor,
  categoryColor,
  categoryIconName,
  categoryLabel,
  categorySubLabel,
  composeCategory,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAFE_CATEGORY,
  SAFE_CATEGORY_ID,
  splitCategory,
  subcategoriesFor,
  subcategoryLabel,
} from "./categories.js";

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

describe("categoryIconName", () => {
  it("returns the category's icon name", () => {
    expect(categoryIconName("groceries")).toBe("ShoppingCart");
  });

  it("falls back to MoreHorizontal for unknown ids", () => {
    expect(categoryIconName("mystery")).toBe("MoreHorizontal");
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

describe("id lookup precedence and missing subcategories", () => {
  // "family" and "other" are top-level in BOTH lists. The two definitions are
  // currently identical, so which one wins is unobservable — this pins that
  // they agree, which is the property the duplication relies on. If they ever
  // diverge, the registration guard decides, and this test starts to bite.
  it("resolves an id that appears in both lists, consistently", () => {
    const fromExpense = EXPENSE_CATEGORIES.find((c) => c.id === "other")!;
    expect(categoryIconName("other")).toBe(fromExpense.icon);
    expect(categoryColor("other")).toBe(fromExpense.color);
    expect(categoryLabel("family")).toBe(
      EXPENSE_CATEGORIES.find((c) => c.id === "family")!.label,
    );
  });

  it("falls back to the sub id for an unknown parent or a parent with no subs", () => {
    expect(subcategoryLabel("nope", "whatever")).toBe("whatever");
    // "gas" is a real category that carries no subcategory list.
    expect(subcategoryLabel("gas", "whatever")).toBe("whatever");
  });
});
