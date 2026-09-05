import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { Easing, FadeIn, LinearTransition } from "react-native-reanimated";
import { Download, Eye, EyeOff, Lock, ShieldCheck, Trash2 } from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { RateEditor } from "@/components/RateEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { transactionsToCsv } from "@/lib/csv";
import { useStore } from "@/lib/store";
import posthog from "@/lib/posthog";
import {
  colors,
  leading,
  motion,
  radius,
  shadows,
  space,
  text,
  weight,
  withAlpha,
} from "@/lib/theme";

// The danger-zone card swaps a row for a confirm block; the card's height and
// whatever sits below it glide (0.22s, the stack's pop curve) instead of
// snapping, and the revealed content fades in.
const POP_EASE = Easing.bezier(...motion.popEase);
const LAYOUT = LinearTransition.duration(motion.pop).easing(POP_EASE);
const FADE = FadeIn.duration(motion.pop).easing(POP_EASE);

export function Settings() {
  const [email, setEmail] = useState("");
  const { transactions, locked, signOut } = useStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  async function exportCsv() {
    // Export the decrypted, in-memory rows (the database only holds ciphertext),
    // so it's instant — no query, nothing to await. On native the file goes to
    // the cache dir and out through the share sheet (the browser's download).
    const csv = transactionsToCsv(transactions);
    const file = new File(Paths.cache, `bucksbuddy-${new Date().toISOString().slice(0, 10)}.csv`);
    try {
      file.write(csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "text/csv",
          UTI: "public.comma-separated-values-text",
        });
      }
      posthog.capture("csv_exported", { row_count: transactions.length });
    } catch {
      // Share sheet dismissed or storage unavailable — nothing to report.
    }
  }

  return (
    <Screen gap={space(6)}>
      {/* Plain iOS nav: back chevron + centered title. */}
      <NavHeader title="Settings" onBack={() => navigate("/")} />

      {/* ACCOUNT */}
      <View style={styles.section}>
        <SectionHeader>Account</SectionHeader>
        <View style={styles.card}>
          <View style={styles.clip}>
            <View style={[styles.row, styles.rowBetween]}>
              <Text style={styles.rowLabel}>Signed in</Text>
              <Text style={styles.rowValue} numberOfLines={1}>
                {email || "—"}
              </Text>
            </View>
            <Press onPress={signOut} style={[styles.row, styles.divide]}>
              <Text style={[styles.rowAction, { color: colors.expense }]}>Sign out</Text>
            </Press>
          </View>
        </View>
      </View>

      {/* PRIVACY / ENCRYPTION */}
      <EncryptionCard />

      {/* EXCHANGE RATE */}
      <View style={styles.section}>
        <SectionHeader>Exchange rate</SectionHeader>
        <RateEditor />
      </View>

      {/* DATA */}
      <View style={styles.section}>
        <SectionHeader>Data</SectionHeader>
        <View style={styles.card}>
          <View style={styles.clip}>
            <Press
              onPress={exportCsv}
              disabled={locked}
              disabledOpacity={0.5}
              style={[styles.row, styles.rowBetween]}
            >
              <Text style={[styles.rowAction, { color: colors.label }]}>Export CSV</Text>
              <Download size={20} strokeWidth={2} color={colors.labelSecondary} />
            </Press>
          </View>
        </View>
      </View>

      {/* DANGER ZONE */}
      <DeleteAccountCard />

      <Animated.Text layout={LAYOUT} style={styles.footer}>
        That's all, folks. 🥕
      </Animated.Text>
    </Screen>
  );
}

// Delete account — a two-step destructive action. The first tap reveals a
// confirmation (since this can't be undone); confirming calls the store, which
// removes everything server-side and ends the session, dropping the app back to
// the landing page. On failure we surface the error and let them retry.
function DeleteAccountCard() {
  const { deleteAccount } = useStore();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Only fade content in once the user has toggled — never on first paint.
  const [armed, setArmed] = useState(false);

  async function remove() {
    setBusy(true);
    setErr(null);
    const { error } = await deleteAccount();
    if (error) {
      setBusy(false);
      setErr(error);
    } else {
      posthog.capture("account_deleted");
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeader>Danger zone</SectionHeader>
      <Animated.View layout={LAYOUT} style={styles.card}>
        <Animated.View layout={LAYOUT} style={styles.clip}>
          {confirming ? (
            <Animated.View key="confirm" entering={armed ? FADE : undefined} style={styles.confirm}>
              <Text style={styles.confirmText}>
                This permanently deletes your account and all your data. This
                can't be undone.
              </Text>
              <Press
                onPress={remove}
                disabled={busy}
                disabledOpacity={0.5}
                style={[styles.pill, { backgroundColor: colors.expense }]}
              >
                <Text style={[styles.pillText, { color: colors.surface }]}>
                  {busy ? "Deleting…" : "Delete everything"}
                </Text>
              </Press>
              <Press
                onPress={() => {
                  setConfirming(false);
                  setErr(null);
                }}
                disabled={busy}
                disabledOpacity={0.5}
                style={[styles.pill, { backgroundColor: colors.grouped }]}
              >
                <Text style={[styles.pillText, { color: colors.label }]}>Cancel</Text>
              </Press>
              {err && <Text style={styles.error}>{err}</Text>}
            </Animated.View>
          ) : (
            <Animated.View key="row" entering={armed ? FADE : undefined}>
              <Press
                onPress={() => {
                  setArmed(true);
                  setConfirming(true);
                }}
                style={[styles.row, styles.rowBetween]}
              >
                <Text style={[styles.rowAction, { color: colors.expense }]}>Delete account</Text>
                <Trash2 size={20} strokeWidth={2} color={colors.expense} />
              </Press>
            </Animated.View>
          )}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// The encryption card — a prominent on/off card (styled like the Safe balance
// card), with the passphrase shown in plain text so it's easy to read, change,
// and save right here. The passphrase is kept only on this device, so the server
// never sees it. When it's "On" but this device hasn't stored the passphrase yet
// (a new device), the same field doubles as the unlock.
function EncryptionCard() {
  const { e2eMode, locked, passphrase, unlock, enableEncryption, disableEncryption } =
    useStore();
  const [pass, setPass] = useState(passphrase ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Once a passphrase is saved we mask it, with an eye to reveal on demand.
  const [reveal, setReveal] = useState(false);
  // The web's `focus:ring-2` — a 2px carrot ring while the field is focused.
  const [focused, setFocused] = useState(false);

  // Keep the field in sync when the stored passphrase changes (unlock / save /
  // turn off), so it always shows the current one.
  useEffect(() => {
    setPass(passphrase ?? "");
  }, [passphrase]);

  const on = e2eMode === "passphrase";

  async function submit() {
    // The web's `required` attribute: an empty field never submits.
    if (!pass) return;
    setBusy(true);
    setErr(null);
    const { error } = locked ? await unlock(pass) : await enableEncryption(pass);
    setBusy(false);
    if (error) setErr(error);
    else if (!locked && !on) posthog.capture("encryption_enabled");
  }

  async function turnOff() {
    setBusy(true);
    setErr(null);
    const { error } = await disableEncryption();
    setBusy(false);
    if (error) setErr(error);
    else posthog.capture("encryption_disabled");
  }

  // A saved-and-unlocked passphrase is the only state we mask (with the eye);
  // while entering or unlocking, the text stays visible so it's easy to type.
  const saved = on && !locked;
  const buttonLabel = busy
    ? "Saving…"
    : locked
      ? "Unlock"
      : on
        ? "Save passphrase"
        : "Turn on encryption";

  return (
    <View style={styles.section}>
      <SectionHeader>Encryption</SectionHeader>
      <View style={[styles.encCard, on ? styles.encOn : styles.encOff]}>
        <View style={styles.encHead}>
          <View
            style={[styles.encBadge, { backgroundColor: on ? colors.income : colors.grouped }]}
          >
            {on ? (
              <ShieldCheck size={20} strokeWidth={2} color={colors.surface} />
            ) : (
              <Lock size={20} strokeWidth={2} color={colors.labelSecondary} />
            )}
          </View>
          <View style={styles.encBody}>
            <Text style={styles.encTitle}>End-to-end encryption</Text>
            <Text
              style={[styles.encStatus, { color: on ? colors.income : colors.labelSecondary }]}
            >
              {on ? (locked ? "On · locked on this device" : "On") : "Off"}
            </Text>
          </View>
        </View>

        {!on && (
          <Text style={styles.encBlurb}>Turn it on so no one else can see your data.</Text>
        )}

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <TextInput
              secureTextEntry={saved && !reveal}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect={false}
              value={pass}
              onChangeText={setPass}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={submit}
              returnKeyType="done"
              placeholder="Passphrase"
              placeholderTextColor={colors.labelSecondary}
              selectionColor={colors.carrot}
              style={[
                styles.input,
                focused && styles.inputFocused,
                saved && { paddingRight: focused ? space(12) - 1 : space(12) },
              ]}
            />
            {saved && (
              <Press
                onPress={() => setReveal((v) => !v)}
                accessibilityLabel={reveal ? "Hide passphrase" : "Show passphrase"}
                style={styles.eye}
              >
                {reveal ? (
                  <EyeOff size={20} strokeWidth={2} color={colors.labelSecondary} />
                ) : (
                  <Eye size={20} strokeWidth={2} color={colors.labelSecondary} />
                )}
              </Press>
            )}
          </View>
          <Press
            onPress={submit}
            disabled={busy}
            disabledOpacity={0.5}
            style={[styles.pill, { backgroundColor: colors.label }]}
          >
            <Text style={[styles.pillText, { color: colors.surface }]}>{buttonLabel}</Text>
          </Press>
        </View>

        {on && !locked && (
          <Press
            onPress={turnOff}
            disabled={busy}
            disabledOpacity={0.5}
            style={[styles.pill, { backgroundColor: withAlpha(colors.expense, 0.1) }]}
          >
            <Text style={[styles.pillText, { color: colors.expense }]}>Turn off encryption</Text>
          </Press>
        )}

        <Text style={styles.encNote}>
          If you forget this passphrase, the data cannot be recovered.
        </Text>
        {err && <Text style={styles.error}>{err}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // section: flex flex-col gap-2
  section: { gap: space(2) },
  // rounded-card bg-surface shadow-card — the shadow lives on this wrapper…
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  // …and overflow-hidden on the inner view, so clipping never eats the shadow.
  clip: { borderRadius: radius.card, overflow: "hidden" },
  // flex items-center gap-4 px-4 py-3.5
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(4),
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
  },
  rowBetween: { justifyContent: "space-between" },
  // divide-y divide-separator — a hairline above every row but the first.
  divide: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  // text-base text-label
  rowLabel: { ...text.base, color: colors.label },
  // truncate text-sm text-label-secondary
  rowValue: { flexShrink: 1, ...text.sm, color: colors.labelSecondary },
  // text-base font-medium
  rowAction: { ...text.base, fontWeight: weight.medium },
  // mt-2 text-center text-xs text-label-secondary
  footer: { marginTop: space(2), textAlign: "center", ...text.xs, color: colors.labelSecondary },
  // flex flex-col gap-3 p-4
  confirm: { gap: space(3), padding: space(4) },
  // text-sm text-label
  confirmText: { ...text.sm, color: colors.label },
  // rounded-pill py-3 text-base font-semibold
  pill: { borderRadius: radius.pill, paddingVertical: space(3), alignItems: "center" },
  pillText: { ...text.base, fontWeight: weight.semibold },
  // px-1 text-sm font-medium text-danger
  error: { paddingHorizontal: space(1), ...text.sm, fontWeight: weight.medium, color: colors.danger },
  // flex flex-col gap-3 rounded-card p-4 shadow-card
  encCard: { gap: space(3), borderRadius: radius.card, padding: space(4) },
  // bg-income/20 ring-1 ring-income/40 (+ shadow-card, layered in one string)
  encOn: {
    backgroundColor: withAlpha(colors.income, 0.2),
    boxShadow: `${shadows.card}, ${shadows.ringIncome40}`,
  },
  encOff: { backgroundColor: colors.surface, boxShadow: shadows.card },
  // flex items-center gap-3
  encHead: { flexDirection: "row", alignItems: "center", gap: space(3) },
  // h-10 w-10 shrink-0 rounded-full
  encBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  encBody: { flex: 1, minWidth: 0 },
  // text-base font-semibold leading-tight text-label
  encTitle: {
    fontSize: 16,
    lineHeight: leading.tight(16),
    fontWeight: weight.semibold,
    color: colors.label,
  },
  // mt-0.5 text-sm font-medium
  encStatus: { marginTop: space(0.5), ...text.sm, fontWeight: weight.medium },
  // text-sm text-label
  encBlurb: { ...text.sm, color: colors.label },
  // form: flex flex-col gap-2
  form: { gap: space(2) },
  inputWrap: { position: "relative" },
  // w-full rounded-pill border border-separator bg-surface px-4 py-3 text-base text-label
  // — 24px line + 12px padding + 1px border each side = 50 tall.
  input: {
    width: "100%",
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    paddingVertical: 0,
    fontSize: 16,
    color: colors.label,
    textAlignVertical: "center",
  },
  // focus:ring-2 ring-carrot/40 — 2px ring; padding gives back the extra pixel.
  inputFocused: {
    borderWidth: 2,
    borderColor: "rgba(245,99,0,0.4)",
    paddingHorizontal: space(4) - 1,
  },
  // absolute inset-y-0 right-0 flex items-center px-3.5
  eye: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: space(3.5),
  },
  // px-1 text-xs text-label-secondary
  encNote: { paddingHorizontal: space(1), ...text.xs, color: colors.labelSecondary },
});
