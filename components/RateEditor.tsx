"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RateEditor({ initialRate }: { initialRate: number }) {
  const router = useRouter();
  const [rate, setRate] = useState(String(initialRate));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    const value = Number.parseInt(rate, 10);
    if (!Number.isFinite(value) || value <= 0) return;
    setStatus("saving");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    await supabase
      .from("profiles")
      .update({ lbp_per_usd: value })
      .eq("id", user.id);

    setStatus("saved");
    router.refresh();
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="rounded-card bg-grouped p-4">
      <label className="text-sm font-medium text-label-secondary">
        Exchange rate (LBP per $1)
      </label>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/[^0-9]/g, ""))}
          className="flex-1 rounded-card bg-white px-4 py-3 tabular-nums outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="press rounded-card bg-label px-5 font-semibold text-white disabled:bg-separator"
        >
          {status === "saved" ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
