// Native counterpart to src/lib/useHistoryGrouping.ts — same preference key,
// AsyncStorage instead of localStorage. Unlike localStorage, AsyncStorage
// can't be read synchronously, so this starts at the "timeline" default and
// swaps in the stored value once the read resolves (a one-frame flicker at
// most, not worth blocking the screen on).
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type HistoryGrouping = "timeline" | "category";

const KEY = "bb-history-grouping";

export function useHistoryGrouping(): [HistoryGrouping, (grouping: HistoryGrouping) => void] {
  const [grouping, setGrouping] = useState<HistoryGrouping>("timeline");

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((v) => {
      if (v === "category") setGrouping("category");
    });
  }, []);

  const set = useCallback((next: HistoryGrouping) => {
    setGrouping(next);
    void AsyncStorage.setItem(KEY, next);
  }, []);

  return [grouping, set];
}
