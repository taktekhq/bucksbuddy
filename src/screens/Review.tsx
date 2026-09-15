import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, Check, Lock, Sparkles } from "lucide-react";
import { useThemeColor } from "@/lib/useThemeColor";
import { useFloorColor } from "@/lib/useFloorColor";
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
  periodName,
  isKnownPeriodId,
  type ReportPeriodId,
} from "@/lib/reportPeriod";
import {
  coverageRatio,
  describeEligibility,
  type ReportFacts,
} from "@/lib/reportEligibility";
import {
  fetchEligibility,
  fetchReview,
  generateReview,
  listReviews,
  REVIEW_BILLING,
  reviewPrice,
  reviewPriceLabel,
  startReview,
  storeReviewBody,
  waitForPaidReview,
  asSpendingReview,
} from "@/lib/reviews";
import type { SpendingReview, SpendingReviewRow } from "@/types/db";

// The spending review, in its own dark room.
//
// Two of the three windows end NOW rather than at the start of this month, so a
// review can answer "how is this month going". That makes it a snapshot: the
// window a review was written for is stored on its own row, and the archive
// labels each one with that window rather than with today's.
//
// Everything money-shaped happens on this device: the rows are read and
// decrypted here, the arithmetic is done here (lib/reportDigest), and the
// finished review is encrypted here before it is stored. The server's jobs are
// the three the browser cannot be trusted with — deciding eligibility, deciding
// whether this account may have a review at all (free, paid, or not at
// all — see the review-start function), and calling the model.
//
// While billing is off, an allowlisted account gets its review immediately: the
// row comes back already paid at a price of zero, so there is no redirect and
// nothing to wait for. The Stripe return path below stays live for when it isn't.
//
// The archive is behind the passphrase the account already has, never a second
// one to remember. On the passphrase tier a past review asks for that same
// passphrase once per app open — checked against the one this device unlocked
// with, so it is the secret that already gates every amount. On the default tier
// there is nothing to ask: the only passphrase is the constant compiled into the
// bundle, and a lock whose key is published is not a lock. Either way the body is
// encrypted with the account's master key, so a review is exactly as
// confidential as the numbers it was written from.

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
  const { locked, e2eMode, passphrase, homeCurrency, reviewRange, sealReview, openReview } =
    useStore();

  // The archive's gate, or null when there is nothing worth asking for. On the
  // passphrase tier it is the account's own encryption passphrase, as this
  // device unlocked with it; on the default tier the only passphrase in play is
  // the public constant, so the archive is open to whoever can already read the
  // amounts it was written from.
  const gate = e2eMode === "passphrase" ? passphrase : null;

  const [periodId, setPeriodId] = useState<ReportPeriodId>(DEFAULT_REPORT_PERIOD);
  const [facts, setFacts] = useState<ReportFacts | null>(null);
  // When this account's logging started, as the last eligibility answer reported
  // it. Only "all time" needs it, and only the database knows it.
  const [firstEntryAt, setFirstEntryAt] = useState<string | null>(null);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [rows, setRows] = useState<SpendingReviewRow[]>([]);
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
      if (!isKnownPeriodId(row.period_id)) {
        setError("That review is from a newer version of the app.");
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
        setError("Couldn't read your entries. Nothing used up — tap to retry.");
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

  // First paint: the archive, and anything Stripe just sent us back with. Runs
  // once — the id is scrubbed from the URL on read, so a service worker reload
  // cannot make it happen twice.
  useEffect(() => {
    let live = true;
    void (async () => {
      const returned = takeStripeReturn();
      // Eligibility is the period effect's job — it runs on mount too, so
      // fetching it here as well would just be a second identical round trip.
      const { reviews, error: listError } = await refreshRows();
      if (!live) return;
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
          setError("The payment hasn't confirmed yet. It'll appear below.");
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
      setFirstEntryAt(f?.firstEntryAt ?? null);
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
    setBusy("Starting your review…");
    const { reviewId, url, free, error: startError } = await startReview(
      periodId,
      homeCurrency,
      // Only "all time" reads this. It is held as its own state rather than read
      // off `facts` at the call, so there is one place it can come from.
      firstEntryAt,
    );
    if (startError !== null) {
      setBusy(null);
      setError(startError);
      return;
    }
    posthog.capture("review_started", { period: periodId, free });
    if (free) {
      // Nothing to pay, so nothing to wait for: the row came back already paid
      // at a price of zero, and it can be written straight away. A free grant
      // with no id is a malformed reply rather than a payment to wait on, so it
      // gets the same answer as a row that cannot be read back.
      let row: SpendingReviewRow | null = null;
      if (reviewId !== null) row = await fetchReview(reviewId);
      if (!row) {
        setBusy(null);
        setError("Couldn't find the review that was just started.");
        return;
      }
      await refreshRows();
      await write(row);
      return;
    }
    if (url === null) {
      setBusy(null);
      setError("Couldn't open checkout.");
      return;
    }
    // A plain navigation to Stripe's hosted page: no third-party script runs in
    // the app, and no Content-Security-Policy entry is needed for it.
    window.location.href = url;
  }, [periodId, homeCurrency, firstEntryAt, refreshRows, write]);

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
          setError("That review was never written. Get in touch if you paid.");
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
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-review-muted" />
            <p className="text-[15px] text-review-text">
              Unlock your amounts in Settings to write a review.
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
          <p className="text-center text-[15px] text-review-text" role="status">
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
          firstEntryAt={firstEntryAt}
          factsError={factsError}
          onBuy={buy}
        />
      )}

      <Archive
        rows={rows}
        busy={busy !== null}
        locked={gate !== null && !unlocked}
        openId={open?.row.id ?? null}
        onUnlock={(typed) => {
          const good = typed === gate;
          if (good) setUnlocked(true);
          return good;
        }}
        onShow={show}
      />
    </Shell>
  );
}

/**
 * What a stored review covered: "This month vs last · August 2026 – September
 * 2026". The name has to be there — two of the windows end when they were asked
 * for, so their month spans can be identical and the dates alone would not say
 * which review this is.
 */
function reviewWindowLabelFor(row: SpendingReviewRow): string {
  const window = reportWindowLabel(
    new Date(row.period_from),
    new Date(row.period_to),
  );
  // A row can carry a window this version has never heard of — a newer build
  // wrote it — and then the dates are all there is to show.
  return isKnownPeriodId(row.period_id)
    ? `${periodName(row.period_id)} · ${window}`
    : window;
}

// The review has its own dark room — a different mentality from the bright
// daily tracker, and deliberately violet rather than the Safe's green vault, so
// the two dark screens are never mistaken for one another. Carrot stays the
// accent, so it still reads as this app after dark. The mechanics are the
// Safe's: the gradient is painted on the scrolling content and a fixed floor
// sits behind it, because a collapsing browser toolbar and an overscroll bounce
// would otherwise flash the light body canvas through.
const ROOM_BG =
  "linear-gradient(180deg, #2A1A3E 0px, #1E1330 320px, #150D24 640px)";
const ROOM_FLOOR = "#150D24";

function Shell({ children }: { children: ReactNode }) {
  // Tint the status bar to match the top of the room, and paint the document
  // floor too — without the second one, web Safari's collapsing toolbar and an
  // overscroll bounce flash the light canvas at the edges of the dark room. The
  // Safe and the rabbit hole both do exactly this.
  useThemeColor("#2A1A3E");
  useFloorColor(ROOM_FLOOR);
  return (
    <main
      className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-review-text"
      style={{ background: ROOM_BG }}
    >
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ background: ROOM_FLOOR, zIndex: -1 }}
      />
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase text-review-muted">
          Review
        </h1>
      </header>
      {children}
    </main>
  );
}

// Cards get a hairline instead of a shadow: a drop shadow is invisible on a
// dark ground, and the ring is what separates a card from the room behind it.
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
      {children}
    </div>
  );
}

// The offer: what it covers, where this account stands, what leaves the device,
// and the one button. Every line of copy here is at most 70 characters — the
// counters carry the detail, so the words only have to name things.
function Offer({
  periodId,
  onPeriod,
  facts,
  firstEntryAt,
  factsError,
  onBuy,
}: {
  periodId: ReportPeriodId;
  onPeriod: (id: ReportPeriodId) => void;
  facts: ReportFacts | null;
  /** When logging started, for the "all time" row. Null until it is known. */
  firstEntryAt: string | null;
  factsError: string | null;
  onBuy: () => void;
}) {
  const copy = facts ? describeEligibility(facts, periodId) : null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader className="text-review-muted">
        A review of your spending
      </SectionHeader>
      <div className="overflow-hidden rounded-card bg-review-card ring-1 ring-inset ring-white/10">
        <p className="px-4 pt-4 text-[15px] text-review-text">
          Your own numbers, read back to you.
        </p>

        <div
          role="radiogroup"
          aria-label="What the review covers"
          className="mt-4 divide-y divide-white/10 border-y border-white/10"
        >
          {REPORT_PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === periodId}
              onClick={() => onPeriod(option.id)}
              className="press flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="flex flex-col">
                <span className="text-base text-review-text">
                  {option.label}
                </span>
                <span className="text-xs text-review-muted">
                  {reportPeriodLabel(option.id, undefined, firstEntryAt)}
                </span>
              </span>
              {option.id === periodId && (
                <Check
                  className="h-5 w-5 shrink-0 text-carrot"
                  strokeWidth={2.5}
                />
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 p-4">
          {factsError !== null && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-expense">Reviews aren&apos;t set up yet.</p>
              <p className="break-words text-xs text-review-muted">{factsError}</p>
            </div>
          )}
          {facts !== null && copy !== null && (
            <Standing facts={facts} copy={copy} />
          )}

          <button
            type="button"
            disabled={copy === null || !copy.ok}
            onClick={onBuy}
            className="press rounded-pill bg-carrot py-3.5 text-lg font-semibold text-surface shadow-carrot transition disabled:bg-white/10 disabled:text-review-muted disabled:shadow-none"
          >
            {copy === null
              ? "Can't check your history"
              : !copy.ok
                ? "Not enough logged yet"
                : REVIEW_BILLING === "off"
                  ? "Write my review"
                  : `Unlock a review · ${reviewPriceLabel()}`}
          </button>

          {/* Two short lines rather than a paragraph of small print: the same
              four facts — what leaves, what never does, what happens to the
              result, what it costs — and neither line over 70 characters. */}
          <div className="flex flex-col gap-0.5 text-center text-xs leading-relaxed text-review-muted">
            <p>Totals only — Gemini writes it, your notes stay here.</p>
            <p>
              {REVIEW_BILLING === "off"
                ? "Encrypted with your key. Free while it's being tried out."
                : "Encrypted with your key. One-time, per review."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Where this account stands: the server's own counts, then what is missing.
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
        <span className="text-sm text-review-muted">Expenses logged</span>
        <span className="font-numeric text-sm font-bold tabular-nums text-review-text">
          {facts.spendCount} / {facts.minSpendEntries}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-review-muted">Days with entries</span>
        <span className="font-numeric text-sm font-bold tabular-nums text-review-text">
          {facts.loggedDays} / {facts.periodDays}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-pill bg-white/10"
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
        <p key={blocker} className="text-sm text-review-text">
          {blocker}
        </p>
      ))}
      {copy.warnings.map((warning) => (
        <p key={warning} className="text-sm text-review-muted">
          {warning}
        </p>
      ))}
    </div>
  );
}

// Past reviews. The list itself is never secret — the writing is — so dates and
// prices show, and on the passphrase tier opening one asks for that passphrase.
function Archive({
  rows,
  busy,
  locked,
  openId,
  onUnlock,
  onShow,
}: {
  rows: SpendingReviewRow[];
  busy: boolean;
  locked: boolean;
  openId: string | null;
  onUnlock: (passphrase: string) => boolean;
  onShow: (row: SpendingReviewRow) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader className="text-review-muted">Your reviews</SectionHeader>
      {locked ? (
        <Card>
          <PassphraseForm
            id="review-passphrase-unlock"
            label="Enter your encryption passphrase"
            hint="The same one that unlocks your amounts."
            submitLabel="Unlock"
            onSubmit={onUnlock}
          />
        </Card>
      ) : null}
      <div className="divide-y divide-white/10 overflow-hidden rounded-card bg-review-card ring-1 ring-inset ring-white/10">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={locked || busy}
            onClick={() => onShow(row)}
            className="press flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left disabled:opacity-60"
          >
            <span className="flex flex-col">
              <span className="text-base text-review-text">
                {reviewWindowLabelFor(row)}
              </span>
              <span className="text-xs text-review-muted">
                {statusLine(row)}
              </span>
            </span>
            {row.id === openId ? (
              <Check className="h-5 w-5 shrink-0 text-carrot" strokeWidth={2.5} />
            ) : (
              <Sparkles
                className="h-4 w-4 shrink-0 text-review-muted"
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
  if (row.status === "pending") return "Not paid — nothing was charged";
  // A free grant is priced at zero and was never paid for, so it does not get
  // told it was: reviewPrice() renders that row as "Free".
  if (!row.body_enc) {
    return row.price_cents === 0
      ? `${price} · tap to write it`
      : `Paid ${price} · tap to write it`;
  }
  return `${price} · tap to read`;
}

// One passphrase field. Kept dumb: the caller decides what a submit means and
// whether it worked. The check is local — a string compare against the
// passphrase this device already unlocked with — so there is nothing to await.
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
  onSubmit: (passphrase: string) => boolean;
}) {
  const [value, setValue] = useState("");
  const [failed, setFailed] = useState(false);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value === "") return;
        setFailed(false);
        if (onSubmit(value)) setValue("");
        else setFailed(true);
      }}
    >
      <label className="text-sm font-semibold text-review-text" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        className="rounded-card bg-review-tile px-4 py-3 text-base text-review-text"
      />
      <p className="text-xs text-review-muted">{hint}</p>
      {failed && <p className="text-sm text-expense">That didn&apos;t match.</p>}
      <button
        type="submit"
        disabled={value === ""}
        className="press rounded-pill bg-carrot py-3 text-base font-semibold text-surface transition disabled:bg-white/10 disabled:text-review-muted"
      >
        {submitLabel}
      </button>
    </form>
  );
}
