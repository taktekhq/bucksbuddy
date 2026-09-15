// Remembers whether the Recurring page is showing the monthly or the yearly
// side, across sessions. A pure UI preference (no amounts, not per-account),
// so it lives in its own localStorage key like the history grouping does.
// Defaults to monthly — that's the bill most people come to check.

import { useCallback, useEffect, useState } from "react";

export type RecurringView = "monthly" | "yearly";

const KEY = "bb-recurring-view";

function read(): RecurringView {
  try {
    return localStorage.getItem(KEY) === "yearly" ? "yearly" : "monthly";
  } catch {
    return "monthly";
  }
}

export function useRecurringView(): [RecurringView, (view: RecurringView) => void] {
  const [view, setView] = useState<RecurringView>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, view);
    } catch {
      // Storage unavailable (private mode, full) — the toggle still works for
      // this session, it just won't be remembered. Harmless to swallow.
    }
  }, [view]);

  const set = useCallback((next: RecurringView) => setView(next), []);
  return [view, set];
}
