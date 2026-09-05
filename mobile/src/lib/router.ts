import { useEffect, useState } from "react";
import { BackHandler } from "react-native";

// Minimal in-memory router — the native twin of the PWA's hash router. Same
// route set, same `navigate()` API, so screens port over unchanged. A small
// history stack backs the Android hardware back button (the web relied on the
// browser's).
export type Route =
  | "/"
  | "/settings"
  | "/safe"
  | "/history"
  | "/stats"
  | "/stats/treats"
  | "/stats/weekend"
  | "/legal"
  | "/contact"
  | "/reset";

let stack: Route[] = ["/"];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function currentRoute(): Route {
  return stack[stack.length - 1];
}

export function navigate(to: Route) {
  if (currentRoute() === to) return;
  // Going "/" resets the stack — it's the root, never a page you go back from.
  stack = to === "/" ? ["/"] : [...stack, to];
  emit();
}

/** Pop one entry. Returns false when already at the root. */
export function back(): boolean {
  if (stack.length <= 1) return false;
  stack = stack.slice(0, -1);
  emit();
  return true;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute());
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    listeners.add(onChange);
    // Android back button walks the stack; at the root it falls through to the
    // OS (which backgrounds the app), like any native app.
    const sub = BackHandler.addEventListener("hardwareBackPress", () => back());
    return () => {
      listeners.delete(onChange);
      sub.remove();
    };
  }, []);
  return route;
}
