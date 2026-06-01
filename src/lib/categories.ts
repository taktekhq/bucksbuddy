// Fixed starter category list. No management UI by design.

export type Category = {
  id: string;
  label: string;
  emoji: string;
};

export const CATEGORIES: Category[] = [
  { id: "groceries", label: "Groceries", emoji: "🛒" },
  { id: "food", label: "Food", emoji: "🍔" },
  { id: "gas", label: "Gas", emoji: "⛽" },
  { id: "gifts", label: "Gifts", emoji: "🎁" },
  { id: "work", label: "Work", emoji: "💼" },
  { id: "rent", label: "Rent", emoji: "🏠" },
  { id: "health", label: "Health", emoji: "❤️" },
  { id: "fun", label: "Fun", emoji: "🎉" },
  { id: "other", label: "Other", emoji: "⚪" },
];

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return byId.get(id);
}

export function categoryLabel(id: string): string {
  return byId.get(id)?.label ?? id;
}

export function categoryEmoji(id: string): string {
  return byId.get(id)?.emoji ?? "⚪";
}
