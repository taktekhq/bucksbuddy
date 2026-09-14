import { useEffect, useState } from "react";

// Minimal hash router. Routes are "/", "/settings", "/safe", "/history",
// "/stats", "/legal", "/contact", "/reset". Hash-based so the static SPA needs
// no server rewrites and the back button works.
//
// "/" is the home/landing entry (the marketing landing for signed-out visitors,
// the app for signed-in ones); "/history" is the full-history page; "/stats" is
// the stats page (personal breakdown when signed in, community numbers for
// everyone); "/legal" is the public privacy + terms page; "/contact" is the
// public contact page; "/reset" is the post-recovery URL after useSession
// parses the tokens out of a Supabase reset-password email.
//
// The bare paths "/privacy", "/terms", "/contact" and "/stats" (no hash) are
// normalized onto the matching hash routes at startup by redirectBarePath()
// below.
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
    h === "/stats" ||
    h === "/stats/treats" ||
    h === "/stats/weekend" ||
    h === "/legal" ||
    h === "/contact" ||
    h === "/reset"
  ) {
    return h;
  }
  return "/";
}

// Bare (non-hash) paths that external links, shared URLs and search crawlers
// reach for — clean paths like /privacy rather than /#/legal. The app is
// hash-routed, so we map each onto its canonical hash route. A server-side
// redirect in vercel.json can't do this: Vercel won't emit a "#" fragment in a
// redirect's Location header, so a rule with a hash destination is silently
// dropped. Instead Vercel's SPA fallback serves index.html for these paths and
// we rewrite the URL in place here, before the app first renders.
const BARE_PATH_REDIRECTS: Record<string, string> = {
  "/privacy": "/#/legal",
  "/terms": "/#/legal",
  "/contact": "/#/contact",
  "/stats": "/#/stats",
};

// Called once from the entry point, before React mounts. If the page was opened
// at one of the bare marketing paths, rewrite the URL to its hash route so the
// router resolves it cleanly and the pathname returns to "/". No-op otherwise.
export function redirectBarePath() {
  const dest = BARE_PATH_REDIRECTS[window.location.pathname];
  if (dest) window.history.replaceState(null, "", dest);
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
