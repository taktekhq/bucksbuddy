import type { ReactNode } from "react";

// The small grey Grobold label that titles each section ("History", "Account",
// the hero's Bugs-ism). Grobold lives on grey only — see DESIGN_SYSTEM.md.
export function SectionHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`px-2 font-display text-sm font-semibold uppercase tracking-wide text-label-secondary ${className}`}
    >
      {children}
    </h2>
  );
}
