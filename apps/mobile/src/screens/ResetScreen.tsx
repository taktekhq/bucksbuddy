import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";

// New-password screen, rendered while useSession's recoveryMode is set (see
// useSession.ts). Mirrors src/screens/Reset.tsx: the recovery token from the
// email link is what authorizes updateUser({ password }); without it the SDK
// rejects the call, and this screen never renders anyway.
const MIN_LENGTH = 8;

export function ResetScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // Sign them out so the next step is a fresh sign-in with the new
    // password; signing out also drops recoveryMode in useSession.
    setDone(true);
    await supabase.auth.signOut();
  }

  async function cancel() {
    await supabase.auth.signOut();
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text accessibilityRole="header" style={styles.title}>All set</Text>
          <Text style={styles.subtitle}>Your password's been updated. Sign in to keep going.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const disabled = busy || password === "" || confirm === "";

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>New password</Text>
          <Text style={styles.subtitle}>Pick something memorable.</Text>
          <TextInput
            accessibilityLabel="New password"
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setPassword}
            placeholder="New password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <TextInput
            accessibilityLabel="Confirm password"
            autoCapitalize="none"
            autoComplete="new-password"
            onChangeText={setConfirm}
            onSubmitEditing={() => {
              if (!disabled) void submit();
            }}
            placeholder="Confirm password"
            secureTextEntry
            style={styles.input}
            value={confirm}
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.button,
              disabled ? styles.buttonDisabled : null,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Update password</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void cancel()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F2F2F7" },
  keyboard: { flex: 1, justifyContent: "center", padding: 24 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  card: { gap: 12 },
  title: { fontSize: 34, fontWeight: "800", color: "#111111", textAlign: "center" },
  subtitle: { marginBottom: 12, fontSize: 17, color: "#6C6C70", textAlign: "center" },
  input: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    fontSize: 17,
    color: "#111111",
  },
  error: { color: "#FF3B30" },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#1FB85A",
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  cancelText: { marginTop: 8, textAlign: "center", color: "#1FB85A", fontSize: 17, fontWeight: "600" },
});
