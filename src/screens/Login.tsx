import { useState } from "react";
import { Carrot } from "@/components/ui/Carrot";
import { supabase, OWNER_EMAIL } from "@/lib/supabase";

export function Login() {
  const [email, setEmail] = useState(OWNER_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
    // On success the auth listener swaps to the app automatically.
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="flex flex-col items-center">
        <Carrot className="text-6xl" />
        <h1 className="mt-4 font-display text-3xl font-bold uppercase text-label-muted">
          BucksBuddy
        </h1>
        <p className="mt-1 text-base text-label-secondary">What&apos;s up, Doc?</p>
      </div>

      {/* Inputs grouped in a single white card on the canvas. */}
      <form
        onSubmit={signIn}
        className="mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card"
      >
        {!OWNER_EMAIL && (
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-card bg-grouped px-4 py-3.5 outline-none ring-carrot/40 transition focus:ring-2 placeholder:text-label-secondary"
          />
        )}
        <input
          type="password"
          autoComplete="current-password"
          autoFocus={!!OWNER_EMAIL}
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-card bg-grouped px-4 py-3.5 outline-none ring-carrot/40 transition focus:ring-2 placeholder:text-label-secondary"
        />
        {error && <p className="px-1 text-sm font-medium text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="press mt-1 rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white transition disabled:bg-separator disabled:text-label-secondary"
        >
          {loading ? "Hold on, Doc…" : "Let's go"}
        </button>
      </form>
    </main>
  );
}
