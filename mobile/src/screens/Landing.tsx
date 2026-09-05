import { useRef, useState } from "react";
import { Keyboard, Text, TextInput, View } from "react-native";
import { Input } from "@/components/ui/Input";
import { ArrowDownUp, ArrowLeft, Lock, Vault } from "lucide-react-native";
import { Carrot } from "@/components/ui/Carrot";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { navigate } from "@/lib/router";
import { signInWithGoogle as openGoogleSignIn } from "@/lib/oauth";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

// The public marketing landing page — succinct and on-brand: the static carrot
// mascot, the Grobold wordmark, a cheeky tagline, three feature cards, and a big
// "Continue with Google" call-to-action. It's the entry point for signed-out
// visitors (route "/") and owns the Google + email sign-in flows.
//
// Hidden email sign-in: tapping the carrot mascot this many times swaps the page
// for a plain email/password form — for friends without a Google account whose
// accounts we create by hand in Supabase. It's a *separate flow* shown in place,
// and nothing about it touches the route, so it stays out of the way.
//
// The class names are the web's. Where a string ends in `flex-row`, that's the
// one native addition: `flex` means `flex-direction: row` in a browser but
// React Native's default is column, so a web row needs it spelled out.
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
    // The web's `<form>` does this for us: `required` blocks a submit with an
    // empty field, and the disabled submit button blocks a second Enter while
    // one is already in flight.
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

  // The hidden email/password sign-in — a separate flow shown in place of the
  // marketing page once the carrot's been tapped enough.
  if (showEmail) {
    return (
      <Screen className="flex flex-col justify-center px-6">
        <View className="flex flex-col items-center">
          <Carrot size={60} />
          <Text className="mt-4 text-center font-display text-3xl font-bold uppercase leading-none text-label-muted">
            Bucks{"\n"}Buddy
          </Text>
          <Text className="mt-1 text-base text-label-secondary">Sign in with email</Text>
        </View>

        {/* The web's <form onSubmit>: no element here — the submit button and
            the password field's return key both call the handler. */}
        <View className="mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
          <Input
            ref={emailRef}
            inputMode="email"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            className="rounded-pill bg-grouped px-4 py-3.5 text-[18px] text-label placeholder:text-label-muted"
          />
          <Input
            ref={passwordRef}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={signInWithPassword}
            placeholder="Password"
            className="rounded-pill bg-grouped px-4 py-3.5 text-[18px] text-label placeholder:text-label-muted"
          />
          <Press
            onPress={signInWithPassword}
            disabled={loading}
            className="rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white transition disabled:opacity-50"
          >
            <Text className="text-center text-lg font-semibold text-white">
              {loading ? "Signing in…" : "Sign in"}
            </Text>
          </Press>
          {error && <Text className="px-1 text-sm font-medium text-danger">{error}</Text>}
        </View>

        <Press
          onPress={backToLanding}
          className="mt-5 flex items-center justify-center gap-1.5 text-base font-semibold text-carrot flex-row"
        >
          <ArrowLeft size={16} strokeWidth={2.5} color={colors.carrot} />
          <Text className="text-base font-semibold text-carrot">Back</Text>
        </Press>
      </Screen>
    );
  }

  return (
    // pb/pt: the web's `calc(2rem + var(--safe-*))` — 2rem of padding, with the
    // safe-area inset added by Screen.
    <Screen className="flex flex-col px-5 pb-8 pt-8">
      {/* Top spacer is larger than the bottom one so the whole stack sits a
          little below centre, rather than dead-centred. */}
      <View className="flex-[2]" />

      {/* Hero — the carrot doubles as the hidden email-flow trigger. */}
      <View className="flex flex-col items-center text-center">
        <Press noScale onPress={tapCarrot} accessibilityLabel="carrot">
          <Carrot size={60} />
        </Press>
        <Text className="mt-5 text-center font-display text-5xl font-bold uppercase leading-[0.95] text-label-muted">
          Bucks{"\n"}Buddy
        </Text>
        <Text className="mt-5 text-center text-2xl font-bold text-label">
          For wabbits with bad habits.
        </Text>
        <Text className="mt-2 text-center text-base leading-relaxed text-label-secondary">
          On-the-go money journal for your spending.
        </Text>
      </View>

      {/* Feature cards */}
      <View className="mt-9 flex flex-col gap-2.5">
        <SectionHeader className="mb-1">Features</SectionHeader>
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <View
            key={title}
            className="flex items-center gap-3.5 rounded-card bg-surface p-4 shadow-card flex-row"
          >
            <View className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-carrot-soft">
              <Icon size={20} strokeWidth={2} color={colors.carrotDark} />
            </View>
            {/* flex-1: the web's copy shrinks inside the row by default, RN's
                doesn't (flexShrink is 0 here). */}
            <View className="flex-1">
              <Text className="text-base font-semibold text-label">{title}</Text>
              <Text className="text-sm leading-snug text-label-secondary">{body}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Primary call-to-action. */}
      <View className="mt-9 flex flex-col items-center gap-3">
        <Text className="text-sm text-label-secondary">Free. No ads. 🥕</Text>
        {/* Custom (carrot) Google button. Per Google's custom-button rules this
            is allowed as long as the official four-colour "G" sits on a
            contrasting background — hence the white chip — the font is a clean
            sans-serif, and the label is one of the sanctioned strings. */}
        <Press
          onPress={signInWithGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white transition disabled:opacity-50 flex-row"
        >
          <View className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
            <GoogleIcon size={16} />
          </View>
          <Text className="text-lg font-semibold text-white">
            {loading ? "Redirecting…" : "Continue with Google"}
          </Text>
        </Press>
        {error && <Text className="text-sm font-medium text-danger">{error}</Text>}
        {/* Full-width like the sign-in button so it's an easy mobile target;
            a white fill stands out from the grey canvas while the dark text
            keeps it legible and clearly secondary to the carrot CTA. */}
        <Press
          onPress={() => navigate("/legal")}
          className="w-full rounded-pill bg-surface py-3.5 text-base font-semibold text-label-muted"
        >
          <Text className="text-center text-base font-semibold text-label-muted">
            Privacy and Terms
          </Text>
        </Press>
        {/* The community half of the Stats page is public — let visitors peek
            at what the warren is up to before signing in. */}
        <Press
          onPress={() => navigate("/stats")}
          className="w-full rounded-pill bg-surface py-3.5 text-base font-semibold text-label-muted"
        >
          <Text className="text-center text-base font-semibold text-label-muted">
            Community stats
          </Text>
        </Press>
      </View>

      <View className="flex-1" />
    </Screen>
  );
}
