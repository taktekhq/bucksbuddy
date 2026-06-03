import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import { currentMonthRange } from "@/lib/dates";
import { netCents } from "@/lib/money";
import { SAFE_CATEGORY_ID } from "@/lib/categories";
import {
  decryptTransaction,
  disablePassphrase,
  enablePassphrase,
  encryptTransaction,
  loadVault,
  unlockVault,
  type E2EMode,
} from "@/lib/e2e";
import type {
  NewSafeGoldEntry,
  NewTransaction,
  SafeGoldEntry,
  Transaction,
  TransactionRow,
} from "@/types/db";

type Result = { error: string | null };

type Store = {
  loading: boolean;
  transactions: Transaction[];
  lbpPerUsd: number;
  monthlyNetCents: number;
  addTransaction: (tx: NewTransaction) => Promise<Result>;
  updateTransaction: (id: string, tx: NewTransaction) => Promise<Result>;
  deleteTransaction: (id: string) => Promise<Result>;
  setRate: (rate: number) => Promise<Result>;
  // Encryption. `e2eMode` is "default" (operator-readable, no passphrase) or
  // "passphrase" (real E2E). `locked` is true when a passphrase user hasn't
  // entered it yet this session, so transactions can't be decrypted.
  e2eMode: E2EMode;
  locked: boolean;
  unlock: (passphrase: string) => Promise<Result>;
  enableEncryption: (passphrase: string) => Promise<Result>;
  disableEncryption: () => Promise<Result>;
  // Savings Safe. Cash in the safe = all-time net of "safe"-category
  // transactions: money sent to the safe (Out) adds, money taken back (In)
  // subtracts.
  safeTotalCents: number;
  // Gold in the Safe, tracked in grams.
  safeGoldEntries: SafeGoldEntry[];
  safeGoldGrams: number;
  addSafeGoldEntry: (entry: NewSafeGoldEntry) => Promise<Result>;
  deleteSafeGoldEntry: (id: string) => Promise<Result>;
  refresh: () => Promise<void>;
};

const StoreContext = createContext<Store | null>(null);

const LOCKED_MSG = "Locked — unlock with your passphrase first.";

// The plaintext transaction columns, blanked when a row is encrypted: the
// values live in `ciphertext` instead.
const CLEAR_PLAINTEXT = {
  is_income: null,
  category: null,
  amount_usd_cents: null,
  original_currency: null,
  original_amount: null,
  rate_used: null,
  note: null,
};

// The encrypted-into-ciphertext fields of a NewTransaction, as an in-memory
// Transaction carries them (note normalised to null).
function secretFields(tx: NewTransaction) {
  return {
    is_income: tx.is_income,
    category: tx.category,
    amount_usd_cents: tx.amount_usd_cents,
    original_currency: tx.original_currency,
    original_amount: tx.original_amount,
    rate_used: tx.rate_used,
    note: tx.note ?? null,
  };
}

// A legacy (pre-encryption) row still has its plaintext columns populated.
function legacyFields(row: TransactionRow) {
  return {
    is_income: row.is_income!,
    category: row.category!,
    amount_usd_cents: row.amount_usd_cents!,
    original_currency: row.original_currency!,
    original_amount: row.original_amount!,
    rate_used: row.rate_used!,
    note: row.note,
  };
}

async function rowToTransaction(
  row: TransactionRow,
  masterKey: CryptoKey,
): Promise<Transaction> {
  const fields = row.ciphertext
    ? await decryptTransaction(masterKey, row.ciphertext)
    : legacyFields(row);
  return {
    id: row.id,
    user_id: row.user_id,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    ...fields,
  };
}

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
  const [e2eMode, setE2eMode] = useState<E2EMode>("default");
  const [locked, setLocked] = useState(false);
  // The decrypted master key for this session. A ref (not state) so it never
  // lands in React state / devtools and changing it doesn't trigger renders.
  const masterKey = useRef<CryptoKey | null>(null);

  // Load profile, gold and (if unlocked) the decrypted transactions. Encrypts
  // any legacy plaintext rows in place on the way — the one-time rollout.
  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: profile }, { data: gold }] = await Promise.all([
      supabase.from("profiles").select("lbp_per_usd").eq("id", userId).single(),
      supabase
        .from("safe_gold_entries")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(500),
    ]);
    if (profile?.lbp_per_usd) setLbpPerUsd(profile.lbp_per_usd);
    setSafeGoldEntries((gold ?? []) as SafeGoldEntry[]);

    const key = masterKey.current;
    if (!key) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const { data: rows } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(500);
    const txRows = (rows ?? []) as TransactionRow[];

    const legacy = txRows.filter((r) => !r.ciphertext);
    if (legacy.length > 0) {
      await Promise.all(
        legacy.map(async (r) =>
          supabase
            .from("transactions")
            .update({
              ...CLEAR_PLAINTEXT,
              ciphertext: await encryptTransaction(key, legacyFields(r)),
            })
            .eq("id", r.id),
        ),
      );
    }

    setTransactions(
      await Promise.all(txRows.map((r) => rowToTransaction(r, key))),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void (async () => {
      const vault = await loadVault(userId);
      if (vault.status === "unlocked") {
        masterKey.current = vault.masterKey;
        setE2eMode(vault.mode);
        setLocked(false);
      } else {
        masterKey.current = null;
        setE2eMode("passphrase");
        setLocked(true);
      }
      await loadData();
    })();
  }, [userId, loadData]);

  const unlock = useCallback(
    async (passphrase: string) => {
      const key = await unlockVault(userId, passphrase);
      if (!key) return { error: "Wrong passphrase." };
      masterKey.current = key;
      setLocked(false);
      await loadData();
      return { error: null };
    },
    [userId, loadData],
  );

  const enableEncryption = useCallback(
    async (passphrase: string) => {
      const key = masterKey.current;
      if (!key) return { error: LOCKED_MSG };
      await enablePassphrase(userId, key, passphrase);
      setE2eMode("passphrase");
      return { error: null };
    },
    [userId],
  );

  const disableEncryption = useCallback(async () => {
    const key = masterKey.current;
    if (!key) return { error: LOCKED_MSG };
    await disablePassphrase(userId, key);
    setE2eMode("default");
    return { error: null };
  }, [userId]);

  const addTransaction = useCallback(
    async (tx: NewTransaction) => {
      const key = masterKey.current;
      if (!key) return { error: LOCKED_MSG };
      const ciphertext = await encryptTransaction(key, tx);
      const { data, error } = await supabase
        .from("transactions")
        .insert({ user_id: userId, ciphertext })
        .select()
        .single();
      if (error) return { error: error.message };
      const row = data as TransactionRow;
      setTransactions((prev) => [
        {
          id: row.id,
          user_id: row.user_id,
          occurred_at: row.occurred_at,
          created_at: row.created_at,
          ...secretFields(tx),
        },
        ...prev,
      ]);
      return { error: null };
    },
    [userId],
  );

  const updateTransaction = useCallback(async (id: string, tx: NewTransaction) => {
    const key = masterKey.current;
    if (!key) return { error: LOCKED_MSG };
    const ciphertext = await encryptTransaction(key, tx);
    const { data, error } = await supabase
      .from("transactions")
      .update({ ...CLEAR_PLAINTEXT, ciphertext })
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    const row = data as TransactionRow;
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              id: row.id,
              user_id: row.user_id,
              occurred_at: row.occurred_at,
              created_at: row.created_at,
              ...secretFields(tx),
            }
          : t,
      ),
    );
    return { error: null };
  }, []);

  const deleteTransaction = useCallback(
    async (id: string) => {
      // Optimistic remove; restore on failure.
      const prev = transactions;
      setTransactions((cur) => cur.filter((t) => t.id !== id));
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) {
        setTransactions(prev);
        return { error: error.message };
      }
      return { error: null };
    },
    [transactions],
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
    e2eMode,
    locked,
    unlock,
    enableEncryption,
    disableEncryption,
    safeTotalCents,
    safeGoldEntries,
    safeGoldGrams,
    addSafeGoldEntry,
    deleteSafeGoldEntry,
    refresh: loadData,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
