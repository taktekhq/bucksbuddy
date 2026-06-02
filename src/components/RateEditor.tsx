import { useState } from "react";
import { useStore } from "@/lib/store";

export function RateEditor() {
  const { lbpPerUsd, setRate } = useStore();
  const [value, setValue] = useState(String(lbpPerUsd));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setStatus("saving");
    await setRate(n);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="rounded-card bg-surface p-4 shadow-card">
      <label className="text-sm font-medium text-label-secondary">
        Exchange rate (LBP per $1)
      </label>
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
          className="flex-1 rounded-card bg-grouped px-4 py-3 tabular-nums outline-none ring-carrot/40 transition focus:ring-2"
        />
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="press rounded-card bg-carrot px-5 font-semibold text-white shadow-carrot disabled:bg-separator disabled:text-label-secondary disabled:shadow-none"
        >
          {status === "saved" ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
