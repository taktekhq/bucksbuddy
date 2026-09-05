import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  ChevronLeft,
  Download,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Trash2,
} from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { RateEditor } from "@/components/RateEditor";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { transactionsToCsv } from "@/lib/csv";
import { useStore } from "@/lib/store";
import posthog from "@/lib/posthog";
import { colors } from "@/lib/theme";

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
    // <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4
    //   pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
    // `mx-auto max-w-md` and the safe-area halves of the padding are Screen's.
    <Screen className="flex min-h-full flex-col gap-6 px-4 pb-8 pt-4">
      {/* Plain iOS nav: back chevron + centered title. */}
      <View className="relative flex flex-row items-center justify-center py-1">
        <Press
          onPress={() => navigate("/")}
          accessibilityLabel="Back"
          className="absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft size={24} strokeWidth={2.5} color={colors.carrot} />
        </Press>
        <Text className="font-display text-base font-bold uppercase text-label-muted">
          Settings
        </Text>
      </View>

      {/* ACCOUNT */}
      <View className="flex flex-col gap-2">
        <SectionHeader>Account</SectionHeader>
        {/* `divide-y divide-separator` isn't supported (PORTING.md §4): every
            row after the first carries `border-t border-separator` instead.
            `overflow-hidden` in the same string clips the card's own shadow
            away on native, so the shadow stays out here and the clip moves to
            the inner view with the same rounding. */}
        <View className="rounded-card bg-surface shadow-card">
          <View className="overflow-hidden rounded-card">
            <View className="flex flex-row items-center justify-between gap-4 px-4 py-3.5">
              <Text className="text-base text-label">Signed in</Text>
              <Text className="truncate text-sm text-label-secondary" numberOfLines={1}>
                {email || "—"}
              </Text>
            </View>
            <Press
              onPress={signOut}
              className="flex w-full flex-row items-center px-4 py-3.5 text-base font-medium text-expense border-t border-separator"
            >
              <Text className="text-base font-medium text-expense">Sign out</Text>
            </Press>
          </View>
        </View>
      </View>

      {/* PRIVACY / ENCRYPTION */}
      <EncryptionCard />

      {/* EXCHANGE RATE */}
      <View className="flex flex-col gap-2">
        <SectionHeader>Exchange rate</SectionHeader>
        <RateEditor />
      </View>

      {/* DATA */}
      <View className="flex flex-col gap-2">
        <SectionHeader>Data</SectionHeader>
        <View className="rounded-card bg-surface shadow-card">
          <View className="overflow-hidden rounded-card">
            <Press
              onPress={exportCsv}
              disabled={locked}
              className="flex w-full flex-row items-center justify-between px-4 py-3.5 text-base font-medium text-label disabled:opacity-50"
            >
              <Text className="text-base font-medium text-label">Export CSV</Text>
              <Download size={20} strokeWidth={2} color={colors.labelSecondary} />
            </Press>
          </View>
        </View>
      </View>

      {/* DANGER ZONE */}
      <DeleteAccountCard />

      <Text className="mt-2 text-center text-xs text-label-secondary">
        That's all, folks. 🥕
      </Text>
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
    <View className="flex flex-col gap-2">
      <SectionHeader>Danger zone</SectionHeader>
      {/* The shadow rides the wrapper; `overflow-hidden` clips on the inside. */}
      <View className="rounded-card bg-surface shadow-card">
        <View className="overflow-hidden rounded-card">
          {confirming ? (
            <View className="flex flex-col gap-3 p-4">
              <Text className="text-sm text-label">
                This permanently deletes your account and all your data. This
                can't be undone.
              </Text>
              <Press
                onPress={remove}
                disabled={busy}
                className="rounded-pill bg-expense py-3 text-base font-semibold text-surface transition disabled:opacity-50"
              >
                <Text className="w-full text-center text-base font-semibold text-surface">
                  {busy ? "Deleting…" : "Delete everything"}
                </Text>
              </Press>
              <Press
                onPress={() => {
                  setConfirming(false);
                  setErr(null);
                }}
                disabled={busy}
                className="rounded-pill bg-grouped py-3 text-base font-semibold text-label transition disabled:opacity-50"
              >
                <Text className="w-full text-center text-base font-semibold text-label">
                  Cancel
                </Text>
              </Press>
              {err && <Text className="px-1 text-sm font-medium text-danger">{err}</Text>}
            </View>
          ) : (
            <Press
              onPress={() => setConfirming(true)}
              className="flex w-full flex-row items-center justify-between px-4 py-3.5 text-base font-medium text-expense"
            >
              <Text className="text-base font-medium text-expense">Delete account</Text>
              <Trash2 size={20} strokeWidth={2} color={colors.expense} />
            </Press>
          )}
        </View>
      </View>
    </View>
  );
}

// `outline-none` is browser-only and dropped (PORTING.md §4); everything else
// comes over as-is.
const inputClass =
  "w-full rounded-pill border border-separator bg-surface px-4 py-3 text-base text-label ring-carrot/40 transition focus:ring-2 placeholder:text-label-secondary";

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
    <View className="flex flex-col gap-2">
      <SectionHeader>Encryption</SectionHeader>
      <View
        className={`flex flex-col gap-3 rounded-card p-4 shadow-card ${
          on ? "bg-income/20 ring-1 ring-income/40" : "bg-surface"
        }`}
      >
        <View className="flex flex-row items-center gap-3">
          <View
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              on ? "bg-income text-surface" : "bg-grouped text-label-secondary"
            }`}
          >
            {on ? (
              <ShieldCheck size={20} strokeWidth={2} color={colors.surface} />
            ) : (
              <Lock size={20} strokeWidth={2} color={colors.labelSecondary} />
            )}
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold leading-tight text-label">
              End-to-end encryption
            </Text>
            <Text
              className={`mt-0.5 text-sm font-medium ${
                on ? "text-income" : "text-label-secondary"
              }`}
            >
              {on ? (locked ? "On · locked on this device" : "On") : "Off"}
            </Text>
          </View>
        </View>

        {!on && (
          <Text className="text-sm text-label">
            Turn it on so no one else can see your data.
          </Text>
        )}

        {/* <form onSubmit={submit}> — no element on native; the keyboard's
            return key and the button below both call the handler. */}
        <View className="flex flex-col gap-2">
          <View className="relative">
            <TextInput
              secureTextEntry={saved && !reveal}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect={false}
              value={pass}
              onChangeText={setPass}
              onSubmitEditing={submit}
              returnKeyType="done"
              placeholder="Passphrase"
              selectionColor={colors.carrot}
              className={`${inputClass} ${saved ? "pr-12" : ""}`}
            />
            {saved && (
              <Press
                onPress={() => setReveal((v) => !v)}
                accessibilityLabel={reveal ? "Hide passphrase" : "Show passphrase"}
                className="absolute inset-y-0 right-0 flex flex-row items-center px-3.5 text-label-secondary"
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
            className="rounded-pill bg-label py-3 text-base font-semibold text-surface transition disabled:opacity-50"
          >
            <Text className="w-full text-center text-base font-semibold text-surface">
              {buttonLabel}
            </Text>
          </Press>
        </View>

        {on && !locked && (
          <Press
            onPress={turnOff}
            disabled={busy}
            className="rounded-pill bg-expense/10 py-3 text-base font-semibold text-expense transition disabled:opacity-50"
          >
            <Text className="w-full text-center text-base font-semibold text-expense">
              Turn off encryption
            </Text>
          </Press>
        )}

        <Text className="px-1 text-xs text-label-secondary">
          If you forget this passphrase, the data cannot be recovered.
        </Text>
        {err && <Text className="px-1 text-sm font-medium text-danger">{err}</Text>}
      </View>
    </View>
  );
}
