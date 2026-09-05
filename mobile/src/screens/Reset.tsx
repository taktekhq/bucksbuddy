import { useRef, useState } from "react";
import { Keyboard, Text, TextInput, View } from "react-native";
import { Input } from "@/components/ui/Input";
import { Carrot } from "@/components/ui/Carrot";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { supabase } from "@/lib/supabase";

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
  const confirmRef = useRef<TextInput>(null);

  async function submit() {
    // The web's `<form>`: the disabled submit button blocks a second Enter
    // while the first is still in flight.
    if (busy) return;
    Keyboard.dismiss();
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
    Keyboard.dismiss();
    await supabase.auth.signOut();
  }

  if (done) {
    return (
      <Screen className="flex flex-col justify-center px-6">
        <View className="flex flex-col items-center">
          <Carrot size={60} />
          <Text className="mt-4 text-center font-display text-3xl font-bold uppercase leading-none text-label-muted">
            All set
          </Text>
          <Text className="mt-3 text-center text-base text-label-secondary">
            Your password's been updated. Sign in to keep going.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="flex flex-col justify-center px-6">
      <View className="flex flex-col items-center">
        <Carrot size={60} />
        <Text className="mt-4 text-center font-display text-3xl font-bold uppercase leading-none text-label-muted">
          New{"\n"}Password
        </Text>
        <Text className="mt-1 text-base text-label-secondary">Pick something memorable.</Text>
      </View>

      {/* The web's <form onSubmit>: no element here — the submit button and the
          confirm field's return key both call the handler. */}
      <View className="mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
        <Input
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          value={password}
          onChangeText={setPassword}
          placeholder="New password"
          className="rounded-pill bg-grouped px-4 py-3.5 text-[18px] text-label placeholder:text-label-muted"
        />
        <Input
          ref={confirmRef}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          value={confirm}
          onChangeText={setConfirm}
          onSubmitEditing={submit}
          placeholder="Confirm password"
          className="rounded-pill bg-grouped px-4 py-3.5 text-[18px] text-label placeholder:text-label-muted"
        />
        <Press
          onPress={submit}
          disabled={busy}
          className="rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white transition disabled:opacity-50"
        >
          <Text className="text-center text-lg font-semibold text-white">
            {busy ? "Saving…" : "Update password"}
          </Text>
        </Press>
        {error && <Text className="px-1 text-sm font-medium text-danger">{error}</Text>}
      </View>

      <Press onPress={cancel} disabled={busy} className="mt-5 text-base font-semibold text-carrot">
        <Text className="text-center text-base font-semibold text-carrot">Cancel</Text>
      </Press>
    </Screen>
  );
}
