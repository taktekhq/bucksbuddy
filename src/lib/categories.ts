// Categories depend on direction: money IN uses a short income list, money OUT
// uses the fuller expense list. A combined lookup resolves labels/emoji for any
// stored id (used by the recent list and CSV export).

export type Category = {
  id: string;
  label: string;
  emoji: string;
};

export const INCOME_CATEGORIES: Category[] = [
  { id: "salary", label: "Work", emoji: "💼" },
  { id: "side_business", label: "Side Biz", emoji: "🧰" },
  { id: "sale", label: "Sale", emoji: "🏷️" },
  { id: "other", label: "Other", emoji: "⚪" },
];

export const EXPENSE_CATEGORIES: Category[] = [
  { id: "groceries", label: "Groceries", emoji: "🛒" },
  { id: "food", label: "Food", emoji: "🍔" },
  { id: "gas", label: "Gas", emoji: "⛽" },
  { id: "gifts", label: "Gifts", emoji: "🎁" },
  { id: "rent", label: "Rent", emoji: "🏠" },
  { id: "health", label: "Health", emoji: "❤️" },
  { id: "fun", label: "Fun", emoji: "🎉" },
  { id: "work", label: "Work", emoji: "💼" },
  { id: "other", label: "Other", emoji: "⚪" },
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

export function categoryEmoji(id: string): string {
  return byId.get(id)?.emoji ?? "⚪";
}
