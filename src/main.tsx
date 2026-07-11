import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { Analytics } from "@vercel/analytics/react";
import App from "@/App";
import { redirectBarePath } from "@/lib/router";
import "@/lib/posthog";
import "./index.css";

// Map bare marketing paths (/privacy, /terms, /contact) onto their hash routes
// before anything renders, so a visitor who lands on one of those clean URLs
// sees the right page instead of the default landing. See redirectBarePath.
redirectBarePath();

// Keep the installed PWA up to date automatically. With registerType:
// "autoUpdate", a freshly-fetched service worker is applied and the page
// reloaded as soon as the browser notices one. The catch: the browser only
// re-fetches the service worker on a hard navigation, so a PWA that's left
// open for days — common on iOS, where standalone apps are suspended rather
// than closed — keeps running stale code until it's manually relaunched.
//
// To close that gap we kick off an update check every time the app comes back
// into view (the user switches back to it, or wakes the phone). If the check
// turns up a new build, autoUpdate takes over from there and reloads the page.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdate = () => {
      // Only bother when we're actually visible and online; an offline
      // update() rejects, which we can safely ignore and retry next resume.
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      registration.update().catch(() => {
        /* transient/offline failure — we'll try again on the next resume */
      });
    };

    // visibilitychange covers tab/app switches and unlock; focus covers the
    // window regaining focus. Either firing triggers a (cheap, deduped) check.
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("focus", checkForUpdate);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
);
