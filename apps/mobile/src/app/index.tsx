import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LoginScreen } from "@/screens/LoginScreen";
import { TransactionsScreen } from "@/screens/TransactionsScreen";
import { configurationError } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";

export default function IndexScreen() {
  const { loading, session } = useSession();

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

  return session ? <TransactionsScreen userId={session.user.id} /> : <LoginScreen />;
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
