import "../../global.css";

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { installNativeCrypto } from "@/lib/nativeCrypto";
import { LoginScreen } from "@/screens/LoginScreen";
import { ResetScreen } from "@/screens/ResetScreen";
import { configurationError } from "@/lib/supabase";
import { StoreProvider } from "@/lib/store";
import { useSession } from "@/lib/useSession";

installNativeCrypto();

// Auth gating and the StoreProvider live here rather than in index.tsx: every
// route under src/app (history, safe, settings, stats — Home is just
// index.tsx) is a sibling screen inside the same <Stack>, so all of them need
// to be *inside* StoreProvider, not just whichever one happens to render
// first. Mirrors src/App.tsx's gating, adapted for expo-router's stack (one
// shared navigator + StoreProvider around all authenticated screens) instead
// of web's single-page hash routing.
export default function RootLayout() {
  // Grobold is the one custom face (headers, wordmark, primary buttons — see
  // docs/DESIGN_SYSTEM.md); everything else is the platform system font.
  // Nothing should render in the wrong font for a flash, so gate on load
  // rather than let text reflow once it arrives.
  const [fontsLoaded] = useFonts({
    Grobold: require("../../assets/fonts/Grobold.ttf"),
  });
  const { loading, session, recoveryMode } = useSession();

  if (!fontsLoaded) return null;

  let content;
  // Password recovery wins over everything else: the user opened a reset
  // link from email, useSession exchanged its tokens for a session, and they
  // need to set a new password before doing anything else (see
  // src/App.tsx's web equivalent).
  if (recoveryMode) {
    content = <ResetScreen />;
  } else if (configurationError) {
    content = (
      <SafeAreaView style={styles.centered}>
        <Text accessibilityRole="header" style={styles.title}>BucksBuddy</Text>
        <Text style={styles.message}>{configurationError}</Text>
      </SafeAreaView>
    );
  } else if (loading) {
    content = (
      <View accessibilityLabel="Loading session" style={styles.centered}>
        <ActivityIndicator color="#1FB85A" size="large" />
      </View>
    );
  } else if (!session) {
    content = <LoginScreen />;
  } else {
    content = (
      <StoreProvider userId={session.user.id}>
        <Stack screenOptions={{ headerShown: false }} />
      </StoreProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      {content}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: "#F2F2F7",
  },
  title: { fontSize: 34, fontWeight: "800", color: "#111111" },
  message: { maxWidth: 340, textAlign: "center", color: "#6C6C70", lineHeight: 21 },
});
