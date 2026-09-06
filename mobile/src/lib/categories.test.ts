// Adapted from the web's src/lib/categories.test.ts — the assertions are the
// web's, with `lucide-react` swapped for `lucide-react-native` (the same icon
// set, different renderer) and the vitest import dropped.
import { MoreHorizontal, ShoppingCart, Vault } from "lucide-react-native";
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

  it("round-trips with splitCategory", () => {
    expect(splitCategory(composeCategory("fees", "mobile"))).toEqual({
      base: "fees",
      sub: "mobile",
    });
  });
});

describe("subcategoriesFor", () => {
  it("returns the parent's subcategories", () => {
    expect(subcategoriesFor("health").length).toBeGreaterThan(0);
    expect(subcategoriesFor("health").map((s) => s.id)).toContain("pharmacy");
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

  it("falls back to the id when the parent has no subcategories at all", () => {
    expect(subcategoryLabel("gas", "nope")).toBe("nope");
    expect(subcategoryLabel("does-not-exist", "nope")).toBe("nope");
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
    expect(categoryLabel("mystery/thing")).toBe("mystery · thing");
  });
});

describe("categoryIcon", () => {
  it("returns the category icon", () => {
    expect(categoryIcon("groceries")).toBe(ShoppingCart);
  });

  it("resolves through a stored parent/sub id", () => {
    expect(categoryIcon("groceries/bakery")).toBe(ShoppingCart);
  });

  it("falls back to MoreHorizontal for unknown ids", () => {
    expect(categoryIcon("mystery")).toBe(MoreHorizontal);
  });
});

describe("categoryColor", () => {
  it("returns the category color", () => {
    expect(categoryColor("groceries")).toBe("#34C759");
  });

  it("resolves through a stored parent/sub id", () => {
    expect(categoryColor("groceries/bakery")).toBe("#34C759");
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
    expect(categoryIcon("safe")).toBe(Vault);
  });

  it("is not offered in either picker list", () => {
    const ids = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => c.id);
    expect(ids).not.toContain(SAFE_CATEGORY_ID);
  });
});

describe("the combined lookup", () => {
  it("prefers the expense entry when an id appears in both lists", () => {
    // "family", "gift"/"gifts" and "other" exist on both sides; the map is
    // seeded expense-first and never overwritten, so the expense one wins.
    const expenseFamily = EXPENSE_CATEGORIES.find((c) => c.id === "family");
    const incomeFamily = INCOME_CATEGORIES.find((c) => c.id === "family");
    expect(expenseFamily).toBeDefined();
    expect(incomeFamily).toBeDefined();
    expect(categoryColor("family")).toBe(expenseFamily?.color);
  });

  it("resolves every id in both lists to its own label", () => {
    for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
      expect(typeof categoryLabel(c.id)).toBe("string");
      expect(categoryLabel(c.id).length).toBeGreaterThan(0);
    }
  });
});
