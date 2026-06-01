"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/confirm` },
    });

    if (otpError) {
      setError(otpError.message);
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="text-center">
        <div className="text-6xl">🥕</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">BucksBuddy</h1>
        <p className="mt-1 text-label-secondary">What&apos;s up, Doc?</p>
      </div>

      {sent ? (
        <div className="mt-10 rounded-card bg-grouped p-6 text-center">
          <p className="font-medium">Check your email 📬</p>
          <p className="mt-1 text-sm text-label-secondary">
            We sent a magic link to {email}. Tap it to sign in.
          </p>
        </div>
      ) : (
        <form onSubmit={sendLink} className="mt-10 flex flex-col gap-3">
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
          {error && <p className="text-sm text-expense">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="press rounded-card bg-label py-4 text-lg font-semibold text-white disabled:bg-separator"
          >
            {loading ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}
    </main>
  );
}
