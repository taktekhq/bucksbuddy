"use client";

type Props = {
  onPress: (key: string) => void;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

// Pure digits-only pad. There is NO <input> anywhere — the parent holds the
// amount as a string and we just emit key presses. This is what keeps the
// native keyboard from ever appearing.
export function Numpad({ onPress }: Props) {
  function handle(key: string) {
    // Progressive-enhancement haptic (Android; iOS Safari ignores it).
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(8);
    }
    onPress(key);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => handle(k)}
          className="press rounded-card bg-grouped py-4 text-2xl font-medium tabular-nums active:bg-separator"
        >
          {k}
        </button>
      ))}
    </div>
  );
}

/**
 * Apply a numpad key to the current display string.
 * Rules: digits only, single decimal point, max 2 decimal places.
 */
export function applyKey(current: string, key: string): string {
  if (key === "⌫") {
    return current.slice(0, -1);
  }
  if (key === ".") {
    if (current.includes(".")) return current;
    return current === "" ? "0." : current + ".";
  }
  // digit
  const [, decimals] = current.split(".");
  if (decimals !== undefined && decimals.length >= 2) return current;
  // avoid leading zeros like "00" or "05"
  if (current === "0") return key;
  return current + key;
}
