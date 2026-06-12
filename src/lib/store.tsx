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
import { navigate } from "@/lib/router";
import { clearCache, loadCache, saveCache } from "@/lib/cache";
import { DEFAULT_LBP_PER_USD } from "@/lib/currency";
import { currentMonthRange } from "@/lib/dates";
import { netCents } from "@/lib/money";
import { SAFE_CATEGORY_ID } from "@/lib/categories";
import { FETCH_CAP } from "@/lib/stats";
import {
  cipherMask,
  clearStoredPassphrase,
  decryptGoldValues,
  decryptTxValues,
  disablePassphrase,
  enablePassphrase,
  encryptGoldValues,
  encryptTxValues,
  loadStoredPassphrase,
  loadVault,
  storeStoredPassphrase,
  unlockVault,
  type E2EMode,
} from "@/lib/e2e";
import type {
  NewSafeGoldEntry,
  NewTransaction,
  SafeGoldEntry,
  SafeGoldEntryRow,
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
  // "passphrase" (real E2E). `locked` is true when this device doesn't have the
  // passphrase yet, so amounts show obscured until it's entered. `passphrase` is
  // the current one, cached on this device (null when off or not yet entered).
  e2eMode: E2EMode;
  locked: boolean;
  passphrase: string | null;
  unlock: (passphrase: string) => Promise<Result>;
  enableEncryption: (passphrase: string) => Promise<Result>;
  disableEncryption: () => Promise<Result>;
  // Sign out: clears the passphrase cached on this device before ending the
  // session, so the next person to sign in here can't reuse it.
  signOut: () => Promise<void>;
  // Delete account: permanently removes the user and all their data via the
  // `delete-account` edge function (the anon client can't delete an auth user),
  // then clears local secrets and ends the session. Irreversible.
  deleteAccount: () => Promise<Result>;
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

// Turn a stored row into a decrypted Transaction. The labels are plaintext; the
// money values come from the `_enc` columns, or — for rows not yet backfilled —
// from the legacy plaintext columns.
async function rowToTransaction(
  row: TransactionRow,
  masterKey: CryptoKey,
): Promise<Transaction> {
  const values = row.amount_usd_cents_enc
    ? await decryptTxValues(masterKey, {
        amount_usd_cents_enc: row.amount_usd_cents_enc,
        original_amount_enc: row.original_amount_enc!,
        note_enc: row.note_enc,
      })
    : {
        amount_usd_cents: row.amount_usd_cents!,
        original_amount: row.original_amount!,
        note: row.note ?? null,
      };
  return {
    id: row.id,
    user_id: row.user_id,
    is_income: row.is_income,
    category: row.category,
    original_currency: row.original_currency,
    rate_used: row.rate_used,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    ...values,
  };
}

async function rowToGold(
  row: SafeGoldEntryRow,
  masterKey: CryptoKey,
): Promise<SafeGoldEntry> {
  const values = row.grams_enc
    ? await decryptGoldValues(masterKey, {
        grams_enc: row.grams_enc,
        note_enc: row.note_enc,
      })
    : { grams: row.grams!, note: row.note ?? null };
  return {
    id: row.id,
    user_id: row.user_id,
    is_deposit: row.is_deposit,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    ...values,
  };
}

// Locked-device renderings: keep the plaintext labels, but show the amount as a
// garbled stand-in (so the screen looks alive, not walled off) until unlocked.
function maskedTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    user_id: row.user_id,
    is_income: row.is_income,
    category: row.category,
    original_currency: row.original_currency,
    rate_used: row.rate_used,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    amount_usd_cents: 0,
    original_amount: 0,
    note: null,
    amountMask: cipherMask(row.amount_usd_cents_enc),
  };
}

function maskedGold(row: SafeGoldEntryRow): SafeGoldEntry {
  return {
    id: row.id,
    user_id: row.user_id,
    is_deposit: row.is_deposit,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    grams: 0,
    note: null,
    gramsMask: cipherMask(row.grams_enc),
  };
}

// The plaintext-label columns written on every (encrypted) transaction row.
function txLabels(tx: NewTransaction) {
  return {
    is_income: tx.is_income,
    category: tx.category,
    original_currency: tx.original_currency,
    rate_used: tx.rate_used,
  };
}

// The in-memory Transaction for an optimistic add/update: values straight from
// the input, ids/timestamps from the row the database returned.
function txInMemory(row: TransactionRow, tx: NewTransaction): Transaction {
  return {
    id: row.id,
    user_id: row.user_id,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    is_income: tx.is_income,
    category: tx.category,
    amount_usd_cents: tx.amount_usd_cents,
    original_currency: tx.original_currency,
    original_amount: tx.original_amount,
    rate_used: tx.rate_used,
    note: tx.note ?? null,
  };
}

export function StoreProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  // Hydrate from the last on-device snapshot so the first frame shows real
  // numbers instead of zeros while the network read is in flight. `loading`
  // only starts true when there's nothing cached to show.
  const cached = useMemo(() => loadCache(userId), [userId]);
  const [loading, setLoading] = useState(cached === null);
  const [transactions, setTransactions] = useState<Transaction[]>(
    cached?.transactions ?? [],
  );
  const [lbpPerUsd, setLbpPerUsd] = useState(cached?.lbpPerUsd ?? DEFAULT_LBP_PER_USD);
  const [safeGoldEntries, setSafeGoldEntries] = useState<SafeGoldEntry[]>(
    cached?.safeGoldEntries ?? [],
  );
  const [e2eMode, setE2eMode] = useState<E2EMode>("default");
  const [locked, setLocked] = useState(false);
  const [passphrase, setPassphrase] = useState<string | null>(null);
  // The decrypted master key for this session. A ref (not state) so it never
  // lands in React state / devtools and changing it doesn't trigger renders.
  const masterKey = useRef<CryptoKey | null>(null);

  // Load the exchange rate plus, when unlocked, the decrypted transactions and
  // gold. Backfilling any legacy plaintext rows into the `_enc` columns was a
  // separate one-off operator step, not done here.
  const loadData = useCallback(async () => {
    setLoading(true);
    // The exchange rate isn't encrypted, so it loads regardless of lock state.
    const { data: profile } = await supabase
      .from("profiles")
      .select("lbp_per_usd")
      .eq("id", userId)
      .single();
    if (profile?.lbp_per_usd) setLbpPerUsd(profile.lbp_per_usd);

    const [{ data: txData }, { data: goldData }] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        // The cap lives in lib/stats so the daily series knows where the
        // fetched data ends and "unknown" begins.
        .limit(FETCH_CAP),
      supabase
        .from("safe_gold_entries")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(FETCH_CAP),
    ]);
    const txRows = (txData ?? []) as TransactionRow[];
    const goldRows = (goldData ?? []) as SafeGoldEntryRow[];

    const key = masterKey.current;
    if (!key) {
      // Locked: we can't decrypt, so show the rows with obscured amounts rather
      // than a blank wall. Drop any cached plaintext too — this device isn't
      // entitled to it until it's unlocked.
      setTransactions(txRows.map(maskedTransaction));
      setSafeGoldEntries(goldRows.map(maskedGold));
      clearCache(userId);
      setLoading(false);
      return;
    }

    setTransactions(
      await Promise.all(txRows.map((r) => rowToTransaction(r, key))),
    );
    setSafeGoldEntries(await Promise.all(goldRows.map((r) => rowToGold(r, key))));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void (async () => {
      const vault = await loadVault(userId);
      if (vault.status === "unlocked") {
        // Default tier: no user passphrase, always unlocked.
        masterKey.current = vault.masterKey;
        setE2eMode(vault.mode);
        setLocked(false);
        setPassphrase(null);
      } else {
        // Passphrase tier: try the one cached on this device so we stay unlocked
        // across restarts.
        setE2eMode("passphrase");
        const stored = loadStoredPassphrase(userId);
        const key = stored ? await unlockVault(userId, stored) : null;
        if (key) {
          masterKey.current = key;
          setLocked(false);
          setPassphrase(stored);
        } else {
          if (stored) clearStoredPassphrase(userId); // stale (changed elsewhere)
          masterKey.current = null;
          setLocked(true);
          setPassphrase(null);
        }
      }
      await loadData();
    })();
  }, [userId, loadData]);

  // Keep the on-device snapshot in step with what's on screen, so a later cold
  // start paints the latest data instantly. Only while unlocked and settled:
  // `loading` skips the empty first frame, and `locked` keeps masked stand-ins
  // (and the cleared cache) from being written back as if they were real.
  useEffect(() => {
    if (loading || locked) return;
    saveCache(userId, { transactions, lbpPerUsd, safeGoldEntries });
  }, [userId, loading, locked, transactions, lbpPerUsd, safeGoldEntries]);

  const unlock = useCallback(
    async (pass: string) => {
      const key = await unlockVault(userId, pass);
      if (!key) return { error: "Wrong passphrase." };
      masterKey.current = key;
      storeStoredPassphrase(userId, pass);
      setPassphrase(pass);
      setLocked(false);
      await loadData();
      return { error: null };
    },
    [userId, loadData],
  );

  const enableEncryption = useCallback(
    async (pass: string) => {
      const key = masterKey.current;
      if (!key) return { error: LOCKED_MSG };
      await enablePassphrase(userId, key, pass);
      storeStoredPassphrase(userId, pass);
      setPassphrase(pass);
      setE2eMode("passphrase");
      return { error: null };
    },
    [userId],
  );

  const disableEncryption = useCallback(async () => {
    const key = masterKey.current;
    if (!key) return { error: LOCKED_MSG };
    await disablePassphrase(userId, key);
    clearStoredPassphrase(userId);
    setPassphrase(null);
    setE2eMode("default");
    return { error: null };
  }, [userId]);

  const signOut = useCallback(async () => {
    // Drop the cached passphrase first so it doesn't linger on this device for
    // whoever signs in next. The in-memory key goes too. The auth listener in
    // App flips back to the login screen once the session ends; reset the hash
    // so the URL doesn't stay stuck on the page they signed out from.
    clearStoredPassphrase(userId);
    clearCache(userId);
    masterKey.current = null;
    setPassphrase(null);
    await supabase.auth.signOut();
    navigate("/");
  }, [userId]);

  const deleteAccount = useCallback(async () => {
    // The auth user can only be removed with admin privileges, so this defers to
    // the edge function. Its FK cascades wipe the profile, transactions, gold
    // and key vault along with the user.
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) return { error: error.message };
    // The account is gone server-side; drop the cached secrets and end the
    // session so the app falls back to the landing page.
    clearStoredPassphrase(userId);
    clearCache(userId);
    masterKey.current = null;
    setPassphrase(null);
    await supabase.auth.signOut();
    navigate("/");
    return { error: null };
  }, [userId]);

  const addTransaction = useCallback(
    async (tx: NewTransaction) => {
      const key = masterKey.current;
      if (!key) return { error: LOCKED_MSG };
      const enc = await encryptTxValues(key, tx);
      const { data, error } = await supabase
        .from("transactions")
        .insert({ user_id: userId, ...txLabels(tx), ...enc })
        .select()
        .single();
      if (error) return { error: error.message };
      setTransactions((prev) => [txInMemory(data as TransactionRow, tx), ...prev]);
      return { error: null };
    },
    [userId],
  );

  const updateTransaction = useCallback(async (id: string, tx: NewTransaction) => {
    const key = masterKey.current;
    if (!key) return { error: LOCKED_MSG };
    const enc = await encryptTxValues(key, tx);
    const { data, error } = await supabase
      .from("transactions")
      .update({ ...txLabels(tx), ...enc })
      .eq("id", id)
      .select()
      .single();
    if (error) return { error: error.message };
    const row = data as TransactionRow;
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? txInMemory(row, tx) : t)),
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
      const key = masterKey.current;
      if (!key) return { error: LOCKED_MSG };
      const enc = await encryptGoldValues(key, entry);
      const { data, error } = await supabase
        .from("safe_gold_entries")
        .insert({ user_id: userId, is_deposit: entry.is_deposit, ...enc })
        .select()
        .single();
      if (error) return { error: error.message };
      const row = data as SafeGoldEntryRow;
      setSafeGoldEntries((prev) => [
        {
          id: row.id,
          user_id: row.user_id,
          occurred_at: row.occurred_at,
          created_at: row.created_at,
          is_deposit: entry.is_deposit,
          grams: entry.grams,
          note: entry.note ?? null,
        },
        ...prev,
      ]);
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
    passphrase,
    unlock,
    enableEncryption,
    disableEncryption,
    signOut,
    deleteAccount,
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
