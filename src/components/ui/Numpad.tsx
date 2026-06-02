import { useRef } from "react";

type Props = {
  onPress: (key: string) => void;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
const HOLD_MS = 400; // hold ⌫ this long to clear the whole amount

function buzz(strength = 8) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(strength);
  }
}

// Pure digits-only pad. There is NO <input> anywhere — the parent holds the
// amount as a string and we just emit key presses. This is what keeps the
// native keyboard from ever appearing.
export function Numpad({ onPress }: Props) {
  // Long-press state for the ⌫ key (hold to clear).
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  function handle(key: string) {
    buzz();
    onPress(key);
  }

  function startBackspaceHold() {
    longFired.current = false;
    holdTimer.current = setTimeout(() => {
      longFired.current = true;
      buzz(20); // stronger tick to signal the clear
      onPress("clear");
    }, HOLD_MS);
  }

  function endBackspaceHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    // A short tap (the hold never fired) deletes one character.
    if (!longFired.current) handle("⌫");
    longFired.current = false;
  }

  function cancelBackspaceHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    longFired.current = false;
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((k) =>
        k === "⌫" ? (
          <button
            key={k}
            type="button"
            aria-label="Delete (hold to clear)"
            onPointerDown={startBackspaceHold}
            onPointerUp={endBackspaceHold}
            onPointerLeave={cancelBackspaceHold}
            onPointerCancel={cancelBackspaceHold}
            onContextMenu={(e) => e.preventDefault()}
            className="press rounded-card bg-grouped py-4 font-display text-xl font-semibold tabular-nums text-carrot-dark transition active:bg-carrot-soft"
          >
            {k}
          </button>
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => handle(k)}
            className="press rounded-card bg-grouped py-4 font-display text-xl font-semibold tabular-nums text-label transition active:bg-carrot-soft"
          >
            {k}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * Apply a numpad key to the current display string.
 * Rules: digits only, single decimal point, max 2 decimal places.
 */
export function applyKey(current: string, key: string): string {
  if (key === "clear") {
    return "";
  }
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
