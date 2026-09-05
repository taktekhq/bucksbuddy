import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Carrot } from "@/components/ui/Carrot";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { supabase } from "@/lib/supabase";
import { colors, display, leading, motion, radius, shadows, space, text, weight } from "@/lib/theme";

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

  // Form → "All set" is a crossfade (220ms), same as Landing's flow swap.
  return (
    <View style={styles.root}>
      {done ? (
        <Animated.View
          key="done"
          style={StyleSheet.absoluteFill}
          entering={FadeIn.duration(motion.pop)}
          exiting={FadeOut.duration(motion.pop)}
        >
          <Screen center paddingX={space(6)} gap={0}>
            <View style={styles.centered}>
              <Carrot size={60} />
              <Text style={styles.h1}>All set</Text>
              <Text style={styles.doneText}>
                Your password's been updated. Sign in to keep going.
              </Text>
            </View>
          </Screen>
        </Animated.View>
      ) : (
        <Animated.View
          key="form"
          style={StyleSheet.absoluteFill}
          entering={FadeIn.duration(motion.pop)}
          exiting={FadeOut.duration(motion.pop)}
        >
          <Screen center paddingX={space(6)} gap={0}>
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
                returnKeyType="next"
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
                returnKeyType="go"
                value={confirm}
                onChangeText={setConfirm}
                onSubmitEditing={submit}
                placeholder="Confirm password"
                placeholderTextColor={colors.labelMuted}
                style={styles.input}
              />
              <Press onPress={submit} disabled={busy} disabledOpacity={0.5} style={styles.submit}>
                <Text style={styles.submitText}>{busy ? "Saving…" : "Update password"}</Text>
              </Press>
              {error && <Text style={styles.error}>{error}</Text>}
            </View>

            <Press onPress={cancel} disabled={busy} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Press>
          </Screen>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { alignItems: "center" },
  // mt-4 text-center font-display text-3xl uppercase leading-none text-label-muted
  h1: {
    ...display,
    marginTop: space(4),
    fontSize: text["3xl"].fontSize,
    lineHeight: leading.none(text["3xl"].fontSize),
    textAlign: "center",
    color: colors.labelMuted,
  },
  // mt-1 text-base text-label-secondary
  subtitle: { ...text.base, marginTop: space(1), color: colors.labelSecondary },
  // mt-3 text-center text-base text-label-secondary
  doneText: {
    ...text.base,
    marginTop: space(3),
    textAlign: "center",
    color: colors.labelSecondary,
  },
  // mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card
  form: {
    marginTop: space(8),
    gap: space(3),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space(5),
    boxShadow: shadows.card,
  },
  // rounded-pill bg-grouped px-4 py-3.5 text-lg text-label — 28px line +
  // 14px padding each side = 56, pinned so both platforms match the web box.
  input: {
    height: text.lg.lineHeight + space(3.5) * 2,
    paddingHorizontal: space(4),
    paddingVertical: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.grouped,
    fontSize: text.lg.fontSize,
    color: colors.label,
    textAlignVertical: "center",
  },
  // rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white
  submit: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.carrot,
    paddingVertical: space(3.5),
  },
  submitText: { ...text.lg, fontWeight: weight.semibold, color: colors.white },
  // px-1 text-sm font-medium text-danger
  error: {
    ...text.sm,
    paddingHorizontal: space(1),
    fontWeight: weight.medium,
    color: colors.danger,
  },
  // mt-5 text-base font-semibold text-carrot (a block button: full width, centred)
  cancel: { marginTop: space(5), alignItems: "center" },
  cancelText: { ...text.base, fontWeight: weight.semibold, color: colors.carrot },
});
