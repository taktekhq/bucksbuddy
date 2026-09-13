import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, Check, Lock, Sparkles } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ReviewDocument } from "@/components/ReviewDocument";
import { navigate } from "@/lib/router";
import { useStore } from "@/lib/store";
import posthog from "@/lib/posthog";
import { buildDigest } from "@/lib/reportDigest";
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  reportPeriodLabel,
  reportWindowLabel,
  isReportPeriodId,
  type ReportPeriodId,
} from "@/lib/reportPeriod";
import {
  coverageRatio,
  describeEligibility,
  type ReportFacts,
} from "@/lib/reportEligibility";
import { checkReviewPassphrase, hasReviewPassphrase, setReviewPassphrase } from "@/lib/reportVault";
import {
  fetchEligibility,
  fetchReview,
  generateReview,
  listReviews,
  reviewPrice,
  reviewPriceLabel,
  startCheckout,
  storeReviewBody,
  waitForPaidReview,
  asSpendingReview,
} from "@/lib/reviews";
import type { SpendingReview, SpendingReviewRow } from "@/types/db";

// The paid spending review.
//
// Everything money-shaped happens on this device: the rows are read and
// decrypted here, the arithmetic is done here (lib/reportDigest), and the
// finished review is encrypted here before it is stored. The server's jobs are
// the three the browser cannot be trusted with — deciding eligibility, taking
// the payment, and calling the model.
//
// The archive sits behind its own passphrase, which is set before the first
// purchase so no review is ever written to an unprotected archive.

/** What Stripe sent us back with, scrubbed from the URL on read. */
function takeStripeReturn(): { id: string; cancelled: boolean } | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("review");
  if (!id) return null;
  const cancelled = params.get("cancelled") !== null;
  // The service worker re-registers on focus and can reload the page while we
  // are mid-flow (registerType: "autoUpdate"), which would replay this callback.
  // Scrubbing on read makes that a no-op. replaceState fires no hashchange, so
  // the route is untouched.
  params.delete("review");
  params.delete("cancelled");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
  return { id, cancelled };
}

export function Review() {
  const { userId, locked, homeCurrency, reviewRange, sealReview, openReview } =
    useStore();

  const [periodId, setPeriodId] = useState<ReportPeriodId>(DEFAULT_REPORT_PERIOD);
  const [facts, setFacts] = useState<ReportFacts | null>(null);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [rows, setRows] = useState<SpendingReviewRow[]>([]);
  const [hasPassphrase, setHasPassphrase] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [open, setOpen] = useState<{ row: SpendingReviewRow; review: SpendingReview } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRows = useCallback(async () => {
    const { reviews, error: listError } = await listReviews();
    setRows(reviews);
    return { reviews, error: listError };
  }, []);

  // Write a review that has been paid for: read the window, total it here, have
  // it written, then seal it with the account's own key and store that.
  const write = useCallback(
    async (row: SpendingReviewRow) => {
      if (!isReportPeriodId(row.period_id)) {
        setError("That review is for a period this app version doesn't know.");
        return;
      }
      setError(null);
      setBusy("Adding up your entries…");
      const from = new Date(row.period_from);
      const to = new Date(row.period_to);
      const entries = await reviewRange(from, to);
      // Null means the rows could not be read — the encryption vault is still
      // unwrapping (its 600k-iteration derive runs in the provider's effect,
      // after this screen's), or a page failed. Either way, refuse: a review
      // written from what we could not read would be a paid page of zeroes, and
      // this returns before generateReview so the attempt is not spent.
      if (entries === null || entries.length === 0) {
        setBusy(null);
        setError(
          "Couldn't read your entries just yet. Nothing has been used up — tap the review below to try again.",
        );
        return;
      }
      const digest = buildDigest(
        entries,
        { id: row.period_id, from, to },
        row.home_currency,
      );
      setBusy("Writing your review…");
      const { review, error: writeError } = await generateReview(row.id, digest);
      if (!review) {
        setBusy(null);
        setError(writeError);
        await refreshRows();
        return;
      }
      const sealed = await sealReview(review);
      if (sealed) {
        const { error: storeError } = await storeReviewBody(row.id, sealed);
        if (storeError) setError(storeError);
      }
      posthog.capture("review_generated", { period: row.period_id });
      setBusy(null);
      setOpen({ row, review });
      await refreshRows();
    },
    [reviewRange, sealReview, refreshRows],
  );

  // First paint: the archive, the archive gate, and anything Stripe just sent us
  // back with. Runs once — the id is scrubbed from the URL on read, so a service
  // worker reload cannot make it happen twice.
  useEffect(() => {
    let live = true;
    void (async () => {
      const returned = takeStripeReturn();
      // Eligibility is the period effect's job — it runs on mount too, so
      // fetching it here as well would just be a second identical round trip.
      const [{ reviews, error: listError }, passphrase] = await Promise.all([
        refreshRows(),
        hasReviewPassphrase(userId),
      ]);
      if (!live) return;
      // An unreadable answer must not read as "no passphrase set" — that would
      // leave the archive open.
      setHasPassphrase(passphrase.set || passphrase.error !== null);
      if (listError !== null) setError(listError);
      if (!returned) return;
      if (returned.cancelled) {
        // They came back through the cancel link: nothing was charged, and the
        // pending row will just sit there. Don't sit on a poll for it.
        setError("Checkout cancelled — nothing was charged.");
        return;
      }

      // The archive read can race the webhook, and the callback id has already
      // been scrubbed from the URL — so when the list doesn't have the row yet,
      // ask for it directly rather than losing the return.
      const row =
        reviews.find((r) => r.id === returned.id) ?? (await fetchReview(returned.id));
      if (!row) return;
      if (row.status === "pending") {
        setBusy("Waiting for the payment to confirm…");
        const paid = await waitForPaidReview(returned.id);
        if (!live) return;
        setBusy(null);
        await refreshRows();
        if (paid?.status === "paid") await write(paid);
        else if (paid?.status === "pending") {
          setError(
            "The payment hasn't confirmed yet. It'll appear below once it does.",
          );
        }
        return;
      }
      // Paid but unwritten, or written but never delivered to this device: both
      // are the generating function's to retry, so pick it up now.
      if ((row.status === "paid" || row.status === "ready") && !row.body_enc) {
        await write(row);
      }
    })();
    return () => {
      live = false;
    };
    // Deliberately once, on mount. The callback id is scrubbed from the URL as
    // it is read, so re-running this could never repeat the Stripe return — but
    // it would re-enter generation, so it is pinned to mount regardless.
  }, []);

  // The picker moves, so the counts have to follow it.
  useEffect(() => {
    let live = true;
    void (async () => {
      const { facts: f, error: e } = await fetchEligibility(periodId);
      if (!live) return;
      setFacts(f);
      setFactsError(e);
      posthog.capture("review_gate_seen", {
        period: periodId,
        eligible: f?.ok ?? null,
        expenses_logged: f?.spendCount ?? null,
        days_logged: f?.loggedDays ?? null,
        days_in_period: f?.periodDays ?? null,
      });
    })();
    return () => {
      live = false;
    };
  }, [periodId]);

  const buy = useCallback(async () => {
    setError(null);
    setBusy("Opening checkout…");
    const { url, error: checkoutError } = await startCheckout(periodId, homeCurrency);
    if (!url) {
      setBusy(null);
      setError(checkoutError ?? "Couldn't open checkout.");
      return;
    }
    posthog.capture("review_checkout_started", { period: periodId });
    // A plain navigation to Stripe's hosted page: no third-party script runs in
    // the app, and no Content-Security-Policy entry is needed for it.
    window.location.href = url;
  }, [periodId, homeCurrency]);

  const show = useCallback(
    async (row: SpendingReviewRow) => {
      setError(null);
      if (row.status === "refunded") {
        setError("That review was refunded.");
        return;
      }
      if (!row.body_enc) {
        // "ready" with no body means it was written but the reply never reached
        // this device; the generating function lets that be retried, so both
        // states are worth a tap rather than an apology.
        if (row.status === "paid" || row.status === "ready") await write(row);
        else {
          setError(
            "That review was never written. If you were charged for it, get in touch and it'll be refunded.",
          );
        }
        return;
      }
      const review = asSpendingReview(await openReview(row.body_enc));
      if (!review) {
        setError("That review couldn't be opened on this device.");
        return;
      }
      setOpen({ row, review });
    },
    [openReview, write],
  );

  if (locked) {
    return (
      <Shell>
        <Card>
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-label-secondary" />
            <p className="text-[15px] leading-relaxed text-label">
              Your amounts are locked on this device. Enter your encryption
              passphrase in Settings and a review can read them.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {busy !== null && (
        <Card>
          <p className="text-center text-[15px] text-label" role="status">
            {busy}
          </p>
        </Card>
      )}

      {error !== null && (
        <Card>
          <p className="text-[15px] leading-relaxed text-expense">{error}</p>
        </Card>
      )}

      {open !== null && (
        <ReviewDocument
          review={open.review}
          subtitle={reviewWindowLabelFor(open.row)}
        />
      )}

      {busy === null && (
        <Offer
          periodId={periodId}
          onPeriod={setPeriodId}
          facts={facts}
          factsError={factsError}
          hasPassphrase={hasPassphrase}
          onPassphrase={async (passphrase) => {
            const { error: passError } = await setReviewPassphrase(userId, passphrase);
            if (passError) {
              setError(passError);
              return false;
            }
            setHasPassphrase(true);
            setUnlocked(true);
            return true;
          }}
          onBuy={buy}
        />
      )}

      <Archive
        rows={rows}
        busy={busy !== null}
        hasPassphrase={hasPassphrase}
        unlocked={unlocked}
        openId={open?.row.id ?? null}
        onUnlock={async (passphrase) => {
          const good = await checkReviewPassphrase(userId, passphrase);
          if (good) setUnlocked(true);
          return good;
        }}
        onShow={show}
      />
    </Shell>
  );
}

/** "August 2026" / "June 2026 – August 2026" for a stored review. */
function reviewWindowLabelFor(row: SpendingReviewRow): string {
  return reportWindowLabel(new Date(row.period_from), new Date(row.period_to));
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
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
          Review
        </h1>
      </header>
      {children}
    </main>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card">
      {children}
    </div>
  );
}

// The offer: what it covers, where this account stands against the bar, what
// leaves the device, and the one button.
function Offer({
  periodId,
  onPeriod,
  facts,
  factsError,
  hasPassphrase,
  onPassphrase,
  onBuy,
}: {
  periodId: ReportPeriodId;
  onPeriod: (id: ReportPeriodId) => void;
  facts: ReportFacts | null;
  factsError: string | null;
  hasPassphrase: boolean;
  onPassphrase: (passphrase: string) => Promise<boolean>;
  onBuy: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const copy = facts ? describeEligibility(facts, periodId) : null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader>A review of your spending</SectionHeader>
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="flex flex-col gap-2 p-4">
          <p className="text-[15px] leading-relaxed text-label">
            Your logged months, read back to you: where the money went, what
            repeats, and what changed. Written once, kept for good.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="What the review covers"
          className="divide-y divide-separator border-y border-separator"
        >
          {REPORT_PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === periodId}
              onClick={() => onPeriod(option.id)}
              className="press flex w-full items-center justify-between px-4 py-3 text-base text-label"
            >
              <span>{reportPeriodLabel(option.id)}</span>
              {option.id === periodId && (
                <Check className="h-5 w-5 text-carrot" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 p-4">
          {factsError !== null && (
            <p className="text-sm leading-relaxed text-expense">
              Reviews aren&apos;t set up on this database yet. {factsError}
            </p>
          )}
          {facts !== null && copy !== null && (
            <Standing facts={facts} copy={copy} />
          )}

          <p className="text-xs leading-relaxed text-label-secondary">
            Writing a review sends this period&apos;s totals — categories, dates,
            counts and amounts — to Anthropic&apos;s Claude, which writes the
            text. Your notes are never sent, nothing outside the period is sent,
            and the finished review is encrypted with your own key before
            it&apos;s saved.
          </p>

          {asking ? (
            <PassphraseForm
              id="review-passphrase-new"
              label="Set a passphrase for your review archive"
              hint="You'll need it to open past reviews, and it's asked for again each time — so a borrowed phone doesn't come with them open. It locks the screen, not the data: it won't stop anyone who can already read your entries. Forgetting it loses nothing; set a new one any time."
              submitLabel="Save and continue"
              onSubmit={async (passphrase) => {
                const saved = await onPassphrase(passphrase);
                if (saved) onBuy();
                return saved;
              }}
            />
          ) : (
            <button
              type="button"
              disabled={copy === null || !copy.ok}
              onClick={() => (hasPassphrase ? onBuy() : setAsking(true))}
              className="press rounded-pill bg-carrot py-3.5 text-lg font-semibold text-surface shadow-carrot transition disabled:bg-separator disabled:text-label-secondary disabled:shadow-none"
            >
              {copy === null
                ? "Can't check your history right now"
                : !copy.ok
                  ? "Not enough logged yet"
                  : `Unlock a review · ${reviewPriceLabel()}`}
            </button>
          )}
          <p className="text-center text-xs text-label-secondary">
            One-time, per review. No subscription.
          </p>
        </div>
      </div>
    </section>
  );
}

// Where this account stands: the blockers, in the server's own counts.
function Standing({
  facts,
  copy,
}: {
  facts: ReportFacts;
  copy: { ok: boolean; blockers: string[]; warnings: string[] };
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-label-secondary">Expenses logged</span>
        <span className="font-numeric text-sm font-bold tabular-nums text-label">
          {facts.spendCount} / {facts.minSpendEntries}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-label-secondary">Days with entries</span>
        <span className="font-numeric text-sm font-bold tabular-nums text-label">
          {facts.loggedDays} / {facts.periodDays}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-pill bg-grouped"
        role="progressbar"
        aria-valuenow={Math.round(coverageRatio(facts) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Days with entries"
      >
        <div
          className="h-full rounded-pill bg-carrot"
          style={{ width: `${Math.min(coverageRatio(facts) * 100, 100)}%` }}
        />
      </div>
      {copy.blockers.map((blocker) => (
        <p key={blocker} className="text-sm leading-relaxed text-label">
          {blocker}
        </p>
      ))}
      {copy.warnings.map((warning) => (
        <p key={warning} className="text-sm leading-relaxed text-label-secondary">
          {warning}
        </p>
      ))}
    </div>
  );
}

// Past reviews. The list itself is never secret — the writing is — so dates and
// prices show, and opening one needs the passphrase.
function Archive({
  rows,
  busy,
  hasPassphrase,
  unlocked,
  openId,
  onUnlock,
  onShow,
}: {
  rows: SpendingReviewRow[];
  busy: boolean;
  hasPassphrase: boolean;
  unlocked: boolean;
  openId: string | null;
  onUnlock: (passphrase: string) => Promise<boolean>;
  onShow: (row: SpendingReviewRow) => void;
}) {
  if (rows.length === 0) return null;
  const needsUnlock = hasPassphrase && !unlocked;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader>Your reviews</SectionHeader>
      {needsUnlock ? (
        <Card>
          <PassphraseForm
            id="review-passphrase-unlock"
            label="Enter your archive passphrase"
            hint="Asked once each time you open the app, so a borrowed phone doesn't come with your reviews open."
            submitLabel="Unlock"
            onSubmit={onUnlock}
          />
        </Card>
      ) : null}
      <div className="divide-y divide-separator overflow-hidden rounded-card bg-surface shadow-card">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={needsUnlock || busy}
            onClick={() => onShow(row)}
            className="press flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left disabled:opacity-60"
          >
            <span className="flex flex-col">
              <span className="text-base text-label">
                {reviewWindowLabelFor(row)}
              </span>
              <span className="text-xs text-label-secondary">
                {statusLine(row)}
              </span>
            </span>
            {row.id === openId ? (
              <Check className="h-5 w-5 shrink-0 text-carrot" strokeWidth={2.5} />
            ) : (
              <Sparkles
                className="h-4 w-4 shrink-0 text-label-secondary"
                aria-hidden
              />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The one-line state of a stored review. */
function statusLine(row: SpendingReviewRow): string {
  const price = reviewPrice(row);
  if (row.status === "refunded") return `Refunded · ${price}`;
  if (row.status === "failed") return row.error ?? "Didn't complete";
  if (row.status === "pending") return "Not completed — nothing was charged";
  if (!row.body_enc) return `Paid ${price} · tap to write it`;
  return `${price} · tap to read`;
}

// One passphrase field, used for both setting and entering. Kept dumb: the
// caller decides what a submit means and whether it worked.
function PassphraseForm({
  id,
  label,
  hint,
  submitLabel,
  onSubmit,
}: {
  id: string;
  label: string;
  hint: string;
  submitLabel: string;
  onSubmit: (passphrase: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (value === "" || busy) return;
        setBusy(true);
        setFailed(false);
        const ok = await onSubmit(value);
        setBusy(false);
        if (ok) setValue("");
        else setFailed(true);
      }}
    >
      <label className="text-sm font-semibold text-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        className="rounded-card bg-grouped px-4 py-3 text-base text-label"
      />
      <p className="text-xs leading-relaxed text-label-secondary">{hint}</p>
      {failed && <p className="text-sm text-expense">That didn&apos;t match.</p>}
      <button
        type="submit"
        disabled={value === "" || busy}
        className="press rounded-pill bg-carrot py-3 text-base font-semibold text-surface transition disabled:bg-separator disabled:text-label-secondary"
      >
        {submitLabel}
      </button>
    </form>
  );
}
