import type { ReactNode } from "react";
import { Text } from "react-native";

// The small grey Grobold label that titles each section ("History", "Account",
// the hero's Bugs-ism). Grobold lives on grey only — see DESIGN_SYSTEM.md.
// Mirrors src/components/ui/SectionHeader.tsx.
export function SectionHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <Text className={`px-2 font-display text-sm font-semibold uppercase tracking-wide text-label-secondary ${className}`}>
      {children}
    </Text>
  );
}
