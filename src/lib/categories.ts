// Categories depend on direction: money IN uses a short income list, money OUT
// uses the fuller expense list. A combined lookup resolves labels/icon for any
// stored id (used by the recent list and CSV export).

import {
  Briefcase,
  CircleParking,
  Fuel,
  Gift,
  HeartPulse,
  Home,
  KeyRound,
  Laptop,
  MoreHorizontal,
  PartyPopper,
  ShoppingCart,
  Undo2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export type Category = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export const INCOME_CATEGORIES: Category[] = [
  { id: "salary", label: "Salary", icon: Briefcase },
  { id: "freelance", label: "Freelance", icon: Laptop },
  { id: "rent_income", label: "Rent", icon: KeyRound },
  { id: "refund", label: "Refund", icon: Undo2 },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

export const EXPENSE_CATEGORIES: Category[] = [
  { id: "groceries", label: "Groceries", icon: ShoppingCart },
  { id: "food", label: "Food", icon: UtensilsCrossed },
  { id: "gas", label: "Gas", icon: Fuel },
  { id: "gifts", label: "Gifts", icon: Gift },
  { id: "rent", label: "Rent", icon: Home },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "fun", label: "Fun", icon: PartyPopper },
  { id: "work", label: "Work", icon: Briefcase },
  { id: "parking", label: "Parking", icon: CircleParking },
  { id: "other", label: "Other", icon: MoreHorizontal },
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
