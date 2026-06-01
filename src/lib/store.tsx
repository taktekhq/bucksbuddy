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
import type { NewTransaction, Transaction } from "@/types/db";

type Store = {
  loading: boolean;
  transactions: Transaction[];
  lbpPerUsd: number;
  monthlyNetCents: number;
  addTransaction: (tx: NewTransaction) => Promise<{ error: string | null }>;
  setRate: (rate: number) => Promise<{ error: string | null }>;
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

  const monthlyNetCents = useMemo(() => {
    const { from, to } = currentMonthRange();
    const inMonth = transactions.filter((t) => {
      const d = new Date(t.occurred_at);
      return d >= from && d < to;
    });
    return netCents(inMonth);
  }, [transactions]);

  const value: Store = {
    loading,
    transactions,
    lbpPerUsd,
    monthlyNetCents,
    addTransaction,
    setRate,
    refresh,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
