// Categories depend on direction: money IN uses a short income list, money OUT
// uses the fuller expense list. A combined lookup resolves labels/icon for any
// stored id (used by the recent list and CSV export).

import {
  Briefcase,
  Car,
  CircleParking,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  HandCoins,
  HeartPulse,
  Home,
  KeyRound,
  Landmark,
  Laptop,
  MoreHorizontal,
  PartyPopper,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Undo2,
  Users,
  UtensilsCrossed,
  Vault,
  type LucideIcon,
} from "lucide-react";

// A subcategory is an optional second level under a category (e.g. Health →
// Pharmacy, Fees → Mobile). It inherits the parent's icon and color. We store
// the pick as "parent/sub" in the transaction's `category` field, so no schema
// change is needed and existing single-level rows keep working untouched.
export type Subcategory = { id: string; label: string };

export type Category = {
  id: string;
  label: string;
  icon: LucideIcon;
  // A friendly, distinct color per category so the icons aren't bland gray.
  // Drawn from the Apple system palette to sit nicely on the iOS base.
  color: string;
  // Optional finer breakdown. Tapping the category reveals these.
  subcategories?: Subcategory[];
};

export const INCOME_CATEGORIES: Category[] = [
  { id: "salary", label: "Salary", icon: Briefcase, color: "#34C759" },
  { id: "freelance", label: "Freelance", icon: Laptop, color: "#007AFF" },
  { id: "rent_income", label: "Rent", icon: KeyRound, color: "#30B0C7" },
  { id: "refund", label: "Refund", icon: Undo2, color: "#AF52DE" },
  { id: "family", label: "Family", icon: Users, color: "#00C7BE" },
  { id: "other", label: "Other", icon: MoreHorizontal, color: "#8E8E93" },
];

export const EXPENSE_CATEGORIES: Category[] = [
  {
    id: "groceries",
    label: "Groceries",
    icon: ShoppingCart,
    color: "#34C759",
    subcategories: [
      { id: "supermarket", label: "Supermarket" },
      { id: "mini_market", label: "Mini-market" },
      { id: "bakery", label: "Bakery" },
      { id: "butcher", label: "Butcher" },
      { id: "produce", label: "Produce" },
    ],
  },
  {
    id: "food",
    label: "Food",
    icon: UtensilsCrossed,
    color: "#FF9500",
    subcategories: [
      { id: "restaurant", label: "Restaurant" },
      { id: "fast_food", label: "Fast Food" },
      { id: "delivery", label: "Delivery" },
      { id: "snacks", label: "Snacks" },
    ],
  },
  { id: "gas", label: "Gas", icon: Fuel, color: "#FF3B30" },
  { id: "gifts", label: "Gifts", icon: Gift, color: "#FF2D55" },
  { id: "rent", label: "Rent", icon: Home, color: "#5856D6" },
  {
    id: "health",
    label: "Health",
    icon: HeartPulse,
    color: "#FF375F",
    subcategories: [
      { id: "pharmacy", label: "Pharmacy" },
      { id: "doctor", label: "Doctor" },
      { id: "dental", label: "Dental" },
      { id: "insurance", label: "Insurance" },
      { id: "lab", label: "Lab/Tests" },
    ],
  },
  {
    id: "fun",
    label: "Fun",
    icon: PartyPopper,
    color: "#F56300",
    subcategories: [
      { id: "movies", label: "Movies" },
      { id: "games", label: "Games" },
      { id: "events", label: "Events" },
      { id: "drinks", label: "Drinks" },
    ],
  },
  { id: "gym", label: "Gym", icon: Dumbbell, color: "#007AFF" },
  { id: "work", label: "Work", icon: Briefcase, color: "#5856D6" },
  { id: "parking", label: "Parking", icon: CircleParking, color: "#30B0C7" },
  {
    id: "fees",
    label: "Fees",
    icon: Landmark,
    color: "#AF52DE",
    subcategories: [
      { id: "mobile", label: "Mobile" },
      { id: "internet", label: "Internet" },
      { id: "bank", label: "Bank" },
      { id: "subscriptions", label: "Subscriptions" },
      { id: "utilities", label: "Utilities" },
    ],
  },
  {
    id: "transport",
    label: "Transport",
    icon: Car,
    color: "#32ADE6",
    subcategories: [
      { id: "taxi", label: "Taxi" },
      { id: "bus", label: "Bus" },
      { id: "flight", label: "Flight" },
    ],
  },
  {
    id: "shopping",
    label: "Shopping",
    icon: ShoppingBag,
    color: "#A2845E",
    subcategories: [
      { id: "clothes", label: "Clothes" },
      { id: "electronics", label: "Electronics" },
      { id: "home", label: "Home" },
      { id: "beauty", label: "Beauty" },
    ],
  },
  {
    id: "coffee",
    label: "Coffee",
    icon: Coffee,
    color: "#8B5E3C",
    subcategories: [
      { id: "cafe", label: "Café" },
      { id: "beans", label: "Beans" },
    ],
  },
  { id: "self_care", label: "Self Care", icon: Sparkles, color: "#FF6482" },
  { id: "tips", label: "Tips", icon: HandCoins, color: "#FFCC00" },
  { id: "family", label: "Family", icon: Users, color: "#00C7BE" },
  { id: "other", label: "Other", icon: MoreHorizontal, color: "#8E8E93" },
];

export function categoriesFor(isIncome: boolean): Category[] {
  return isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

// Moving cash to/from the savings Safe is recorded as a normal transaction with
// this category, so it lands in your history and moves your balance. It's not
// offered in the picker — the Safe screen sets it. SAFE_CATEGORY_ID is the
// stored value; keep it stable.
export const SAFE_CATEGORY_ID = "safe";
export const SAFE_CATEGORY: Category = {
  id: SAFE_CATEGORY_ID,
  label: "Safe",
  icon: Vault,
  color: "#1FB85A",
};

// The income half of an "existing savings" entry — money you already had, not
// money out of this month's salary. It's paired with a Safe deposit of the same
// amount and timestamp so your spendable balance nets to zero while the safe
// still grows. History merges the pair back into one "+" line. Not offered in
// the picker — the Safe screen creates it. Keep the stored id stable.
export const SAFE_SEED_CATEGORY_ID = "safe_seed";
export const SAFE_SEED_CATEGORY: Category = {
  id: SAFE_SEED_CATEGORY_ID,
  label: "Existing savings",
  icon: Vault,
  color: "#1FB85A",
};

const byId = new Map<string, Category>();
for (const c of [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  SAFE_CATEGORY,
  SAFE_SEED_CATEGORY,
]) {
  if (!byId.has(c.id)) byId.set(c.id, c);
}

// Stored category ids are "parent" or "parent/sub". Split once, reuse below.
export function splitCategory(stored: string): {
  base: string;
  sub: string | null;
} {
  const i = stored.indexOf("/");
  if (i === -1) return { base: stored, sub: null };
  return { base: stored.slice(0, i), sub: stored.slice(i + 1) };
}

/** Build the stored id from a parent + optional subcategory. */
export function composeCategory(base: string, sub: string | null): string {
  return sub ? `${base}/${sub}` : base;
}

/** Subcategories available under a parent category (empty if none). */
export function subcategoriesFor(baseId: string): Subcategory[] {
  return byId.get(baseId)?.subcategories ?? [];
}

/** Friendly label for a subcategory id under a parent (falls back to the id). */
export function subcategoryLabel(baseId: string, subId: string): string {
  const sub = byId.get(baseId)?.subcategories?.find((s) => s.id === subId);
  return sub?.label ?? subId;
}

/** The subcategory label for a stored id, or null when there's no sub. */
export function categorySubLabel(stored: string): string | null {
  const { base, sub } = splitCategory(stored);
  return sub ? subcategoryLabel(base, sub) : null;
}

export function categoryLabel(id: string): string {
  const { base, sub } = splitCategory(id);
  const baseLabel = byId.get(base)?.label ?? base;
  return sub ? `${baseLabel} · ${subcategoryLabel(base, sub)}` : baseLabel;
}

export function categoryIcon(id: string): LucideIcon {
  return byId.get(splitCategory(id).base)?.icon ?? MoreHorizontal;
}

export function categoryColor(id: string): string {
  return byId.get(splitCategory(id).base)?.color ?? "#8E8E93";
}
