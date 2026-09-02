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

import { signInWithGoogle } from "@/lib/oauth";
import { supabase } from "@/lib/supabase";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) setError(signInError.message);
    setSubmitting(false);
  }

  async function signInGoogle() {
    setGoogleSubmitting(true);
    setError(null);
    // On success the listener in useSession picks up the new session and this
    // screen unmounts; we only land back here if the flow failed or the user
    // cancelled (in which case `error` stays null — see oauth.ts).
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) setError(oauthError);
    setGoogleSubmitting(false);
  }

  const disabled = submitting || googleSubmitting || email.trim() === "" || password === "";

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>BucksBuddy</Text>
          <Text style={styles.subtitle}>Your money, without the spreadsheet.</Text>
          <Pressable
            accessibilityRole="button"
            disabled={googleSubmitting || submitting}
            onPress={() => void signInGoogle()}
            style={({ pressed }) => [
              styles.googleButton,
              googleSubmitting || submitting ? styles.buttonDisabled : null,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            {googleSubmitting ? (
              <ActivityIndicator color="#111111" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </Pressable>
          <Text style={styles.divider}>or</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="Email"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoComplete="current-password"
            onChangeText={setPassword}
            onSubmitEditing={() => {
              if (!disabled) void signIn();
            }}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => void signIn()}
            style={({ pressed }) => [
              styles.button,
              disabled ? styles.buttonDisabled : null,
              pressed ? styles.buttonPressed : null,
            ]}
          >
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign in</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F2F2F7" },
  keyboard: { flex: 1, justifyContent: "center", padding: 24 },
  card: { gap: 12 },
  title: { fontSize: 38, fontWeight: "800", color: "#111111" },
  subtitle: { marginBottom: 12, fontSize: 17, color: "#6C6C70" },
  input: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    fontSize: 17,
    color: "#111111",
  },
  error: { color: "#FF3B30" },
  divider: { textAlign: "center", color: "#6C6C70", fontSize: 13 },
  googleButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  googleButtonText: { color: "#111111", fontSize: 17, fontWeight: "700" },
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
});
