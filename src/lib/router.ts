import { useEffect, useState } from "react";

// Minimal hash router. Routes are "/", "/settings", "/safe", "/home". Hash-based
// so the static SPA needs no server rewrites and the back button works.
//
// "/home" is the public marketing landing page. It lives behind its own route
// for now (instead of being the default) so it can be previewed without taking
// over the app — see App.tsx.
export type Route = "/" | "/settings" | "/safe" | "/home";

function current(): Route {
  const h = window.location.hash.replace(/^#/, "");
  if (h === "/settings" || h === "/safe" || h === "/home") return h;
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
