import { createNavigationContainerRef, StackActions } from "@react-navigation/native";

// The route set from the PWA's hash router, kept as the app's navigation API
// so screens port over unchanged: `navigate("/safe")`. Underneath it's a
// native stack (react-navigation + react-native-screens), which is what gives
// the app real iOS push/pop transitions and the edge swipe-back — the browser
// gave the PWA none of that, but a native app without them feels broken.
//
// Route semantics, mapped onto a stack:
//   • "/" is the root (Home when signed in, Landing when signed out). Going
//     there pops everything — it's never a page you go *back* from.
//   • Every other route is pushed on top of whatever's showing, except
//     "/stats/*" receipts which naturally sit on top of Stats.
//   • Back chevrons call `back()`, which pops one screen. If a screen was
//     deep-linked and there's nothing under it, back falls through to "/".
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

// Screen names in the navigators (see App.tsx) are the routes themselves.
export type StackParams = Record<Route, undefined>;

export const navigationRef = createNavigationContainerRef<StackParams>();

export function currentRoute(): Route {
  if (!navigationRef.isReady()) return "/";
  return (navigationRef.getCurrentRoute()?.name as Route | undefined) ?? "/";
}

export function navigate(to: Route) {
  if (!navigationRef.isReady()) return;
  if (currentRoute() === to) return;
  if (to === "/") {
    navigationRef.dispatch(StackActions.popToTop());
    return;
  }
  navigationRef.dispatch(StackActions.push(to));
}

/** Pop one screen; at the root this is a no-op (the hardware back then exits). */
export function back() {
  if (!navigationRef.isReady()) return;
  if (navigationRef.canGoBack()) navigationRef.goBack();
}
