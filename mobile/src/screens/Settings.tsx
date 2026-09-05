import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
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
import { colors, radius, shadowCard, withAlpha } from "@/lib/theme";

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
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" });
      }
      posthog.capture("csv_exported", { row_count: transactions.length });
    } catch {
      // Share sheet dismissed or storage unavailable — nothing to report.
    }
  }

  return (
    <Screen gap={24}>
      <NavHeader title="Settings" onBack={() => navigate("/")} />

      {/* ACCOUNT */}
      <View style={styles.section}>
        <SectionHeader>Account</SectionHeader>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowDivider]}>
            <Text style={styles.rowLabel}>Signed in</Text>
            <Text style={styles.rowValue} numberOfLines={1}>
              {email || "—"}
            </Text>
          </View>
          <Press onPress={signOut} style={styles.row}>
            <Text style={[styles.rowAction, { color: colors.expense }]}>Sign out</Text>
          </Press>
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

      {/* DANGER ZONE */}
      <DeleteAccountCard />

      <Text style={styles.footer}>That's all, folks. 🥕</Text>
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
      <View style={styles.card}>
        {confirming ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>
              This permanently deletes your account and all your data. This can't be undone.
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
          </View>
        ) : (
          <Press onPress={() => setConfirming(true)} style={[styles.row, styles.rowBetween]}>
            <Text style={[styles.rowAction, { color: colors.expense }]}>Delete account</Text>
            <Trash2 size={20} strokeWidth={2} color={colors.expense} />
          </Press>
        )}
      </View>
    </View>
  );
}

// The encryption card — a prominent on/off card (styled like the Safe balance
// card), with the passphrase shown in plain text so it's easy to read, change,
// and save right here. The passphrase is kept only on this device, so the server
// never sees it. When it's "On" but this device hasn't stored the passphrase yet
// (a new device), the same field doubles as the unlock.
function EncryptionCard() {
  const { e2eMode, locked, passphrase, unlock, enableEncryption, disableEncryption } = useStore();
  const [pass, setPass] = useState(passphrase ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // Once a passphrase is saved we mask it, with an eye to reveal on demand.
  const [reveal, setReveal] = useState(false);

  // Keep the field in sync when the stored passphrase changes (unlock / save /
  // turn off), so it always shows the current one.
  useEffect(() => {
    setPass(passphrase ?? "");
  }, [passphrase]);

  const on = e2eMode === "passphrase";

  async function submit() {
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
          <View style={[styles.encBadge, { backgroundColor: on ? colors.income : colors.grouped }]}>
            {on ? (
              <ShieldCheck size={20} strokeWidth={2} color={colors.surface} />
            ) : (
              <Lock size={20} strokeWidth={2} color={colors.labelSecondary} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.encTitle}>End-to-end encryption</Text>
            <Text style={[styles.encStatus, { color: on ? colors.income : colors.labelSecondary }]}>
              {on ? (locked ? "On · locked on this device" : "On") : "Off"}
            </Text>
          </View>
        </View>

        {!on && <Text style={styles.encBlurb}>Turn it on so no one else can see your data.</Text>}

        <View style={{ gap: 8 }}>
          <View style={{ position: "relative" }}>
            <TextInput
              secureTextEntry={saved && !reveal}
              autoCapitalize="none"
              autoCorrect={false}
              value={pass}
              onChangeText={setPass}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Passphrase"
              placeholderTextColor={colors.labelSecondary}
              onSubmitEditing={submit}
              style={[styles.input, focused && styles.inputFocused, saved && { paddingRight: 48 }]}
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

        <Text style={styles.encNote}>If you forget this passphrase, the data cannot be recovered.</Text>
        {err && <Text style={styles.error}>{err}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  card: {
    overflow: "hidden",
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    ...shadowCard,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBetween: { justifyContent: "space-between" },
  rowDivider: {
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowLabel: { fontSize: 16, lineHeight: 24, color: colors.label },
  rowValue: { flexShrink: 1, fontSize: 14, lineHeight: 20, color: colors.labelSecondary },
  rowAction: { fontSize: 16, lineHeight: 24, fontWeight: "500" },
  footer: { marginTop: 8, textAlign: "center", fontSize: 12, lineHeight: 16, color: colors.labelSecondary },
  confirm: { gap: 12, padding: 16 },
  confirmText: { fontSize: 14, lineHeight: 20, color: colors.label },
  pill: { borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  pillText: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  error: { paddingHorizontal: 4, fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.danger },
  encCard: { gap: 12, borderRadius: radius.card, padding: 16, ...shadowCard },
  encOn: {
    backgroundColor: withAlpha(colors.income, 0.2),
    borderWidth: 1,
    borderColor: withAlpha(colors.income, 0.4),
  },
  encOff: { backgroundColor: colors.surface },
  encHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  encBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  encTitle: { fontSize: 16, lineHeight: 20, fontWeight: "600", color: colors.label },
  encStatus: { marginTop: 2, fontSize: 14, lineHeight: 20, fontWeight: "500" },
  encBlurb: { fontSize: 14, lineHeight: 20, color: colors.label },
  encNote: { paddingHorizontal: 4, fontSize: 12, lineHeight: 16, color: colors.labelSecondary },
  input: {
    width: "100%",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.label,
  },
  inputFocused: { borderWidth: 2, borderColor: "rgba(245,99,0,0.4)", paddingHorizontal: 15, paddingVertical: 11 },
  eye: { position: "absolute", right: 0, top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 14 },
});
