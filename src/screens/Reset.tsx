import { useState } from "react";
import { Carrot } from "@/components/ui/Carrot";
import { supabase } from "@/lib/supabase";

// New-password screen, rendered while Supabase's PASSWORD_RECOVERY event is in
// effect (see useSession). The recovery token from the email link is what
// created the session that authorizes updateUser({ password }); without it the
// SDK rejects the call, and App never renders this screen anyway.
const MIN_LENGTH = 8;

export function Reset() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // Sign them out so the next step is a fresh sign-in with the new password;
    // signing out also clears recoveryMode in useSession, dropping App back to
    // the landing.
    setDone(true);
    await supabase.auth.signOut();
  }

  async function cancel() {
    // Leave the recovery session entirely — no half-authenticated state.
    await supabase.auth.signOut();
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
        <div className="flex flex-col items-center">
          <Carrot className="text-6xl" />
          <h1 className="mt-4 text-center font-display text-3xl font-bold uppercase leading-none text-label-muted">
            All set
          </h1>
          <p className="mt-3 text-center text-base text-label-secondary">
            Your password's been updated. Sign in to keep going.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="flex flex-col items-center">
        <Carrot className="text-6xl" />
        <h1 className="mt-4 text-center font-display text-3xl font-bold uppercase leading-none text-label-muted">
          New
          <br />
          Password
        </h1>
        <p className="mt-1 text-base text-label-secondary">Pick something memorable.</p>
      </div>

      <form
        onSubmit={submit}
        className="mt-8 flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card"
      >
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          className="rounded-pill bg-grouped px-4 py-3.5 text-lg text-label outline-none placeholder:text-label-muted"
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          className="rounded-pill bg-grouped px-4 py-3.5 text-lg text-label outline-none placeholder:text-label-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="press rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white transition disabled:opacity-50"
        >
          {busy ? "Saving…" : "Update password"}
        </button>
        {error && <p className="px-1 text-sm font-medium text-danger">{error}</p>}
      </form>

      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        className="press mt-5 text-base font-semibold text-carrot"
      >
        Cancel
      </button>
    </main>
  );
}
