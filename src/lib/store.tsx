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
import { canUseSafe } from "@/lib/features";
import type {
  NewSafeEntry,
  NewTransaction,
  SafeEntry,
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
  // Savings Safe (gated to allowlisted users — see lib/features).
  safeEnabled: boolean;
  safeEntries: SafeEntry[];
  safeTotalCents: number;
  addSafeEntry: (entry: NewSafeEntry) => Promise<{ error: string | null }>;
  deleteSafeEntry: (id: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({
  userId,
  userEmail,
  children,
}: {
  userId: string;
  userEmail: string | null;
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [lbpPerUsd, setLbpPerUsd] = useState(DEFAULT_LBP_PER_USD);
  const [safeEntries, setSafeEntries] = useState<SafeEntry[]>([]);
  const safeEnabled = canUseSafe(userEmail);

  const refresh = useCallback(async () => {
    const [{ data: profile }, { data: txs }] = await Promise.all([
      supabase.from("profiles").select("lbp_per_usd").eq("id", userId).single(),
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
    ]);
    if (profile?.lbp_per_usd) setLbpPerUsd(profile.lbp_per_usd);
    setTransactions((txs ?? []) as Transaction[]);

    // Only allowlisted users touch the safe. Tolerate a missing table (the
    // 0002 migration not applied yet) by ignoring the error and showing empty.
    if (safeEnabled) {
      const { data: safe } = await supabase
        .from("safe_entries")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500);
      setSafeEntries((safe ?? []) as SafeEntry[]);
    }
    setLoading(false);
  }, [userId, safeEnabled]);

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

  const addSafeEntry = useCallback(
    async (entry: NewSafeEntry) => {
      const { data, error } = await supabase
        .from("safe_entries")
        .insert({ ...entry, user_id: userId })
        .select()
        .single();
      if (error) return { error: error.message };
      setSafeEntries((prev) => [data as SafeEntry, ...prev]);
      return { error: null };
    },
    [userId],
  );

  const deleteSafeEntry = useCallback(
    async (id: string) => {
      // Optimistic remove; restore on failure.
      const prev = safeEntries;
      setSafeEntries((cur) => cur.filter((e) => e.id !== id));
      const { error } = await supabase
        .from("safe_entries")
        .delete()
        .eq("id", id);
      if (error) {
        setSafeEntries(prev);
        return { error: error.message };
      }
      return { error: null };
    },
    [safeEntries],
  );

  const monthlyNetCents = useMemo(() => {
    const { from, to } = currentMonthRange();
    const inMonth = transactions.filter((t) => {
      const d = new Date(t.occurred_at);
      return d >= from && d < to;
    });
    return netCents(inMonth);
  }, [transactions]);

  // The safe is an all-time running total: deposits add, withdrawals subtract.
  const safeTotalCents = useMemo(
    () =>
      safeEntries.reduce(
        (sum, e) =>
          sum + (e.is_deposit ? e.amount_usd_cents : -e.amount_usd_cents),
        0,
      ),
    [safeEntries],
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
    safeEnabled,
    safeEntries,
    safeTotalCents,
    addSafeEntry,
    deleteSafeEntry,
    refresh,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
