// Remembers how the user likes their history grouped, across sessions. This is a
// pure UI preference (no amounts, not per-account), so it lives in its own
// localStorage key rather than the encrypted per-user cache. Defaults to the
// "timeline" view — chronological, day by day — which is what most people reach
// for ("what did I spend yesterday?").

import { useCallback, useEffect, useState } from "react";

export type HistoryGrouping = "timeline" | "category";

const KEY = "bb-history-grouping";

function read(): HistoryGrouping {
  try {
    return localStorage.getItem(KEY) === "category" ? "category" : "timeline";
  } catch {
    return "timeline";
  }
}

export function useHistoryGrouping(): [
  HistoryGrouping,
  (grouping: HistoryGrouping) => void,
] {
  const [grouping, setGrouping] = useState<HistoryGrouping>(read);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, grouping);
    } catch {
      // Storage unavailable (private mode, full) — the toggle still works for
      // this session, it just won't be remembered. Harmless to swallow.
    }
  }, [grouping]);

  const set = useCallback((next: HistoryGrouping) => setGrouping(next), []);
  return [grouping, set];
}
