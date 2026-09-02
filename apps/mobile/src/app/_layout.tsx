import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { installNativeCrypto } from "@/lib/nativeCrypto";

installNativeCrypto();

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
