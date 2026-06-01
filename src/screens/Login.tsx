import { useState } from "react";
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
      <div className="text-center">
        <div className="text-6xl">🥕</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">BucksBuddy</h1>
        <p className="mt-1 text-label-secondary">What&apos;s up, Doc?</p>
      </div>

      <form onSubmit={signIn} className="mt-10 flex flex-col gap-3">
        {!OWNER_EMAIL && (
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-card bg-grouped px-4 py-4 outline-none placeholder:text-label-secondary"
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
          className="rounded-card bg-grouped px-4 py-4 outline-none placeholder:text-label-secondary"
        />
        {error && <p className="text-sm text-expense">{error}</p>}
        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="press rounded-card bg-label py-4 text-lg font-semibold text-white disabled:bg-separator"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
