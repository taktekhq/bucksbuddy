// Temporary web compatibility export while the rest of src/lib moves into the
// shared package. There is one source of category data for both shells;
// only icon *resolution* stays web-specific, since core stores icon names
// (portable) rather than lucide-react components (not portable to native —
// see categories.ts's Category.icon doc comment in packages/core).
export * from "@bucksbuddy/core/categories";

import { categoryIconName } from "@bucksbuddy/core/categories";
import * as LucideIcons from "lucide-react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export function resolveCategoryIcon(name: string): LucideIcon {
  return (LucideIcons as unknown as Record<string, LucideIcon>)[name] ?? MoreHorizontal;
}

export function categoryIcon(id: string): LucideIcon {
  return resolveCategoryIcon(categoryIconName(id));
}
