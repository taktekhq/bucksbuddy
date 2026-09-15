import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, Lock, Sparkles } from "lucide-react";
import { useThemeColor } from "@/lib/useThemeColor";
import { useFloorColor } from "@/lib/useFloorColor";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ReviewDocument } from "@/components/ReviewDocument";
import { ReviewBreakdown } from "@/components/ReviewBreakdown";
import { navigate } from "@/lib/router";
import { useStore } from "@/lib/store";
import posthog from "@/lib/posthog";
import { buildDigest, daySpendSeries } from "@/lib/reportDigest";
import { detectRecurring } from "@/lib/recurring";
import {
  DEFAULT_REPORT_PERIOD,
  REPORT_PERIODS,
  reportPeriodBounds,
  reportWindowLabel,
  periodName,
  isKnownPeriodId,
  type ReportPeriodId,
} from "@/lib/reportPeriod";
import { describeEligibility, type ReportFacts } from "@/lib/reportEligibility";
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
import type { SpendingReview, SpendingReviewRow, Transaction } from "@/types/db";

// The spending review, in its own calm blue room.
//
// THE ORDER OF THIS SCREEN IS THE DESIGN. It reads numbers first: a scope, then
// the whole window drawn as charts and figures, then — underneath it — the one
// short set of findings a model wrote about them, then earlier reviews. It used
// to read the other way round, leading with the offer and the buttons, which
// put the chrome above the thing the chrome is for.
//
// The split of labour behind that order: everything money-shaped is computed on
// THIS DEVICE, over rows only this device can decrypt (lib/reportDigest), and
// the charts are drawn from those figures directly. The model never computes
// anything and never sees a note. So the breakdown is exact whether or not a
// review has ever been written, and the review is judgement rather than
// arithmetic — the only part of this a language model is actually good at.
//
// Two reviews, not a choice of window: "Recent months" and "All time". The
// scope switch at the top moves both the breakdown and which review is on
// offer, so there is one thing on screen at a time instead of two stacked
// offers. Each window ends NOW, which makes a review a snapshot: the window it
// was written for is stored on its own row and the archive labels each one with
// that window rather than with today's.
//
// The archive is behind the passphrase the account already has, never a second
// one to remember. On the passphrase tier a past review asks for that same
// passphrase once per app open — checked against the one this device unlocked
// with, so it is the secret that already gates every amount. On the default tier
// there is nothing to ask: the only passphrase is the constant compiled into the
// bundle, and a lock whose key is published is not a lock. Either way the body
// is encrypted with the account's master key, so a review is exactly as
// confidential as the numbers it was written from.
//
// While billing is off, an allowlisted account gets its review immediately: the
// row comes back already paid at a price of zero, so there is no redirect and
// nothing to wait for. The Stripe return path below stays live for when it isn't.

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
  const {
    locked,
    loading,
    userId,
    e2eMode,
    passphrase,
    homeCurrency,
    reviewRange,
    sealReview,
    openReview,
  } = useStore();

  // The archive's gate, or null when there is nothing worth asking for. On the
  // passphrase tier it is the account's own encryption passphrase, as this
  // device unlocked with it; on the default tier the only passphrase in play is
  // the public constant, so the archive is open to whoever can already read the
  // amounts it was written from.
  const gate = e2eMode === "passphrase" ? passphrase : null;

  // Pinned at mount. Both windows end "now", and a `now` that moved on every
  // render would rebuild every digest and chart on every render with it.
  const [now] = useState(() => new Date());
  const [scope, setScope] = useState<ReportPeriodId>(DEFAULT_REPORT_PERIOD);

  // Where the account stands for each of the two reviews. They have different
  // windows, so they have different counts: 40 expenses all time is not 40 in
  // the last three months.
  const [standing, setStanding] = useState<
    Record<ReportPeriodId, ReportFacts | null>
  >({ last_3_months: null, all_time: null });
  // When this account's logging started, as the last eligibility answer reported
  // it. Only "all time" needs it — and the rows below carry the same fact, so
  // this is the faster of two answers rather than the only one.
  const [firstEntryAt, setFirstEntryAt] = useState<string | null>(null);
  const [factsError, setFactsError] = useState<string | null>(null);
  // Every entry this account has, decrypted here. The breakdown is drawn from
  // these; both windows are slices of them.
  const [entries, setEntries] = useState<Transaction[] | null>(null);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [rows, setRows] = useState<SpendingReviewRow[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [open, setOpen] = useState<{
    row: SpendingReviewRow;
    review: SpendingReview;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRows = useCallback(async () => {
    const { reviews, error: listError } = await listReviews();
    setRows(reviews);
    return { reviews, error: listError };
  }, []);

  // Write a review that has been paid for: read the window, total it here, have
  // it written, then seal it with the account's own key and store that.
  //
  // It reads the window again rather than reusing `entries`, which were read at
  // mount: a review is the one thing on this screen that costs something, and
  // its figures must come from a read taken for it.
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
      const windowRows = await reviewRange(from, to);
      // Null means the rows could not be read — the encryption vault is still
      // unwrapping (its 600k-iteration derive runs in the provider's effect,
      // after this screen's), or a page failed. Either way, refuse: a review
      // written from what we could not read would be a paid page of zeroes, and
      // this returns before generateReview so the attempt is not spent.
      if (windowRows === null || windowRows.length === 0) {
        setBusy(null);
        setError("Couldn't read your entries. Nothing used up — tap to retry.");
        return;
      }
      const digest = buildDigest(
        windowRows,
        { id: row.period_id, from, to },
        row.home_currency,
      );
      setBusy("Asking the auditor…");
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
      // Eligibility is the standing effect's job — it runs on mount too, so
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

  // Both standings, once, on mount. Nothing moves any more — there is no picker
  // — so there is nothing to re-count.
  useEffect(() => {
    let live = true;
    void (async () => {
      const answers = await Promise.all(
        REPORT_PERIODS.map(async (p) => ({
          id: p.id,
          ...(await fetchEligibility(p.id)),
        })),
      );
      if (!live) return;
      const next: Record<ReportPeriodId, ReportFacts | null> = {
        last_3_months: null,
        all_time: null,
      };
      for (const a of answers) {
        next[a.id] = a.facts;
        posthog.capture("review_gate_seen", {
          period: a.id,
          eligible: a.facts?.ok ?? null,
          expenses_logged: a.facts?.spendCount ?? null,
          days_logged: a.facts?.loggedDays ?? null,
          days_in_period: a.facts?.periodDays ?? null,
        });
      }
      setStanding(next);
      // One anchor for both: the account's first entry is a property of the
      // account, and every answer carries the same one.
      setFirstEntryAt(answers.find((a) => a.facts !== null)?.facts?.firstEntryAt ?? null);
      // Either answer failing means the same thing — the function is missing or
      // the database refused — so the first message is the one worth showing.
      setFactsError(answers.find((a) => a.error !== null)?.error ?? null);
    })();
    return () => {
      live = false;
    };
  }, []);

  // Every entry, once the vault is open. One read for both scopes: "recent" is
  // a slice of "all time", so slicing locally costs nothing and asking twice
  // would decrypt most of the account twice.
  useEffect(() => {
    if (locked || loading) return;
    let live = true;
    void (async () => {
      const all = await reviewRange(new Date(0), now);
      if (!live) return;
      if (all === null) {
        setEntriesError("Couldn't read your entries on this device.");
        return;
      }
      setEntries(all);
      setEntriesError(null);
    })();
    return () => {
      live = false;
    };
  }, [locked, loading, reviewRange, now]);

  // When logging started. The eligibility answer is the authority, and the rows
  // hold the same fact — so whichever arrives is used, and the breakdown does
  // not wait on a round trip it already has the answer to.
  const anchor = useMemo(() => {
    if (firstEntryAt !== null) return firstEntryAt;
    if (entries === null || entries.length === 0) return null;
    let oldest = entries[0].occurred_at;
    for (const e of entries) if (e.occurred_at < oldest) oldest = e.occurred_at;
    return oldest;
  }, [firstEntryAt, entries]);

  // Named `scopeWindow`, not `window`: the Stripe redirect below is a plain
  // assignment to the real `window.location`, and a local of that name would
  // shadow it for the whole component.
  const scopeWindow = useMemo(
    () => ({ id: scope, ...reportPeriodBounds(scope, now, anchor) }),
    [scope, now, anchor],
  );
  const digest = useMemo(
    () =>
      entries === null ? null : buildDigest(entries, scopeWindow, homeCurrency),
    [entries, scopeWindow, homeCurrency],
  );
  const days = useMemo(
    () => (entries === null ? [] : daySpendSeries(entries, scopeWindow)),
    [entries, scopeWindow],
  );
  // Named subscriptions, found on the device from the notes the reader typed.
  // This is the one thing on screen the model is never given: note text does
  // not leave the phone, so the app can name a charge where the auditor can
  // only describe one.
  const recurring = useMemo(
    () => (entries === null ? null : detectRecurring(entries, userId, now)),
    [entries, userId, now],
  );

  // The newest written review for the scope on screen. Opening it is what the
  // auditor section shows, so switching scope switches the findings under the
  // charts rather than burying both in a list.
  const latest = useMemo(
    () => rows.find((r) => r.period_id === scope && r.body_enc !== null) ?? null,
    [rows, scope],
  );

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

  // Which scopes have already had their newest review opened for the reader.
  // A ref, not state: it must not re-run the effect that writes it, and once a
  // scope has been opened the screen belongs to whoever is reading it.
  const autoOpened = useRef<Set<ReportPeriodId>>(new Set());

  // Open the scope's newest review without being asked — landing on the page
  // should show the figures AND the latest findings, not a button that reveals
  // them. ONCE per scope: tapping an earlier review from the archive replaces
  // what is open, and re-asserting the newest one over that would make the two
  // fight each other forever.
  //
  // Nothing is decrypted that the reader has not already unlocked: on the
  // passphrase tier this waits for the gate, which is the account's own
  // passphrase.
  useEffect(() => {
    if (latest === null || busy !== null) return;
    if (gate !== null && !unlocked) return;
    if (autoOpened.current.has(scope)) return;
    autoOpened.current.add(scope);
    void show(latest);
  }, [latest, scope, gate, unlocked, busy, show]);

  const buy = useCallback(async () => {
    setError(null);
    setBusy("Starting your review…");
    const { reviewId, url, free, error: startError } = await startReview(
      scope,
      homeCurrency,
      // Only "all time" reads this. The server clamps the window to the
      // account's own first entry either way (migration 0011).
      anchor,
    );
    if (startError !== null) {
      setBusy(null);
      setError(startError);
      return;
    }
    posthog.capture("review_started", { period: scope, free });
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
  }, [scope, homeCurrency, anchor, refreshRows, write]);

  if (locked) {
    return (
      <Shell>
        <Card>
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-review-muted" />
            <p className="text-[15px] text-review-text">
              Unlock your amounts in Settings to see your review.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  const facts = standing[scope];
  const copy = facts ? describeEligibility(facts, scope) : null;

  return (
    <Shell>
      <ScopePicker scope={scope} onPick={setScope} />

      {error !== null && (
        <Card>
          <p className="text-[15px] leading-relaxed text-expense">{error}</p>
        </Card>
      )}

      {digest !== null ? (
        <ReviewBreakdown
          digest={digest}
          days={days}
          recurring={recurring}
          homeCurrency={homeCurrency}
        />
      ) : (
        <Card>
          <p className="text-center text-[15px] text-review-muted" role="status">
            {entriesError ?? "Adding up your entries…"}
          </p>
        </Card>
      )}

      {busy !== null ? (
        <Card>
          <p className="text-center text-[15px] text-review-text" role="status">
            {busy}
          </p>
        </Card>
      ) : open !== null && open.row.period_id === scope ? (
        <ReviewDocument
          review={open.review}
          subtitle={reviewWindowLabelFor(open.row)}
        />
      ) : (
        <Offer facts={facts} copy={copy} factsError={factsError} onBuy={buy} />
      )}

      {/* The gate stays with the archive rather than with the auditor slot: it
          is what unlocks READING past reviews, and an account whose only rows
          are refunded or unwritten still needs somewhere to enter it, or those
          rows sit disabled with nothing to explain them. */}
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
 * What a stored review covered: "Recent months · August 2026 – September 2026".
 * The name has to be there — both windows end when they were asked for, so their
 * month spans can be identical and the dates alone would not say which review
 * this is.
 */
function reviewWindowLabelFor(row: SpendingReviewRow): string {
  const span = reportWindowLabel(
    new Date(row.period_from),
    new Date(row.period_to),
  );
  // A row can carry a window this version has never heard of — a newer build
  // wrote it — and then the dates are all there is to show.
  return isKnownPeriodId(row.period_id)
    ? `${periodName(row.period_id)} · ${span}`
    : span;
}

// The review's own dark room — a different mentality from the bright daily
// tracker, and a calm blue rather than the Safe's green vault, so the two dark
// screens are never mistaken for one another. Carrot stays the accent, so it
// still reads as this app after dark. The mechanics are the Safe's: the gradient
// is painted on the scrolling content and a fixed floor sits behind it, because
// a collapsing browser toolbar and an overscroll bounce would otherwise flash
// the light body canvas through.
const ROOM_BG =
  "linear-gradient(180deg, #123A56 0px, #0D2C42 320px, #0A2233 640px)";
const ROOM_FLOOR = "#0A2233";

function Shell({ children }: { children: ReactNode }) {
  // Tint the status bar to match the top of the room, and paint the document
  // floor too — without the second one, web Safari's collapsing toolbar and an
  // overscroll bounce flash the light canvas at the edges of the dark room. The
  // Safe and the rabbit hole both do exactly this.
  useThemeColor("#123A56");
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

// Which of the two reviews is on screen. A segmented pill, the same control the
// month switcher uses — and still two products rather than a window picker: the
// spans are fixed, this only says which one you are looking at.
function ScopePicker({
  scope,
  onPick,
}: {
  scope: ReportPeriodId;
  onPick: (id: ReportPeriodId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Which review"
      className="flex gap-1 rounded-pill bg-white/5 p-1 ring-1 ring-inset ring-white/10"
    >
      {REPORT_PERIODS.map((period) => {
        const on = period.id === scope;
        return (
          <button
            key={period.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onPick(period.id)}
            className={`press flex-1 rounded-pill py-2 text-sm font-semibold transition ${
              on
                ? "bg-review-tile text-review-text shadow-segment"
                : "text-review-muted"
            }`}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}

// What the auditor would cost, and whether this account has enough logged for
// one. Only shown when there is no review to read for this scope: the counters
// are a gate, not a permanent fixture, so they disappear the moment they are
// satisfied and a review exists.
function Offer({
  facts,
  copy,
  factsError,
  onBuy,
}: {
  facts: ReportFacts | null;
  copy: { ok: boolean; blockers: string[]; warnings: string[] } | null;
  factsError: string | null;
  onBuy: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader className="text-review-muted">The auditor</SectionHeader>
      <div className="flex flex-col gap-3 rounded-card bg-review-card p-4 ring-1 ring-inset ring-white/10">
        <div className="flex items-start gap-3">
          <Sparkles
            className="mt-0.5 h-5 w-5 shrink-0 text-carrot"
            strokeWidth={2.5}
            aria-hidden
          />
          <p className="text-[15px] leading-relaxed text-review-text">
            A short read of the figures above: what is working, what is worth a
            look, and what might cost less.
          </p>
        </div>

        {factsError !== null && (
          <p className="break-words text-xs text-expense">{factsError}</p>
        )}

        {/* Only when it is not yet possible. Once it is, the counters are noise
            — the button says everything left to say. */}
        {facts !== null && copy !== null && !copy.ok && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-review-muted">Expenses logged</span>
              <span className="font-numeric text-sm font-bold tabular-nums text-review-text">
                {facts.spendCount} / {facts.minSpendEntries}
              </span>
            </div>
            {copy.blockers.map((blocker) => (
              <p key={blocker} className="text-sm text-review-text">
                {blocker}
              </p>
            ))}
          </div>
        )}

        <button
          type="button"
          disabled={copy === null || !copy.ok}
          onClick={onBuy}
          className="press rounded-pill bg-carrot py-3 text-base font-semibold text-surface shadow-carrot transition disabled:bg-white/10 disabled:text-review-muted disabled:shadow-none"
        >
          {copy === null
            ? "Can't check your history"
            : !copy.ok
              ? "Not enough logged yet"
              : REVIEW_BILLING === "off"
                ? "Ask the auditor"
                : `Ask the auditor · ${reviewPriceLabel()}`}
        </button>
        <p className="text-center text-xs text-review-muted">
          One a month. Totals only — your notes stay on this phone.
        </p>
      </div>
    </section>
  );
}

// Everything written before the one on screen. The list itself is never secret
// — the writing is — so dates and prices show either way.
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
  const earlier = rows.filter((row) => row.id !== openId);
  if (earlier.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader className="text-review-muted">Earlier reviews</SectionHeader>
      {locked && (
        <Card>
          <PassphraseForm
            id="review-passphrase-unlock"
            label="Enter your encryption passphrase"
            hint="The same one that unlocks your amounts."
            submitLabel="Unlock"
            onSubmit={onUnlock}
          />
        </Card>
      )}
      <div className="divide-y divide-white/10 overflow-hidden rounded-card bg-review-card ring-1 ring-inset ring-white/10">
        {earlier.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={locked || busy}
            onClick={() => onShow(row)}
            className="press flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left disabled:opacity-60"
          >
            <span className="flex flex-col">
              <span className="text-[15px] text-review-text">
                {reviewWindowLabelFor(row)}
              </span>
              <span className="text-xs text-review-muted">{statusLine(row)}</span>
            </span>
            <Sparkles
              className="h-4 w-4 shrink-0 text-review-muted"
              aria-hidden
            />
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
