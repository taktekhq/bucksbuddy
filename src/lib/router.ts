import { useEffect, useState } from "react";

// Minimal hash router. Routes are "/", "/settings", "/safe", "/home",
// "/privacy", "/terms". Hash-based so the static SPA needs no server rewrites
// and the back button works.
//
// "/home" is the public marketing landing page, and "/privacy"/"/terms" are its
// public legal pages. They live behind their own routes for now (instead of
// being the default) so they can be previewed without taking over the app — see
// App.tsx.
export type Route =
  | "/"
  | "/settings"
  | "/safe"
  | "/home"
  | "/privacy"
  | "/terms";

function current(): Route {
  const h = window.location.hash.replace(/^#/, "");
  if (
    h === "/settings" ||
    h === "/safe" ||
    h === "/home" ||
    h === "/privacy" ||
    h === "/terms"
  ) {
    return h;
  }
  return "/";
}

export function navigate(to: Route) {
  if (current() === to) return;
  window.location.hash = to;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(current());
  useEffect(() => {
    const onChange = () => setRoute(current());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
