// What the browser can tell us about installation. Pure reads, no side
// effects, so both the analytics client and the install hint can ask.

export type InstallTarget = "ios" | "android" | null;

// True when the page runs as a Home Screen app rather than in a browser tab.
export function isStandalone(): boolean {
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  }
  // Safari's own flag, older than the display-mode media query.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Which install steps apply. Null on a desktop, where the hint is just noise.
export function installTarget(ua: string = navigator.userAgent): InstallTarget {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return null;
}
