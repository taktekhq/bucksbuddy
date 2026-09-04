import "../../global.css";

import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { installNativeCrypto } from "@/lib/nativeCrypto";

installNativeCrypto();

export default function RootLayout() {
  // Grobold is the one custom face (headers, wordmark, primary buttons — see
  // docs/DESIGN_SYSTEM.md); everything else is the platform system font.
  // Nothing should render in the wrong font for a flash, so gate on load
  // rather than let text reflow once it arrives.
  const [fontsLoaded] = useFonts({
    Grobold: require("../../assets/fonts/Grobold.ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
