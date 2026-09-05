import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HomeScreen } from "@/screens/HomeScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { ResetScreen } from "@/screens/ResetScreen";
import { configurationError } from "@/lib/supabase";
import { StoreProvider } from "@/lib/store";
import { useSession } from "@/lib/useSession";

export default function IndexScreen() {
  const { loading, session, recoveryMode } = useSession();

  // Password recovery wins over everything else: the user opened a reset
  // link from email, useSession exchanged its tokens for a session, and they
  // need to set a new password before doing anything else (see
  // src/App.tsx's web equivalent).
  if (recoveryMode) {
    return <ResetScreen />;
  }

  if (configurationError) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text accessibilityRole="header" style={styles.title}>BucksBuddy</Text>
        <Text style={styles.message}>{configurationError}</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <View accessibilityLabel="Loading session" style={styles.centered}>
        <ActivityIndicator color="#1FB85A" size="large" />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <StoreProvider userId={session.user.id}>
      <HomeScreen />
    </StoreProvider>
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
