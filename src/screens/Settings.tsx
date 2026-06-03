import { useEffect, useState } from "react";
import { ChevronLeft, Download, Lock, ShieldCheck } from "lucide-react";
import { RateEditor } from "@/components/RateEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { transactionsToCsv } from "@/lib/csv";
import { passphraseStrength, type Strength } from "@/lib/crypto";
import { useStore } from "@/lib/store";

export function Settings() {
  const [email, setEmail] = useState("");
  const { transactions, locked } = useStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  function exportCsv() {
    // Export the decrypted, in-memory rows (the database only holds ciphertext),
    // so it's instant — no query, nothing to await.
    const csv = transactionsToCsv(transactions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bucksbuddy-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function signOut() {
    // The auth listener in App flips back to the login screen automatically.
    await supabase.auth.signOut();
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {/* Plain iOS nav: back chevron + centered title. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase text-label-muted">
          Settings
        </h1>
      </header>

      {/* ACCOUNT */}
      <section className="flex flex-col gap-2">
        <SectionHeader>Account</SectionHeader>
        <div className="divide-y divide-separator overflow-hidden rounded-card bg-surface shadow-card">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <span className="text-base text-label">Signed in</span>
            <span className="truncate text-sm text-label-secondary">{email || "—"}</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="press flex w-full items-center px-4 py-3.5 text-base font-medium text-expense"
          >
            Sign out
          </button>
        </div>
      </section>

      {/* PRIVACY / ENCRYPTION */}
      <EncryptionCard />

      {/* EXCHANGE RATE */}
      <section className="flex flex-col gap-2">
        <SectionHeader>Exchange rate</SectionHeader>
        <RateEditor />
      </section>

      {/* DATA */}
      <section className="flex flex-col gap-2">
        <SectionHeader>Data</SectionHeader>
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <button
            type="button"
            onClick={exportCsv}
            disabled={locked}
            className="press flex w-full items-center justify-between px-4 py-3.5 text-base font-medium text-label disabled:opacity-50"
          >
            <span>Export CSV</span>
            <Download className="h-5 w-5 text-label-secondary" strokeWidth={2} />
          </button>
        </div>
      </section>

      <p className="mt-2 text-center text-xs text-label-secondary">
        That&apos;s all, folks. 🥕
      </p>
    </main>
  );
}

const STRENGTH: Record<Strength, { label: string; className: string }> = {
  weak: { label: "Weak", className: "text-expense" },
  fair: { label: "Fair", className: "text-carrot-dark" },
  strong: { label: "Strong", className: "text-income" },
};

const inputClass =
  "rounded-pill bg-grouped px-4 py-3 text-base text-label outline-none placeholder:text-label-muted";

// The encryption controls: unlock (when a passphrase user hasn't unlocked this
// session), or turn on / change / turn off end-to-end encryption.
function EncryptionCard() {
  const { e2eMode, locked, unlock, enableEncryption, disableEncryption } = useStore();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitUnlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await unlock(pass);
    setBusy(false);
    if (error) setErr(error);
  }

  async function submitSet(e: React.FormEvent) {
    e.preventDefault();
    if (pass !== confirm) {
      setErr("Passphrases don't match.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await enableEncryption(pass);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    setPass("");
    setConfirm("");
  }

  async function turnOff() {
    setBusy(true);
    setErr(null);
    const { error } = await disableEncryption();
    setBusy(false);
    if (error) setErr(error);
  }

  if (locked) {
    return (
      <section className="flex flex-col gap-2">
        <SectionHeader>Encryption</SectionHeader>
        <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
          <p className="flex items-center gap-2 text-sm text-label">
            <Lock className="h-4 w-4 shrink-0 text-label-secondary" strokeWidth={2} />
            Your data is encrypted. Enter your passphrase to unlock it for this session.
          </p>
          <form onSubmit={submitUnlock} className="flex flex-col gap-2">
            <input
              type="password"
              autoComplete="off"
              required
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Passphrase"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={busy}
              className="press rounded-pill bg-label py-3 text-base font-semibold text-surface transition disabled:opacity-50"
            >
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </form>
          {err && <p className="px-1 text-sm font-medium text-danger">{err}</p>}
        </div>
      </section>
    );
  }

  const on = e2eMode === "passphrase";
  const strength = pass ? passphraseStrength(pass) : null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader>Encryption</SectionHeader>
      <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
        {on ? (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium text-income">
              <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
              End-to-end encryption is on
            </span>
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="press shrink-0 text-sm font-medium text-expense disabled:opacity-50"
            >
              Turn off
            </button>
          </div>
        ) : (
          <p className="text-sm text-label">
            Encrypt your entries so only you can read them — not even whoever runs
            the server. You&apos;ll enter your passphrase to unlock the app each
            time you sign in.
          </p>
        )}

        <form onSubmit={submitSet} className="flex flex-col gap-2">
          <p className="rounded-card bg-carrot-soft px-3 py-2 text-xs text-label">
            ⚠️ If you forget this passphrase, your data is gone for good — there is
            no reset and no one (not even the operator) can recover it.
          </p>
          <input
            type="password"
            autoComplete="off"
            required
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder={on ? "New passphrase" : "Passphrase"}
            className={inputClass}
          />
          {strength && (
            <p className={`px-1 text-xs font-medium ${STRENGTH[strength].className}`}>
              Strength: {STRENGTH[strength].label}
            </p>
          )}
          {strength === "weak" && (
            <p className="px-1 text-xs text-label-secondary">
              An easy passphrase can be cracked by whoever runs the server.
            </p>
          )}
          <input
            type="password"
            autoComplete="off"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm passphrase"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="press rounded-pill bg-label py-3 text-base font-semibold text-surface transition disabled:opacity-50"
          >
            {busy ? "Saving…" : on ? "Change passphrase" : "Turn on encryption"}
          </button>
        </form>
        {err && <p className="px-1 text-sm font-medium text-danger">{err}</p>}
      </div>
    </section>
  );
}
