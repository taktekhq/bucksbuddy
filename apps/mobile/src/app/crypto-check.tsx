import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { type CryptoDiagnostics, runCryptoDiagnostics } from "@/lib/nativeCrypto";

// A single, greppable line for whatever drives this screen without a human
// tapping the button — a CI step that deep-links to bucksbuddy://crypto-check
// on a booted simulator and reads the device log, or a script doing the same
// against a physical device. Deliberately plain text, not JSON: `simctl log
// stream --predicate` matches on message content, and a stable prefix is all
// that's needed.
function logResult(passed: boolean, detail: string): void {
  console.log(`[crypto-check] CRYPTO_CHECK_RESULT=${passed ? "PASS" : "FAIL"} ${detail}`);
}

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "passed"; result: CryptoDiagnostics }
  | { status: "failed"; message: string };

function ResultRow({ label, passed }: { label: string; passed: boolean }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text
        accessibilityLabel={`${label}: ${passed ? "passed" : "failed"}`}
        style={passed ? styles.passed : styles.failed}
      >
        {passed ? "PASS" : "FAIL"}
      </Text>
    </View>
  );
}

export default function CryptoCheckScreen() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    setState({ status: "running" });
    try {
      const result = await runCryptoDiagnostics();
      const passed =
        result.defaultVector &&
        result.passphraseVector &&
        result.verifierVector &&
        result.nativeRoundTrip;
      logResult(passed, JSON.stringify(result));
      setState(
        passed
          ? { status: "passed", result }
          : { status: "failed", message: "A compatibility assertion failed." },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown native crypto error";
      logResult(false, message);
      setState({ status: "failed", message });
    }
  }

  // Runs itself once on mount so a script driving the screen (a CI step
  // deep-linking to this route on a booted simulator, say) doesn't also have
  // to simulate a tap — it can just launch, wait for the log line above, and
  // read the verdict. The button stays for manual re-runs.
  useEffect(() => {
    void run();
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Crypto gate</Text>
        <Text style={styles.copy}>
          Runs the browser&apos;s frozen AES-GCM and PBKDF2 envelopes through the
          native provider. Values must stay masked unless every assertion passes.
        </Text>

        {state.status === "passed" ? (
          <View accessibilityLiveRegion="polite" style={styles.card}>
            <ResultRow label="Default vault" passed={state.result.defaultVector} />
            <ResultRow label="Passphrase vault" passed={state.result.passphraseVector} />
            <ResultRow label="Verifier" passed={state.result.verifierVector} />
            <ResultRow label="Native round-trip" passed={state.result.nativeRoundTrip} />
            <Text style={styles.benchmark}>
              PBKDF2 600k: {Math.round(state.result.pbkdf2Ms)} ms
            </Text>
          </View>
        ) : null}

        {state.status === "failed" ? (
          <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={state.status === "running"}
          onPress={() => void run()}
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
        >
          <Text style={styles.buttonText}>
            {state.status === "running" ? "Running…" : "Run native crypto check"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F2F2F7" },
  content: { flexGrow: 1, gap: 18, padding: 24, justifyContent: "center" },
  title: { fontSize: 34, fontWeight: "800", color: "#111111" },
  copy: { color: "#6C6C70", fontSize: 16, lineHeight: 23 },
  card: { gap: 12, padding: 18, borderRadius: 16, backgroundColor: "#FFFFFF" },
  resultRow: { flexDirection: "row", justifyContent: "space-between" },
  resultLabel: { color: "#111111", fontSize: 16 },
  passed: { color: "#1FB85A", fontWeight: "800" },
  failed: { color: "#FF3B30", fontWeight: "800" },
  benchmark: { marginTop: 6, color: "#6C6C70", fontVariant: ["tabular-nums"] },
  error: { color: "#FF3B30", lineHeight: 21 },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#111111",
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
});
