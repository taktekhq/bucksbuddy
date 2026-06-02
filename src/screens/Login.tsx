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
      {/* Mascot on the Looney Tunes bullseye. */}
      <div className="relative flex flex-col items-center">
        <div
          aria-hidden
          className="lt-rings absolute -top-10 h-64 w-64 rounded-full opacity-80"
          style={{
            maskImage: "radial-gradient(circle, black 55%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(circle, black 55%, transparent 75%)",
          }}
        />
        <Carrot className="relative text-7xl drop-shadow-sm" animation="wiggle" />
        <h1 className="relative mt-5 font-display text-4xl font-bold tracking-tight text-label">
          BucksBuddy
        </h1>
        <p className="relative mt-1 font-display text-lg font-medium text-carrot">
          What&apos;s up, Doc?
        </p>
      </div>

      <form onSubmit={signIn} className="mt-12 flex flex-col gap-3">
        {!OWNER_EMAIL && (
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-card bg-surface px-4 py-4 shadow-card outline-none ring-carrot/40 transition focus:ring-2 placeholder:text-label-secondary"
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
          className="rounded-card bg-surface px-4 py-4 shadow-card outline-none ring-carrot/40 transition focus:ring-2 placeholder:text-label-secondary"
        />
        {error && <p className="px-1 text-sm font-medium text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="press mt-2 rounded-pill bg-carrot py-4 text-lg font-semibold text-white shadow-carrot transition disabled:bg-separator disabled:text-label-secondary disabled:shadow-none"
        >
          {loading ? "Hold on, Doc…" : "Let's go"}
        </button>
      </form>
    </main>
  );
}
