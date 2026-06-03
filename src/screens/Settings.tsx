import { useEffect, useState } from "react";
import { ChevronLeft, Download, Lock, ShieldCheck } from "lucide-react";
import { RateEditor } from "@/components/RateEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { transactionsToCsv } from "@/lib/csv";
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

const inputClass =
  "rounded-pill bg-grouped px-4 py-3 text-base text-label outline-none placeholder:text-label-muted";

// The encryption card — a prominent on/off card (styled like the Safe balance
// card), with the passphrase shown in plain text so it's easy to read, change,
// and save right here. The passphrase is kept only on this device, so the server
// never sees it. When it's "On" but this device hasn't stored the passphrase yet
// (a new device), the same field doubles as the unlock.
function EncryptionCard() {
  const { e2eMode, locked, passphrase, unlock, enableEncryption, disableEncryption } =
    useStore();
  const [pass, setPass] = useState(passphrase ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Keep the field in sync when the stored passphrase changes (unlock / save /
  // turn off), so it always shows the current one.
  useEffect(() => {
    setPass(passphrase ?? "");
  }, [passphrase]);

  const on = e2eMode === "passphrase";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = locked ? await unlock(pass) : await enableEncryption(pass);
    setBusy(false);
    if (error) setErr(error);
  }

  async function turnOff() {
    setBusy(true);
    setErr(null);
    const { error } = await disableEncryption();
    setBusy(false);
    if (error) setErr(error);
  }

  const buttonLabel = busy
    ? "Saving…"
    : locked
      ? "Unlock"
      : on
        ? "Save passphrase"
        : "Turn on encryption";

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader>Encryption</SectionHeader>
      <div
        className={`flex flex-col gap-3 rounded-card p-4 shadow-card ${
          on ? "bg-income/10 ring-1 ring-income/20" : "bg-surface"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              on ? "bg-income/15 text-income" : "bg-grouped text-label-secondary"
            }`}
          >
            {on ? (
              <ShieldCheck className="h-5 w-5" strokeWidth={2} />
            ) : (
              <Lock className="h-5 w-5" strokeWidth={2} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold uppercase leading-none text-label-muted">
              End-to-end encryption
            </p>
            <p
              className={`mt-1 text-sm font-medium ${
                on ? "text-income" : "text-label-secondary"
              }`}
            >
              {on ? (locked ? "On · locked on this device" : "On") : "Off"}
            </p>
          </div>
          {on && !locked && (
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="press shrink-0 text-sm font-medium text-expense disabled:opacity-50"
            >
              Turn off
            </button>
          )}
        </div>

        {!on && (
          <p className="text-sm text-label">
            Turn it on so no one else can see your data.
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            type="text"
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
            {buttonLabel}
          </button>
        </form>

        <p className="px-1 text-xs text-label-secondary">
          If you forget this passphrase, the data cannot be recovered.
        </p>
        {err && <p className="px-1 text-sm font-medium text-danger">{err}</p>}
      </div>
    </section>
  );
}
