// Remembers how the user likes their history grouped, across sessions. This is a
// pure UI preference (no amounts, not per-account), so it lives in its own
// AsyncStorage key rather than the encrypted per-user cache. Defaults to the
// "timeline" view — chronological, day by day — which is what most people reach
// for ("what did I spend yesterday?").

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export type HistoryGrouping = "timeline" | "category";

const KEY = "bb-history-grouping";

export function useHistoryGrouping(): [
  HistoryGrouping,
  (grouping: HistoryGrouping) => void,
] {
  const [grouping, setGrouping] = useState<HistoryGrouping>("timeline");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (cancelled) return;
        if (v === "category") setGrouping("category");
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(KEY, grouping).catch(() => {
      // Storage unavailable — the toggle still works for this session, it
      // just won't be remembered. Harmless to swallow.
    });
  }, [grouping, hydrated]);

  const set = useCallback((next: HistoryGrouping) => setGrouping(next), []);
  return [grouping, set];
}
