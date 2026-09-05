// Native counterpart to src/lib/categories.ts's resolveCategoryIcon: core
// stores each category's icon as its lucide export name (a string, see
// packages/core/src/categories.ts), and each shell resolves that name
// against its own icon package. Web uses lucide-react; native uses
// lucide-react-native — same export names, different package.
import { categoryIconName } from "@bucksbuddy/core/categories";
import * as LucideIcons from "lucide-react-native";
import { MoreHorizontal, type LucideIcon } from "lucide-react-native";

export function resolveCategoryIcon(name: string): LucideIcon {
  return (LucideIcons as unknown as Record<string, LucideIcon>)[name] ?? MoreHorizontal;
}

export function categoryIcon(id: string): LucideIcon {
  return resolveCategoryIcon(categoryIconName(id));
}
