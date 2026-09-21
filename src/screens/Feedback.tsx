import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Database, ImagePlus, X } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { supabase } from "@/lib/supabase";
import { navigate } from "@/lib/router";
import { useStore } from "@/lib/store";
import posthog from "@/lib/posthog";
import {
  accountSnapshot,
  addScreenshots,
  MAX_MESSAGE_CHARS,
  MAX_SCREENSHOTS,
  submitFeedback,
  valuesMasked,
} from "@/lib/feedback";

// The feedback screen, reached from the speech bubble next to the Safe on Home.
// Writing here files a GitHub issue (via the `feedback` edge function, which is
// the only thing holding a token), so a bug reported from a phone lands where
// the fixing happens.
//
// Three things ride along with the message:
//   * the account email, so a reply has somewhere to go;
//   * screenshots picked from the photo library, the fastest way to explain a
//     layout bug;
//   * optionally, and only when deliberately switched on, the account's raw
//     data. That one is off by default and says exactly what it does, because
//     for an end-to-end encrypted account it means handing over the very thing
//     the encryption exists to keep private.
//
// It's a screen rather than a sheet for the same reason AddComposer is inline:
// a textarea plus the iOS keyboard needs a page that can scroll, not a panel
// pinned to the bottom of the viewport.
//
// The copy is kept to the bone. Every line here is read by someone who has
// already hit a bug and just wants it reported.

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function Feedback() {
  const {
    transactions,
    safeGoldEntries,
    locked,
    homeCurrency,
    currencies,
    e2eMode,
  } = useStore();

  // The signed-in account: the id names the folder the attachments go in, the
  // email is the reply address printed on the issue.
  const [account, setAccount] = useState<{ id: string; email: string | null } | null>(
    null,
  );
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setAccount(user ? { id: user.id, email: user.email ?? null } : null);
    });
  }, []);

  const [message, setMessage] = useState("");
  const [shots, setShots] = useState<File[]>([]);
  const [shareData, setShareData] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // While the device is locked the rows in memory are garbled stand-ins, so
  // there is no real data to hand over, and anything already switched on gets
  // switched back off rather than quietly shipping zeros.
  const masked = valuesMasked(locked, transactions, safeGoldEntries);
  useEffect(() => {
    if (masked) setShareData(false);
  }, [masked]);

  // Thumbnails for what's attached. Revoked when the list changes so the blobs
  // don't pile up behind a few rounds of picking and removing.
  const previews = useMemo(() => shots.map((f) => URL.createObjectURL(f)), [shots]);
  useEffect(
    () => () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    },
    [previews],
  );

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const { files, error } = addScreenshots(shots, Array.from(e.target.files ?? []));
    setShots(files);
    setNotice(error);
    // Let the same photo be picked again after it's been removed.
    e.target.value = "";
  }

  function remove(index: number) {
    setShots((prev) => prev.filter((_, i) => i !== index));
    setNotice(null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    // The submit button is disabled without one; this is the belt to that
    // brace (a form can still be submitted without its button).
    if (!account) return;
    setBusy(true);
    setErr(null);

    const data = shareData
      ? accountSnapshot({
          userId: account.id,
          email: account.email,
          homeCurrency,
          currencies,
          e2eMode,
          transactions,
          goldEntries: safeGoldEntries,
        })
      : null;

    const { error } = await submitFeedback({
      userId: account.id,
      message,
      screenshots: shots,
      data,
    });
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    posthog.capture("feedback_sent", {
      screenshots: shots.length,
      shared_data: shareData,
    });
    setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[var(--top-gutter)]">
      {/* Plain iOS nav: back chevron + centered title, matching Settings/Legal. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase text-label-muted">
          Feedback
        </h1>
      </header>

      {sent ? (
        <Sent
          onAgain={() => {
            setSent(false);
            setMessage("");
            setShots([]);
            setShareData(false);
            setNotice(null);
            setErr(null);
          }}
        />
      ) : (
        <form onSubmit={send} className="flex flex-col gap-6">
          {/* WHAT HAPPENED */}
          <section className="flex flex-col gap-2">
            <SectionHeader>What&apos;s up, Doc?</SectionHeader>
            <div className="rounded-card bg-surface p-4 shadow-card">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MAX_MESSAGE_CHARS}
                rows={5}
                aria-label="Your feedback"
                placeholder="What happened?"
                className="w-full resize-none rounded-card border border-separator bg-surface px-3.5 py-3 text-base leading-relaxed text-label outline-none ring-carrot/40 transition focus:ring-2 placeholder:text-label-secondary"
              />
            </div>
          </section>

          {/* SCREENSHOTS */}
          <section className="flex flex-col gap-2">
            <SectionHeader>Screenshots</SectionHeader>
            <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
              {shots.length > 0 && (
                <ul className="flex flex-wrap gap-2.5">
                  {shots.map((file, i) => (
                    <li key={`${file.name}-${i}`} className="relative">
                      <img
                        src={previews[i]}
                        alt={file.name}
                        className="h-20 w-20 rounded-card border border-separator object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label={`Remove ${file.name}`}
                        className="press absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-label text-surface shadow-card"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={3} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {shots.length < MAX_SCREENSHOTS && (
                <label className="press flex cursor-pointer items-center justify-center gap-2 rounded-pill bg-grouped py-3 text-base font-semibold text-label">
                  <ImagePlus className="h-5 w-5" strokeWidth={2} />
                  {shots.length > 0 ? "Add another" : "Add from photos"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={pick}
                    aria-label="Add from photos"
                    className="hidden"
                  />
                </label>
              )}

              <p className="px-1 text-xs text-label-secondary">
                Up to {MAX_SCREENSHOTS}, 5 MB each.
              </p>
              {notice && (
                <p className="px-1 text-sm font-medium text-danger">{notice}</p>
              )}
            </div>
          </section>

          {/* RAW DATA: off unless deliberately switched on. */}
          <section className="flex flex-col gap-2">
            <SectionHeader>Your data</SectionHeader>
            <div
              className={`flex flex-col gap-3 rounded-card p-4 shadow-card transition ${
                shareData ? "bg-carrot-soft ring-1 ring-carrot/40" : "bg-surface"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    shareData ? "bg-carrot text-surface" : "bg-grouped text-label-secondary"
                  }`}
                >
                  <Database className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-tight text-label">
                    Include my data
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-label-secondary">
                    {plural(transactions.length, "entry", "entries")} ·{" "}
                    {plural(safeGoldEntries.length, "gold entry", "gold entries")}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={shareData}
                  aria-label="Include my data"
                  disabled={masked}
                  onClick={() => setShareData((v) => !v)}
                  className={`press relative h-8 w-[52px] shrink-0 rounded-pill transition disabled:opacity-40 ${
                    shareData ? "bg-carrot" : "bg-grouped"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute top-1 h-6 w-6 rounded-full bg-surface shadow-segment transition-all ${
                      shareData ? "left-[24px]" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {masked ? (
                <p className="text-sm text-label-secondary">
                  Locked. Unlock in Settings first.
                </p>
              ) : shareData ? (
                <p className="text-sm text-label">
                  Your entries go in the clear. Used to fix the bug, then
                  deleted.
                </p>
              ) : (
                <p className="text-sm text-label-secondary">
                  Off. Message and screenshots only.
                </p>
              )}
            </div>
          </section>

          {/* SEND */}
          <section className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={!account || message.trim().length === 0 || busy}
              className="press rounded-pill bg-carrot py-3.5 font-display text-base font-semibold text-white shadow-carrot transition disabled:bg-separator disabled:text-label-secondary disabled:shadow-none"
            >
              {busy ? "Sending…" : "Send"}
            </button>
            <p className="px-1 text-center text-xs text-label-secondary">
              Sent as {account?.email ?? "your account"}, with your device info.
            </p>
            {err && (
              <p className="px-1 text-center text-sm font-medium text-danger">{err}</p>
            )}
          </section>
        </form>
      )}
    </main>
  );
}

// The thank-you. Deliberately says nothing about issue numbers: the repo is
// private, so a link would only 404 for whoever just wrote in.
function Sent({ onAgain }: { onAgain: () => void }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-card bg-surface p-6 text-center shadow-card">
      <span className="animate-pop flex h-14 w-14 items-center justify-center rounded-full bg-income/15 text-income">
        <Check className="h-7 w-7" strokeWidth={3} />
      </span>
      <div>
        <p className="text-base font-semibold text-label">Sent.</p>
        <p className="mt-1 text-sm text-label-secondary">
          We&apos;ll reply by email if we need more.
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="press w-full rounded-pill bg-carrot py-3 font-display text-base font-semibold text-white shadow-carrot"
      >
        Done
      </button>
      <button
        type="button"
        onClick={onAgain}
        className="press text-sm font-semibold text-carrot"
      >
        Send another
      </button>
    </section>
  );
}
