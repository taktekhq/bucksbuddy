import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import { currentMonthRange } from "@/lib/dates";
import { netCents } from "@/lib/money";
import { SAFE_CATEGORY_ID } from "@/lib/categories";
import type {
  NewSafeGoldEntry,
  NewTransaction,
  SafeGoldEntry,
  Transaction,
} from "@/types/db";

type Store = {
  loading: boolean;
  transactions: Transaction[];
  lbpPerUsd: number;
  monthlyNetCents: number;
  addTransaction: (tx: NewTransaction) => Promise<{ error: string | null }>;
  updateTransaction: (
    id: string,
    tx: NewTransaction,
  ) => Promise<{ error: string | null }>;
  deleteTransaction: (id: string) => Promise<{ error: string | null }>;
  setRate: (rate: number) => Promise<{ error: string | null }>;
  // Savings Safe. Cash in the safe = all-time net of "safe"-category
  // transactions: money sent to the safe (Out) adds, money taken back (In)
  // subtracts.
  safeTotalCents: number;
  // Gold in the Safe, tracked in grams.
  safeGoldEntries: SafeGoldEntry[];
  safeGoldGrams: number;
  addSafeGoldEntry: (
    entry: NewSafeGoldEntry,
  ) => Promise<{ error: string | null }>;
  deleteSafeGoldEntry: (id: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lbpPerUsd, setLbpPerUsd] = useState(DEFAULT_LBP_PER_USD);
  const [safeGoldEntries, setSafeGoldEntries] = useState<SafeGoldEntry[]>([]);

  const refresh = useCallback(async () => {
    const [{ data: profile }, { data: txs }, { data: gold }] = await Promise.all([
      supabase.from("profiles").select("lbp_per_usd").eq("id", userId).single(),
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
      // Cash in the safe rides along in `transactions` (category "safe"); only
      // the gold ledger is separate. Tolerate a missing table (the 0002 gold
      // migration not applied yet) by ignoring the error and showing empty.
      supabase
        .from("safe_gold_entries")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
    ]);
    if (profile?.lbp_per_usd) setLbpPerUsd(profile.lbp_per_usd);
    setTransactions((txs ?? []) as Transaction[]);
    setSafeGoldEntries((gold ?? []) as SafeGoldEntry[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addTransaction = useCallback(
    async (tx: NewTransaction) => {
      const { data, error } = await supabase
        .from("transactions")
        .insert({ ...tx, user_id: userId })
        .select()
        .single();
      if (error) return { error: error.message };
      // Optimistic: prepend immediately so Home reflects it without a refetch.
      setTransactions((prev) => [data as Transaction, ...prev]);
      return { error: null };
    },
    [userId],
  );

  const updateTransaction = useCallback(async (id: string, tx: NewTransaction) => {
    const { data, error } = await supabase
      .from("transactions")
      .update(tx)
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? (data as Transaction) : t)),
    );
    return { error: null };
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    // Optimistic remove; restore on failure.
    const prev = transactions;
    setTransactions((cur) => cur.filter((t) => t.id !== id));
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setTransactions(prev);
      return { error: error.message };
    }
    return { error: null };
  }, [transactions]);

  const setRate = useCallback(
    async (rate: number) => {
      const { error } = await supabase
        .from("profiles")
        .update({ lbp_per_usd: rate })
        .eq("id", userId);
      if (error) return { error: error.message };
      setLbpPerUsd(rate);
      return { error: null };
    },
    [userId],
  );

  const addSafeGoldEntry = useCallback(
    async (entry: NewSafeGoldEntry) => {
      const { data, error } = await supabase
        .from("safe_gold_entries")
        .insert({ ...entry, user_id: userId })
        .select()
        .single();
      if (error) return { error: error.message };
      setSafeGoldEntries((prev) => [data as SafeGoldEntry, ...prev]);
      return { error: null };
    },
    [userId],
  );

  const deleteSafeGoldEntry = useCallback(
    async (id: string) => {
      const prev = safeGoldEntries;
      setSafeGoldEntries((cur) => cur.filter((e) => e.id !== id));
      const { error } = await supabase
        .from("safe_gold_entries")
        .delete()
        .eq("id", id);
      if (error) {
        setSafeGoldEntries(prev);
        return { error: error.message };
      }
      return { error: null };
    },
    [safeGoldEntries],
  );

  const monthlyNetCents = useMemo(() => {
    const { from, to } = currentMonthRange();
    const inMonth = transactions.filter((t) => {
      const d = new Date(t.occurred_at);
      return d >= from && d < to;
    });
    return netCents(inMonth);
  }, [transactions]);

  // Cash in the safe = all-time net of "safe" transactions. Money sent to the
  // safe is an expense (Out) and adds to it; taking it back is income (In).
  const safeTotalCents = useMemo(
    () =>
      transactions.reduce(
        (sum, t) =>
          t.category === SAFE_CATEGORY_ID
            ? sum + (t.is_income ? -t.amount_usd_cents : t.amount_usd_cents)
            : sum,
        0,
      ),
    [transactions],
  );

  const safeGoldGrams = useMemo(
    () =>
      safeGoldEntries.reduce(
        (sum, e) => sum + (e.is_deposit ? e.grams : -e.grams),
        0,
      ),
    [safeGoldEntries],
  );

  const value: Store = {
    loading,
    transactions,
    lbpPerUsd,
    monthlyNetCents,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    setRate,
    safeTotalCents,
    safeGoldEntries,
    safeGoldGrams,
    addSafeGoldEntry,
    deleteSafeGoldEntry,
    refresh,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
