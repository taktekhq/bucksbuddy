import { useEffect, useState } from "react";
import { ChevronLeft, Download } from "lucide-react";
import { RateEditor } from "@/components/RateEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { transactionsToCsv } from "@/lib/csv";
import type { Transaction } from "@/types/db";

export function Settings() {
  const [email, setEmail] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  async function exportCsv() {
    setExporting(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: true });

    const csv = transactionsToCsv((data ?? []) as Transaction[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bucksbuddy-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setExporting(false);
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
            disabled={exporting}
            className="press flex w-full items-center justify-between px-4 py-3.5 text-base font-medium text-label disabled:opacity-50"
          >
            <span>{exporting ? "Exporting…" : "Export CSV"}</span>
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
