import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowDownUp, ArrowLeft, Lock, Vault } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { Carrot } from "@/components/ui/Carrot";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { navigate } from "@/lib/router";
import { supabase } from "@/lib/supabase";
import { signInWithGoogle } from "@/lib/oauth";
import { colors, display, radius, shadowCard } from "@/lib/theme";

// The public marketing landing page — succinct and on-brand: the static carrot
// mascot, the Grobold wordmark, a cheeky tagline, three feature cards, and a big
// "Continue with Google" call-to-action. It's the entry point for signed-out
// visitors (route "/") and owns the Google + email sign-in flows.
//
// Hidden email sign-in: tapping the carrot mascot this many times swaps the page
// for a plain email/password form — for friends without a Google account whose
// accounts we create by hand in Supabase.
const TAPS_TO_REVEAL = 7;

// Three selling points, each its own white card. All carrot-tinted: carrot is
// the one chromatic accent in the chrome (green/red are reserved for real money).
const FEATURES = [
  { icon: ArrowDownUp, title: "Income & expenses", body: "Log every buck in and out." },
  { icon: Vault, title: "Your private safe", body: "Tuck savings away, cash or gold." },
  { icon: Lock, title: "End-to-end encryption", body: "Enable so only you can read your data." },
];

export function Landing() {
  // Disables the button and shows "Redirecting…" while we leave for Google
  // (or "Signing in…" during a password sign-in).
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden password sign-in: count carrot taps, then swap in the form.
  const taps = useRef(0);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function tapCarrot() {
    taps.current += 1;
    if (taps.current >= TAPS_TO_REVEAL) setShowEmail(true);
  }

  function backToLanding() {
    taps.current = 0;
    setShowEmail(false);
    setError(null);
  }

  async function google() {
    setLoading(true);
    setError(null);
    const { error: oauthError } = await signInWithGoogle();
    // On success the onAuthStateChange listener in useSession swaps App over
    // to the app. We only stay here if the sign-in didn't complete.
    if (oauthError) setError(oauthError);
    setLoading(false);
  }

  async function signInWithPassword() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    const { error: pwError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (pwError) {
      setError(pwError.message);
      setLoading(false);
    }
  }

  // The hidden email/password sign-in — a separate flow shown in place of the
  // marketing page once the carrot's been tapped enough.
  if (showEmail) {
    return (
      <Screen center paddingX={24} gap={0}>
        <View style={styles.centered}>
          <Carrot size={60} />
          <Text style={[styles.h1, styles.h1Small]}>Bucks{"\n"}Buddy</Text>
          <Text style={styles.subtitle}>Sign in with email</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.labelMuted}
            style={styles.input}
          />
          <TextInput
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.labelMuted}
            onSubmitEditing={signInWithPassword}
            style={styles.input}
          />
          <Press
            onPress={signInWithPassword}
            disabled={loading}
            disabledOpacity={0.5}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>{loading ? "Signing in…" : "Sign in"}</Text>
          </Press>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>

        <Press onPress={backToLanding} style={styles.backLink}>
          <ArrowLeft size={16} strokeWidth={2.5} color={colors.carrot} />
          <Text style={styles.backText}>Back</Text>
        </Press>
      </Screen>
    );
  }

  return (
    <Screen paddingX={20} paddingTop={32} paddingBottom={32} gap={0}>
      {/* Top spacer is larger than the bottom one so the whole stack sits a
          little below centre, rather than dead-centred. */}
      <View style={{ flex: 2 }} />

      {/* Hero — the carrot doubles as the hidden email-flow trigger. */}
      <View style={styles.centered}>
        <Press onPress={tapCarrot} accessibilityLabel="carrot">
          <Carrot size={60} />
        </Press>
        <Text style={[styles.h1, styles.h1Big]}>Bucks{"\n"}Buddy</Text>
        <Text style={styles.tagline}>For wabbits with bad habits.</Text>
        <Text style={styles.blurb}>On-the-go money journal for your spending.</Text>
      </View>

      {/* Feature cards */}
      <View style={styles.features}>
        <SectionHeader style={{ marginBottom: 4 }}>Features</SectionHeader>
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <View key={title} style={styles.feature}>
            <View style={styles.featureBadge}>
              <Icon size={20} strokeWidth={2} color={colors.carrotDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{title}</Text>
              <Text style={styles.featureBody}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Primary call-to-action. */}
      <View style={styles.cta}>
        <Text style={styles.free}>Free. No ads. 🥕</Text>
        {/* Custom (carrot) Google button: the official four-colour "G" sits on
            a contrasting white chip, sans-serif label, sanctioned string. */}
        <Press onPress={google} disabled={loading} disabledOpacity={0.5} style={styles.primary}>
          <View style={styles.googleChip}>
            <GoogleIcon size={16} />
          </View>
          <Text style={styles.primaryText}>{loading ? "Redirecting…" : "Continue with Google"}</Text>
        </Press>
        {error && <Text style={styles.error}>{error}</Text>}
        {/* Full-width like the sign-in button so it's an easy target; a white
            fill stands out from the grey canvas while staying secondary. */}
        <Press onPress={() => navigate("/legal")} style={styles.secondary}>
          <Text style={styles.secondaryText}>Privacy and Terms</Text>
        </Press>
        {/* The community half of the Stats page is public. */}
        <Press onPress={() => navigate("/stats")} style={styles.secondary}>
          <Text style={styles.secondaryText}>Community stats</Text>
        </Press>
      </View>

      <View style={{ flex: 1 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center" },
  h1: { ...display, textAlign: "center", color: colors.labelMuted },
  h1Small: { marginTop: 16, fontSize: 30, lineHeight: 30 },
  h1Big: { marginTop: 20, fontSize: 48, lineHeight: 46 },
  subtitle: { marginTop: 4, fontSize: 16, lineHeight: 24, color: colors.labelSecondary },
  tagline: {
    marginTop: 20,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    color: colors.label,
    textAlign: "center",
  },
  blurb: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 26,
    color: colors.labelSecondary,
    textAlign: "center",
  },
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
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.carrot,
    paddingVertical: 14,
  },
  primaryText: { fontSize: 18, lineHeight: 28, fontWeight: "600", color: "#FFF" },
  googleChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  error: { paddingHorizontal: 4, fontSize: 14, lineHeight: 20, fontWeight: "500", color: colors.danger },
  backLink: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  backText: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.carrot },
  features: { marginTop: 36, gap: 10 },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: 16,
    ...shadowCard,
  },
  featureBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.carrotSoft,
  },
  featureTitle: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.label },
  featureBody: { fontSize: 14, lineHeight: 18, color: colors.labelSecondary },
  cta: { marginTop: 36, alignItems: "center", gap: 12 },
  free: { fontSize: 14, lineHeight: 20, color: colors.labelSecondary },
  secondary: {
    width: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: colors.labelMuted },
});
