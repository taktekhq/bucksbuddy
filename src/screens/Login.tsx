import { useRef, useState } from "react";
import { Carrot } from "@/components/ui/Carrot";
import { GoogleIcon } from "@/components/ui/GoogleIcon";
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
