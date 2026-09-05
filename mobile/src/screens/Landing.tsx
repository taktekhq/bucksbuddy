import { useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from "react-native-reanimated";
import { ArrowDownUp, ArrowLeft, Lock, Vault } from "lucide-react-native";
import { Carrot } from "@/components/ui/Carrot";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { navigate } from "@/lib/router";
import { signInWithGoogle as openGoogleSignIn } from "@/lib/oauth";
import { supabase } from "@/lib/supabase";
import {
  colors,
  display,
  leading,
  motion,
  radius,
  shadows,
  space,
  text,
  weight,
} from "@/lib/theme";

// The public marketing landing page — succinct and on-brand: the static carrot
// mascot, the Grobold wordmark, a cheeky tagline, three feature cards, and a big
// "Continue with Google" call-to-action. It's the entry point for signed-out
// visitors (route "/") and owns the Google + email sign-in flows.
//
// Hidden email sign-in: tapping the carrot mascot this many times swaps the page
// for a plain email/password form — for friends without a Google account whose
// accounts we create by hand in Supabase. It's a *separate flow* shown in place,
// and nothing about it touches the route, so it stays out of the way.
const TAPS_TO_REVEAL = 7;

// Three selling points, each its own white card. All carrot-tinted: carrot is
// the one chromatic accent in the chrome (green/red are reserved for real money).
const FEATURES = [
  {
    icon: ArrowDownUp,
    title: "Income & expenses",
    body: "Log every buck in and out.",
  },
  {
    icon: Vault,
    title: "Your private safe",
    body: "Tuck savings away, cash or gold.",
  },
  {
    icon: Lock,
    title: "End-to-end encryption",
    body: "Enable so only you can read your data.",
  },
];

export function Landing() {
  // Disables the button and shows "Redirecting…" while we leave for Google
  // (or "Signing in…" during a password sign-in).
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden password sign-in: count carrot taps, then swap in the form. The count
  // lives in a ref since it shouldn't re-render on its own — only crossing the
  // threshold flips showEmail.
  const taps = useRef(0);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function tapCarrot() {
    // Only the landing-mode carrot is tappable; once the email flow shows, this
    // trigger is gone, so no need to guard against re-taps.
    taps.current += 1;
    if (taps.current >= TAPS_TO_REVEAL) setShowEmail(true);
  }

  function backToLanding() {
    Keyboard.dismiss();
    taps.current = 0;
    setShowEmail(false);
    setError(null);
  }

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const { error: oauthError } = await openGoogleSignIn();

    // On success the onAuthStateChange listener in useSession swaps App over to
    // the app. We only stay here if the sign-in failed — or, unlike the web's
    // page redirect, if the auth sheet was dismissed, so loading is always
    // released.
    if (oauthError) setError(oauthError);
    setLoading(false);
  }

  async function signInWithPassword() {
    // The web form's `required` inputs: an empty field never submits; the
    // disabled submit button also blocks a second Enter mid-flight.
    if (loading) return;
    if (!email.trim()) return emailRef.current?.focus();
    if (!password) return passwordRef.current?.focus();
    Keyboard.dismiss();
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

  // The two flows are siblings that crossfade (220ms) rather than a hard swap:
  // each root is full-bleed, so the outgoing page fades out over the incoming
  // one without either shifting.
  return (
    <LayoutAnimationConfig skipEntering>
    <View style={styles.root}>
      {showEmail ? (
        // The hidden email/password sign-in — a separate flow shown in place of
        // the marketing page once the carrot's been tapped enough.
        <Animated.View
          key="email"
          style={StyleSheet.absoluteFill}
          entering={FadeIn.duration(motion.pop)}
          exiting={FadeOut.duration(motion.pop)}
        >
          <Screen center paddingX={space(6)} paddingTop={0} paddingBottom={0} gap={0}>
            <View style={styles.centered}>
              <Carrot size={60} />
              <Text style={styles.emailH1}>Bucks{"\n"}Buddy</Text>
              <Text style={styles.emailSub}>Sign in with email</Text>
            </View>

            <View style={styles.form}>
              <TextInput
                keyboardType="email-address"
                inputMode="email"
                autoComplete="email"
                textContentType="emailAddress"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => passwordRef.current?.focus()}
                ref={emailRef}
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
                returnKeyType="go"
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={signInWithPassword}
                placeholder="Password"
                placeholderTextColor={colors.labelMuted}
                style={styles.input}
              />
              <Press
                onPress={signInWithPassword}
                disabled={loading}
                disabledOpacity={0.5}
                style={styles.submit}
              >
                <Text style={styles.submitText}>{loading ? "Signing in…" : "Sign in"}</Text>
              </Press>
              {error && <Text style={[styles.error, styles.errorInset]}>{error}</Text>}
            </View>

            <Press onPress={backToLanding} style={styles.backLink}>
              <ArrowLeft size={16} strokeWidth={2.5} color={colors.carrot} />
              <Text style={styles.backText}>Back</Text>
            </Press>
          </Screen>
        </Animated.View>
      ) : (
        <Animated.View
          key="landing"
          style={StyleSheet.absoluteFill}
          entering={FadeIn.duration(motion.pop)}
          exiting={FadeOut.duration(motion.pop)}
        >
          <Screen paddingX={space(5)} paddingTop={32} paddingBottom={32} gap={0}>
            {/* Top spacer is larger than the bottom one so the whole stack sits a
                little below centre, rather than dead-centred. */}
            <View style={styles.spacerTop} />

            {/* Hero — the carrot doubles as the hidden email-flow trigger. */}
            <View style={styles.centered}>
              <Press noScale onPress={tapCarrot} accessibilityLabel="carrot">
                <Carrot size={60} />
              </Press>
              <Text style={styles.h1}>Bucks{"\n"}Buddy</Text>
              <Text style={styles.tagline}>For wabbits with bad habits.</Text>
              <Text style={styles.blurb}>On-the-go money journal for your spending.</Text>
            </View>

            {/* Feature cards */}
            <View style={styles.features}>
              <SectionHeader style={styles.featuresTitle}>Features</SectionHeader>
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <View key={title} style={styles.feature}>
                  <View style={styles.featureBadge}>
                    <Icon size={20} strokeWidth={2} color={colors.carrotDark} />
                  </View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>{title}</Text>
                    <Text style={styles.featureBody}>{body}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Primary call-to-action. */}
            <View style={styles.cta}>
              <Text style={styles.free}>Free. No ads. 🥕</Text>
              {/* Custom (carrot) Google button. Per Google's custom-button rules this
                  is allowed as long as the official four-colour "G" sits on a
                  contrasting background — hence the white chip — the font is a clean
                  sans-serif, and the label is one of the sanctioned strings. */}
              <Press
                onPress={signInWithGoogle}
                disabled={loading}
                disabledOpacity={0.5}
                style={styles.google}
              >
                <View style={styles.googleChip}>
                  <GoogleIcon size={16} />
                </View>
                <Text style={styles.submitText}>
                  {loading ? "Redirecting…" : "Continue with Google"}
                </Text>
              </Press>
              {error && <Text style={styles.error}>{error}</Text>}
              {/* Full-width like the sign-in button so it's an easy mobile target;
                  a white fill stands out from the grey canvas while the dark text
                  keeps it legible and clearly secondary to the carrot CTA. */}
              <Press onPress={() => navigate("/legal")} style={styles.secondary}>
                <Text style={styles.secondaryText}>Privacy and Terms</Text>
              </Press>
              {/* The community half of the Stats page is public — let visitors peek
                  at what the warren is up to before signing in. */}
              <Press onPress={() => navigate("/stats")} style={styles.secondary}>
                <Text style={styles.secondaryText}>Community stats</Text>
              </Press>
            </View>

            <View style={styles.spacerBottom} />
          </Screen>
        </Animated.View>
      )}
    </View>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  spacerTop: { flex: 2 },
  spacerBottom: { flex: 1 },
  centered: { alignItems: "center" },

  // --- Hero ---
  // mt-5 font-display text-5xl uppercase leading-[0.95] text-label-muted
  h1: {
    ...display,
    marginTop: space(5),
    fontSize: text["5xl"].fontSize,
    lineHeight: text["5xl"].fontSize * 0.95,
    textAlign: "center",
    color: colors.labelMuted,
  },
  // mt-5 text-2xl font-bold text-label
  tagline: {
    ...text["2xl"],
    marginTop: space(5),
    fontWeight: weight.bold,
    textAlign: "center",
    color: colors.label,
  },
  // mt-2 text-base leading-relaxed text-label-secondary
  blurb: {
    marginTop: space(2),
    fontSize: text.base.fontSize,
    lineHeight: leading.relaxed(text.base.fontSize),
    textAlign: "center",
    color: colors.labelSecondary,
  },

  // --- Feature cards ---
  features: { marginTop: space(9), gap: space(2.5) },
  featuresTitle: { marginBottom: space(1) },
  // flex items-center gap-3.5 rounded-card bg-surface p-4 shadow-card
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3.5),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space(4),
    boxShadow: shadows.card,
  },
  // h-11 w-11 shrink-0 rounded-full bg-carrot-soft
  featureBadge: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.carrotSoft,
  },
  featureCopy: { flex: 1 },
  featureTitle: { ...text.base, fontWeight: weight.semibold, color: colors.label },
  featureBody: {
    fontSize: text.sm.fontSize,
    lineHeight: leading.snug(text.sm.fontSize),
    color: colors.labelSecondary,
  },

  // --- Call to action ---
  cta: { marginTop: space(9), alignItems: "center", gap: space(3) },
  free: { ...text.sm, color: colors.labelSecondary },
  // flex w-full items-center justify-center gap-3 rounded-pill bg-carrot py-3.5
  google: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(3),
    borderRadius: radius.pill,
    backgroundColor: colors.carrot,
    paddingVertical: space(3.5),
  },
  // h-7 w-7 rounded-full bg-white
  googleChip: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  // text-sm font-medium text-danger
  error: { ...text.sm, fontWeight: weight.medium, color: colors.danger },
  // w-full rounded-pill bg-surface py-3.5 text-base font-semibold text-label-muted
  secondary: {
    width: "100%",
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingVertical: space(3.5),
  },
  secondaryText: { ...text.base, fontWeight: weight.semibold, color: colors.labelMuted },

  // --- Email flow ---
  // mt-4 font-display text-3xl uppercase leading-none text-label-muted
  emailH1: {
    ...display,
    marginTop: space(4),
    fontSize: text["3xl"].fontSize,
    lineHeight: leading.none(text["3xl"].fontSize),
    textAlign: "center",
    color: colors.labelMuted,
  },
  emailSub: { ...text.base, marginTop: space(1), color: colors.labelSecondary },
  // mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card
  form: {
    marginTop: space(8),
    gap: space(3),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space(5),
    boxShadow: shadows.card,
  },
  // rounded-pill bg-grouped px-4 py-3.5 text-lg text-label — the web's box is
  // 28px line + 14px padding each side; a fixed height keeps both platforms'
  // TextInput at that exact 56 without Android's built-in padding creeping in.
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
  errorInset: { paddingHorizontal: space(1) },
  // mt-5 flex items-center justify-center gap-1.5 text-base font-semibold text-carrot
  backLink: {
    marginTop: space(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
  },
  backText: { ...text.base, fontWeight: weight.semibold, color: colors.carrot },
});
