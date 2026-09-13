// A stand-in for @/lib/store, so the real Recap screen can be looked at with
// fictional rows. The scenario comes from the page's ?scenario= query.
import type { ReactNode } from "react";
import { foodMonth, legendaryMonth, weekendMonth } from "./fixtures";

const scenario = new URLSearchParams(window.location.search).get("scenario") ?? "food";

// Stable like the real store's useCallback, so effects keyed on it don't loop.
const loadMonth = async (month: Date) => {
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (scenario === "error") throw new Error("boom");
  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  if (key === "2026-09") return foodMonth();
  if (key === "2026-08") return weekendMonth();
  if (key === "2026-02") return legendaryMonth();
  return [];
};

export function useStore() {
  return {
    vaultReady: scenario !== "loading",
    locked: scenario === "locked",
    homeCurrency: "USD",
    loadMonth,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
