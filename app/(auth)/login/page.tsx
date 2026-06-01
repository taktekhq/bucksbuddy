"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (otpError) {
      setError(otpError.message);
      setLoading(false);
      return;
    }
    setStep("code");
    setLoading(false);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // Returning logins arrive as a magic-link OTP ("email"); a brand-new user's
    // very first code arrives as a signup OTP. Try email first, then fall back.
    let { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (verifyError) {
      const retry = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });
      verifyError = retry.error;
    }

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="text-center">
        <div className="text-6xl">🥕</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">BucksBuddy</h1>
        <p className="mt-1 text-label-secondary">What&apos;s up, Doc?</p>
      </div>

      {step === "email" ? (
        <form onSubmit={sendCode} className="mt-10 flex flex-col gap-3">
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
            {loading ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-10 flex flex-col gap-3">
          <p className="text-center text-sm text-label-secondary">
            We emailed a code to {email}.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={8}
            placeholder="Enter code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
            className="rounded-card bg-grouped px-4 py-4 text-center text-2xl tracking-[0.3em] tabular-nums outline-none placeholder:text-base placeholder:tracking-normal placeholder:text-label-secondary"
          />
          {error && <p className="text-sm text-expense">{error}</p>}
          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="press rounded-card bg-label py-4 text-lg font-semibold text-white disabled:bg-separator"
          >
            {loading ? "Verifying…" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className="press py-2 text-center text-sm text-carrot"
          >
            Use a different email
          </button>
        </form>
      )}
    </main>
  );
}
