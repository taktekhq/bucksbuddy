import { HomeScreen } from "@/screens/HomeScreen";

// Auth gating and StoreProvider live in _layout.tsx now — every route needs
// them, not just this one. This file only exists because expo-router
// requires a file per route; Home has no route-specific logic of its own.
export default function IndexRoute() {
  return <HomeScreen />;
}
