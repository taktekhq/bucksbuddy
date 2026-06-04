import { useEffect, useState } from "react";

// Minimal hash router. Routes are "/", "/settings", "/safe", "/home", "/legal".
// Hash-based so the static SPA needs no server rewrites and the back button
// works.
//
// "/home" is the public marketing landing page, and "/legal" is its public
// privacy + terms page. They live behind their own routes for now (instead of
// being the default) so they can be previewed without taking over the app — see
// App.tsx.
export type Route = "/" | "/settings" | "/safe" | "/home" | "/legal";

function current(): Route {
  const h = window.location.hash.replace(/^#/, "");
  if (
    h === "/settings" ||
    h === "/safe" ||
    h === "/home" ||
    h === "/legal"
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
