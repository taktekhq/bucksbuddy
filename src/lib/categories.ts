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
  type LucideIcon,
} from "lucide-react";

export type Category = {
  id: string;
  label: string;
  icon: LucideIcon;
  // A friendly, distinct color per category so the icons aren't bland gray.
  // Drawn from the Apple system palette to sit nicely on the iOS base.
  color: string;
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
  { id: "groceries", label: "Groceries", icon: ShoppingCart, color: "#34C759" },
  { id: "food", label: "Food", icon: UtensilsCrossed, color: "#FF9500" },
  { id: "gas", label: "Gas", icon: Fuel, color: "#FF3B30" },
  { id: "gifts", label: "Gifts", icon: Gift, color: "#FF2D55" },
  { id: "rent", label: "Rent", icon: Home, color: "#5856D6" },
  { id: "health", label: "Health", icon: HeartPulse, color: "#FF375F" },
  { id: "fun", label: "Fun", icon: PartyPopper, color: "#F56300" },
  { id: "gym", label: "Gym", icon: Dumbbell, color: "#007AFF" },
  { id: "work", label: "Work", icon: Briefcase, color: "#5856D6" },
  { id: "parking", label: "Parking", icon: CircleParking, color: "#30B0C7" },
  { id: "fees", label: "Fees", icon: Landmark, color: "#AF52DE" },
  { id: "transport", label: "Transport", icon: Car, color: "#32ADE6" },
  { id: "shopping", label: "Shopping", icon: ShoppingBag, color: "#A2845E" },
  { id: "coffee", label: "Coffee", icon: Coffee, color: "#8B5E3C" },
  { id: "self_care", label: "Self Care", icon: Sparkles, color: "#FF6482" },
  { id: "tips", label: "Tips", icon: HandCoins, color: "#FFCC00" },
  { id: "family", label: "Family", icon: Users, color: "#00C7BE" },
  { id: "other", label: "Other", icon: MoreHorizontal, color: "#8E8E93" },
];

export function categoriesFor(isIncome: boolean): Category[] {
  return isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

const byId = new Map<string, Category>();
for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
  if (!byId.has(c.id)) byId.set(c.id, c);
}

export function categoryLabel(id: string): string {
  return byId.get(id)?.label ?? id;
}

export function categoryIcon(id: string): LucideIcon {
  return byId.get(id)?.icon ?? MoreHorizontal;
}

export function categoryColor(id: string): string {
  return byId.get(id)?.color ?? "#8E8E93";
}
