import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { Carrot } from "@/components/ui/Carrot";
import { supabase } from "@/lib/supabase";
import { colors, display, radius, shadowCard } from "@/lib/theme";

// New-password screen, rendered while Supabase's PASSWORD_RECOVERY event is in
// effect (see useSession). The recovery token from the email link is what
// created the session that authorizes updateUser({ password }); without it the
// SDK rejects the call, and App never renders this screen anyway.
const MIN_LENGTH = 8;

export function Reset() {
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
    // Sign them out so the next step is a fresh sign-in with the new password;
    // signing out also clears recoveryMode in useSession, dropping App back to
    // the landing.
    setDone(true);
    await supabase.auth.signOut();
  }

  async function cancel() {
    // Leave the recovery session entirely — no half-authenticated state.
    await supabase.auth.signOut();
  }

  if (done) {
    return (
      <Screen center paddingX={24} gap={0}>
        <View style={styles.centered}>
          <Carrot size={60} />
          <Text style={styles.h1}>All set</Text>
          <Text style={styles.doneText}>Your password's been updated. Sign in to keep going.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen center paddingX={24} gap={0}>
      <View style={styles.centered}>
        <Carrot size={60} />
        <Text style={styles.h1}>New{"\n"}Password</Text>
        <Text style={styles.subtitle}>Pick something memorable.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          placeholderTextColor={colors.labelMuted}
          style={styles.input}
        />
        <TextInput
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Confirm password"
          placeholderTextColor={colors.labelMuted}
          onSubmitEditing={submit}
          style={styles.input}
        />
        <Press onPress={submit} disabled={busy} disabledOpacity={0.5} style={styles.primary}>
          <Text style={styles.primaryText}>{busy ? "Saving…" : "Update password"}</Text>
        </Press>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Press onPress={cancel} disabled={busy} style={styles.cancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Press>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center" },
  h1: { ...display, marginTop: 16, textAlign: "center", fontSize: 30, lineHeight: 30, color: colors.labelMuted },
  subtitle: { marginTop: 4, fontSize: 16, lineHeight: 24, color: colors.labelSecondary },
  doneText: { marginTop: 12, textAlign: "center", fontSize: 16, lineHeight: 24, color: colors.labelSecondary },
  form: {
    marginTop: 32,
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: 20,
    ...shadowCard,
  },
  input: {
    borderRadius: radius.pill,
    backgroundColor: colors.grouped,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: colors.label,
  },
  primary: { borderRadius: radius.pill, backgroundColor: colors.carrot, paddingVertical: 14, alignItems: "center" },
  primaryText: { fontSize: 18, lineHeight: 28, fontWeight: "600", color: "#FFF" },
  error: { paddingHorizontal: 4, fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.danger },
  cancel: { marginTop: 20, alignSelf: "center" },
  cancelText: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.carrot },
});
