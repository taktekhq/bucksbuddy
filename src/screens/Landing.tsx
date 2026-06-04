import { useRef, useState } from "react";
import { ArrowDownUp, ArrowLeft, Lock, Vault } from "lucide-react";
import { Carrot } from "@/components/ui/Carrot";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { supabase } from "@/lib/supabase";

// The public marketing landing page — succinct and on-brand: the static carrot
// mascot, the Grobold wordmark, a cheeky tagline, three feature cards, and a big
// "Continue with Google" call-to-action. It's the entry point for signed-out
// visitors (route "/") and owns the Google + email sign-in flows.
//
// Hidden email sign-in: tapping the carrot mascot this many times swaps the page
// for a plain email/password form — for friends without a Google account whose
// accounts we create by hand in Supabase. It's a *separate flow* shown in place,
// and nothing about it touches the URL, so it stays out of the way.
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
  useThemeColor("#F2F2F7");

  // Disables the button and shows "Redirecting…" while the browser leaves for
  // Google (or "Signing in…" during a password sign-in).
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden password sign-in: count carrot taps, then swap in the form. The count
  // lives in a ref since it shouldn't re-render on its own — only crossing the
  // threshold flips showEmail.
  const taps = useRef(0);
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
    taps.current = 0;
    setShowEmail(false);
    setError(null);
  }

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });

    // On success the browser navigates away to Google; on return, the
    // onAuthStateChange listener in useSession swaps App over to the app. We only
    // land here if the redirect failed to start.
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
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
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
        <div className="flex flex-col items-center">
          <Carrot className="text-6xl" />
          <h1 className="mt-4 text-center font-display text-3xl font-bold uppercase leading-none text-label-muted">
            Bucks
            <br />
            Buddy
          </h1>
          <p className="mt-1 text-base text-label-secondary">Sign in with email</p>
        </div>

        <form
          onSubmit={signInWithPassword}
          className="mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card"
        >
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-pill bg-grouped px-4 py-3.5 text-lg text-label outline-none placeholder:text-label-muted"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-pill bg-grouped px-4 py-3.5 text-lg text-label outline-none placeholder:text-label-muted"
          />
          <button
            type="submit"
            disabled={loading}
            className="press rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white transition disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          {error && <p className="px-1 text-sm font-medium text-danger">{error}</p>}
        </form>

        <button
          type="button"
          onClick={backToLanding}
          className="press mt-5 flex items-center justify-center gap-1.5 text-base font-semibold text-carrot"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Back
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(2rem+var(--safe-top))]">
      {/* Top spacer is larger than the bottom one so the whole stack sits a
          little below centre, rather than dead-centred. */}
      <div aria-hidden className="flex-[2]" />

      {/* Hero — the carrot doubles as the hidden email-flow trigger. */}
      <section className="flex flex-col items-center text-center">
        <button
          type="button"
          onClick={tapCarrot}
          aria-label="carrot"
          className="leading-none"
        >
          <Carrot className="text-7xl" />
        </button>
        <h1 className="mt-5 font-display text-5xl font-bold uppercase leading-[0.95] text-label-muted">
          Bucks
          <br />
          Buddy
        </h1>
        <p className="mt-5 text-2xl font-bold text-label">
          Track wabbits and bad habits.
        </p>
        <p className="mt-2 text-base leading-relaxed text-label-secondary">
          On-the-go money journal for your spending.
        </p>
      </section>

      {/* Feature cards */}
      <section className="mt-9 flex flex-col gap-2.5">
        <SectionHeader className="mb-1">Features</SectionHeader>
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex items-center gap-3.5 rounded-card bg-surface p-4 shadow-card"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-carrot-soft">
              <Icon className="h-5 w-5 text-carrot-dark" strokeWidth={2} />
            </div>
            <div>
              <p className="text-base font-semibold text-label">{title}</p>
              <p className="text-sm leading-snug text-label-secondary">{body}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Primary call-to-action. */}
      <section className="mt-9 flex flex-col items-center gap-3">
        <p className="text-sm text-label-secondary">Free. No ads. 🥕</p>
        {/* Custom (carrot) Google button. Per Google's custom-button rules this
            is allowed as long as the official four-colour "G" sits on a
            contrasting background — hence the white chip — the font is a clean
            sans-serif, and the label is one of the sanctioned strings. */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="press flex w-full items-center justify-center gap-3 rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white transition disabled:opacity-50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white">
            <GoogleIcon className="h-4 w-4" />
          </span>
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
        {/* Full-width like the sign-in button so it's an easy mobile target;
            a white fill stands out from the grey canvas while the dark text
            keeps it legible and clearly secondary to the carrot CTA. */}
        <button
          type="button"
          onClick={() => navigate("/legal")}
          className="press w-full rounded-pill bg-surface py-3.5 text-base font-semibold text-label-muted"
        >
          Privacy and Terms
        </button>
      </section>

      <div aria-hidden className="flex-1" />
    </main>
  );
}
