import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import { useThemeColor } from "@/lib/useThemeColor";
import { useFloorColor } from "@/lib/useFloorColor";
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
  type ReportPeriodId,
} from "@/lib/reportPeriod";
import type { Transaction } from "@/types/db";

// The review: this account's own spending, charted, in its own calm blue room.
//
// EVERY FIGURE ON THIS SCREEN IS THIS DEVICE'S. The rows are read from the
// database as ciphertext, decrypted here, and totalled here
// (lib/reportDigest) — nothing is sent anywhere to produce any of it, and the
// whole screen works with no network beyond the read. That is not a privacy
// footnote, it is the reason the screen can show this much: the server could
// not compute a single number on it if it wanted to, because it cannot read the
// amounts.
//
// There were AI-written findings under these charts once, in the voice of the
// reader's dad. They are gone, along with the archive, the eligibility gate and
// the machinery that sold them. What is left is the part that was always doing
// the work: the arithmetic, drawn.
//
// TWO WINDOWS, and they are windows rather than a date picker on purpose.
// "Recent months" reaches three months back, "All time" to the account's first
// entry, and both end NOW — so the page is a snapshot, and opening it tomorrow
// covers a day more. The bounds are computed from the local calendar in
// lib/reportPeriod; nothing here reads a date the user chose, because there is
// nothing to choose.
export function Review() {
  const { locked, loading, userId, homeCurrency, reviewRange } = useStore();

  // Pinned at mount. Both windows end "now", and a `now` that moved on every
  // render would rebuild every digest and chart on every render with it.
  const [now] = useState(() => new Date());
  const [scope, setScope] = useState<ReportPeriodId>(DEFAULT_REPORT_PERIOD);

  // Every entry this account has, decrypted here. Both windows are slices of
  // these: "recent" is a slice of "all time", so slicing locally costs nothing
  // and asking twice would decrypt most of the account twice.
  const [entries, setEntries] = useState<Transaction[] | null>(null);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  useEffect(() => {
    if (locked || loading) return;
    let live = true;
    void (async () => {
      // `reviewRange`, not the store's `transactions`: that list is capped at
      // the newest FETCH_CAP rows, and an all-time breakdown has to see every
      // row or its totals are quietly wrong.
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

  useEffect(() => {
    posthog.capture("review_viewed", { period: scope });
  }, [scope]);

  // When logging started, so "all time" starts where the account does rather
  // than at the epoch — which would otherwise chart years of empty days.
  const anchor = useMemo(() => {
    if (entries === null || entries.length === 0) return null;
    let oldest = entries[0].occurred_at;
    for (const e of entries) if (e.occurred_at < oldest) oldest = e.occurred_at;
    return oldest;
  }, [entries]);

  const scopeWindow = useMemo(
    () => ({ id: scope, ...reportPeriodBounds(scope, now, anchor) }),
    [scope, now, anchor],
  );
  const digest = useMemo(
    () => (entries === null ? null : buildDigest(entries, scopeWindow, homeCurrency)),
    [entries, scopeWindow, homeCurrency],
  );
  const days = useMemo(
    () => (entries === null ? [] : daySpendSeries(entries, scopeWindow)),
    [entries, scopeWindow],
  );
  // Named subscriptions, found on the device from the notes the reader typed.
  // Note text has never left this phone and never will, which is exactly why
  // this section can name a charge at all.
  const recurring = useMemo(
    () => (entries === null ? null : detectRecurring(entries, userId, now)),
    [entries, userId, now],
  );

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

  return (
    <Shell>
      <ScopePicker scope={scope} onPick={setScope} />

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

      <p className="px-2 text-center text-xs text-review-muted">
        Every figure here was worked out on this device, from what you logged.
      </p>
    </Shell>
  );
}

// The room. Darker than the tracker, and a calm blue rather than the Safe's
// green vault, so the two dark screens are never mistaken for one another.
// Carrot stays the accent, so it still reads as this app after dark. The
// mechanics are the Safe's: the gradient is painted on the scrolling content
// and a fixed floor sits behind it, because a collapsing browser toolbar and an
// overscroll bounce would otherwise flash the light body canvas through.
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

// Which window is on screen. A segmented pill, the same control the month
// switcher uses — and still two fixed spans rather than a date picker: this
// only says which one you are looking at.
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
      aria-label="Which window"
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
