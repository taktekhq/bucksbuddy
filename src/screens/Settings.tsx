import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Download,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { RateEditor } from "@/components/RateEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { transactionsToCsv } from "@/lib/csv";
import { useStore } from "@/lib/store";

export function Settings() {
  const [email, setEmail] = useState("");
  const { transactions, locked, signOut } = useStore();

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

      {/* DANGER ZONE */}
      <DeleteAccountCard />

      <p className="mt-2 text-center text-xs text-label-secondary">
        That&apos;s all, folks. 🥕
      </p>
    </main>
  );
}

// Delete account — a two-step destructive action. The first tap reveals a
// confirmation (since this can't be undone); confirming calls the store, which
// removes everything server-side and ends the session, dropping the app back to
// the landing page. On failure we surface the error and let them retry.
function DeleteAccountCard() {
  const { deleteAccount } = useStore();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setErr(null);
    const { error } = await deleteAccount();
    // On success the session ends and App swaps to the landing page, so there's
    // nothing to reset here. On failure, surface it and let them try again.
    if (error) {
      setBusy(false);
      setErr(error);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader>Danger zone</SectionHeader>
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        {confirming ? (
          <div className="flex flex-col gap-3 p-4">
            <p className="text-sm text-label">
              This permanently deletes your account and all your data. This
              can&apos;t be undone.
            </p>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="press rounded-pill bg-expense py-3 text-base font-semibold text-surface transition disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete everything"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setErr(null);
              }}
              disabled={busy}
              className="press rounded-pill bg-grouped py-3 text-base font-semibold text-label transition disabled:opacity-50"
            >
              Cancel
            </button>
            {err && <p className="px-1 text-sm font-medium text-danger">{err}</p>}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="press flex w-full items-center justify-between px-4 py-3.5 text-base font-medium text-expense"
          >
            <span>Delete account</span>
            <Trash2 className="h-5 w-5" strokeWidth={2} />
          </button>
        )}
      </div>
    </section>
  );
}

const inputClass =
  "w-full rounded-pill border border-separator bg-surface px-4 py-3 text-base text-label outline-none ring-carrot/40 transition focus:ring-2 placeholder:text-label-secondary";

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
  // Once a passphrase is saved we mask it, with an eye to reveal on demand.
  const [reveal, setReveal] = useState(false);

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

  // A saved-and-unlocked passphrase is the only state we mask (with the eye);
  // while entering or unlocking, the text stays visible so it's easy to type.
  const saved = on && !locked;
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
          on ? "bg-income/20 ring-1 ring-income/40" : "bg-surface"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              on ? "bg-income text-surface" : "bg-grouped text-label-secondary"
            }`}
          >
            {on ? (
              <ShieldCheck className="h-5 w-5" strokeWidth={2} />
            ) : (
              <Lock className="h-5 w-5" strokeWidth={2} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-tight text-label">
              End-to-end encryption
            </p>
            <p
              className={`mt-0.5 text-sm font-medium ${
                on ? "text-income" : "text-label-secondary"
              }`}
            >
              {on ? (locked ? "On · locked on this device" : "On") : "Off"}
            </p>
          </div>
        </div>

        {!on && (
          <p className="text-sm text-label">
            Turn it on so no one else can see your data.
          </p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="relative">
            <input
              type={saved && !reveal ? "password" : "text"}
              autoComplete="off"
              required
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Passphrase"
              className={`${inputClass} ${saved ? "pr-12" : ""}`}
            />
            {saved && (
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide passphrase" : "Show passphrase"}
                className="press absolute inset-y-0 right-0 flex items-center px-3.5 text-label-secondary"
              >
                {reveal ? (
                  <EyeOff className="h-5 w-5" strokeWidth={2} />
                ) : (
                  <Eye className="h-5 w-5" strokeWidth={2} />
                )}
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="press rounded-pill bg-label py-3 text-base font-semibold text-surface transition disabled:opacity-50"
          >
            {buttonLabel}
          </button>
        </form>

        {on && !locked && (
          <button
            type="button"
            onClick={turnOff}
            disabled={busy}
            className="press rounded-pill bg-expense/10 py-3 text-base font-semibold text-expense transition disabled:opacity-50"
          >
            Turn off encryption
          </button>
        )}

        <p className="px-1 text-xs text-label-secondary">
          If you forget this passphrase, the data cannot be recovered.
        </p>
        {err && <p className="px-1 text-sm font-medium text-danger">{err}</p>}
      </div>
    </section>
  );
}
