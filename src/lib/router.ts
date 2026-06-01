import { useEffect, useState } from "react";

// Minimal hash router. Routes are "/", "/add", "/settings". Hash-based so the
// static SPA needs no server rewrites and the back button works.
export type Route = "/" | "/settings";

function current(): Route {
  const h = window.location.hash.replace(/^#/, "");
  if (h === "/settings") return h;
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
