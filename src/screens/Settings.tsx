import { useEffect, useState } from "react";
import { RateEditor } from "@/components/RateEditor";
import { SignOutButton } from "@/components/SignOutButton";
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

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      <header className="flex items-center justify-between py-2">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="press -m-2 p-2 text-base font-semibold text-carrot"
        >
          Done
        </button>
        <h1 className="font-display text-base font-bold">Settings</h1>
        <span className="w-12" />
      </header>

      {email && (
        <p className="px-2 text-sm text-label-secondary">
          Signed in as {email}
        </p>
      )}

      <RateEditor />

      <button
        type="button"
        onClick={exportCsv}
        disabled={exporting}
        className="press rounded-card bg-surface py-4 text-center text-lg font-medium text-label shadow-card disabled:opacity-50"
      >
        {exporting ? "Exporting…" : "Export CSV"}
      </button>

      <SignOutButton />

      <p className="mt-2 text-center text-xs text-label-secondary">
        That&apos;s all, folks. 🥕
      </p>
    </main>
  );
}
