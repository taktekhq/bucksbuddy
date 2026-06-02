import { useState } from "react";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";

// An inset grouped row: label left, value input right. Saves on blur (no button)
// and flashes a green check, matching the iOS settings feel.
export function RateEditor() {
  const { lbpPerUsd, setRate } = useStore();
  const [value, setValue] = useState(String(lbpPerUsd));
  const [saved, setSaved] = useState(false);

  async function commit() {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setValue(String(lbpPerUsd)); // revert junk
      return;
    }
    if (n === lbpPerUsd) return;
    await setRate(n);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <label htmlFor="rate" className="text-base text-label">
          LBP per $1
        </label>
        <div className="flex items-center gap-2">
          {saved && <Check className="h-4 w-4 text-income" strokeWidth={3} />}
          <input
            id="rate"
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commit}
            className="w-28 rounded-lg border border-separator px-3 py-2 text-right text-base tabular-nums text-label outline-none ring-carrot/40 transition focus:ring-2"
          />
        </div>
      </div>
    </div>
  );
}
