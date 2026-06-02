// Pure keypad helpers shared by the dialer. There is NO <input> anywhere — the
// composer holds the amount as a string and these just transform it / buzz.

export const HOLD_MS = 400; // hold ⌫ this long to clear the whole amount

export function buzz(strength = 8) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(strength);
  }
}

/**
 * Apply a keypad key to the current display string.
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
