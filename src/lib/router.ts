import { useEffect, useState } from "react";

// Minimal hash router. Routes are "/", "/settings", "/safe", "/history",
// "/legal", "/contact", "/reset". Hash-based so the static SPA needs no server
// rewrites and the back button works.
//
// "/" is the home/landing entry (the marketing landing for signed-out visitors,
// the app for signed-in ones); "/history" is the full-history page; "/legal" is
// the public privacy + terms page; "/contact" is the public contact page;
// "/reset" is the post-recovery URL after useSession parses the tokens out of a
// Supabase reset-password email.
//
// The bare paths "/privacy", "/terms" and "/contact" (no hash) redirect to the
// matching hash routes server-side — see the "redirects" in vercel.json.
export type Route =
  | "/"
  | "/settings"
  | "/safe"
  | "/history"
  | "/legal"
  | "/contact"
  | "/reset";

function current(): Route {
  // A Supabase recovery email appends "#access_token=…" to the redirect URL.
  // When that URL already has a hash (e.g. "#/reset"), the result is the
  // double-fragment "#/reset#access_token=…". Take only what's before the
  // second '#' so the route resolves cleanly.
  const h = window.location.hash.replace(/^#/, "").split("#")[0];
  if (
    h === "/settings" ||
    h === "/safe" ||
    h === "/history" ||
    h === "/legal" ||
    h === "/contact" ||
    h === "/reset"
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
