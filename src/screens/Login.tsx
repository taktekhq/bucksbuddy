import { useRef, useState } from "react";
import { Carrot } from "@/components/ui/Carrot";
import { supabase } from "@/lib/supabase";

// Tapping the carrot this many times reveals the hidden email/password form,
// for friends without a Google account whose accounts we create by hand in
// Supabase. Nothing about it shows in the URL, so it stays out of the way.
const TAPS_TO_REVEAL = 7;

export function Login() {
  // Disables the button and shows "Redirecting…" while the browser leaves for
  // Google.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidden password sign-in: counts carrot taps, then swaps in the form. The
  // count lives in a ref since it shouldn't trigger a re-render on its own —
  // only crossing the threshold flips showPassword.
  const taps = useRef(0);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function tapCarrot() {
    if (showPassword) return;
    taps.current += 1;
    if (taps.current >= TAPS_TO_REVEAL) setShowPassword(true);
  }

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });

    // On success the browser navigates away to Google; on return, the
    // onAuthStateChange listener in useSession swaps App over to the app. We
    // only land here if the redirect failed to start.
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

    // On success onAuthStateChange in useSession swaps App over to the app, so
    // we only need to handle the failure path here.
    if (pwError) {
      setError(pwError.message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="flex flex-col items-center">
        {/* The carrot doubles as the hidden trigger: tap it TAPS_TO_REVEAL
            times to reveal the password form. */}
        <button
          type="button"
          onClick={tapCarrot}
          aria-label="carrot"
          className="leading-none"
        >
          <Carrot className="text-6xl" />
        </button>
        <h1 className="mt-4 text-center font-display text-3xl font-bold uppercase leading-none text-label-muted">
          Bucks
          <br />
          Buddy
        </h1>
        <p className="mt-1 text-base text-label-secondary">What&apos;s up, Doc?</p>
      </div>

      {/* Sign-in grouped in a single white card on the canvas. */}
      <div className="mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="press flex items-center justify-center gap-3 rounded-pill bg-grouped py-3.5 text-lg font-semibold text-label transition disabled:opacity-50"
        >
          <GoogleIcon className="h-5 w-5" />
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        {showPassword && (
          <form onSubmit={signInWithPassword} className="flex flex-col gap-3">
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
              className="press rounded-pill bg-label py-3.5 text-lg font-semibold text-surface transition disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {error && <p className="px-1 text-sm font-medium text-danger">{error}</p>}
      </div>
    </main>
  );
}

// Brand logo as inline SVG — lucide has no brand glyphs and we don't want a new
// dependency just for one icon.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
