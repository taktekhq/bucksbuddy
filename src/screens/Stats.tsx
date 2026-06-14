import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Carrot } from "@/components/ui/Carrot";
import { SparkArea } from "@/components/ui/SparkArea";
import { StatBars, type StatBarItem } from "@/components/ui/StatBars";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { monthLabel } from "@/lib/dates";
import { formatUsdCents } from "@/lib/money";
import { dailySpendSeries, monthInsights, topCategories } from "@/lib/stats";
import { fetchPublicStats, type PublicStats } from "@/lib/publicStats";

// The stats page — a deep indigo "observatory" you climb up to and look at
// your money from, deliberately distinct from History's charcoal rabbit hole
// and the Safe's green vault. It's half-public: signed-in users get their own
// breakdown (App wraps this route in the store only then), while signed-out
// visitors get the community numbers — those come from an aggregate-only rpc,
// so there's nothing personal to leak.
const OBSERVATORY_BG =
  "linear-gradient(180deg, #23234A 0px, #1B1B38 220px, #141428 460px)";
const OBSERVATORY_FLOOR = "#141428";

export function Stats({ signedIn }: { signedIn: boolean }) {
  // Tint the status bar to match the top of the page.
  useThemeColor("#23234A");

  return (
    <main
      className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-white"
      style={{ background: OBSERVATORY_BG }}
    >
      {/* Fixed floor behind the content so a collapsing browser toolbar or an
          overscroll bounce can never flash the light body canvas through. (Same
          trick as Safe / History.) */}
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ background: OBSERVATORY_FLOOR, zIndex: -1 }}
      />

      {/* Dark nav: back chevron + centered title. For signed-out visitors "/"
          is the landing page, so Back always lands somewhere sensible. */}
      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          {signedIn ? "Your Stats" : "Stats"}
        </h1>
      </header>

      {signedIn ? <PersonalStats /> : <PublicTeaser />}
      <CommunityStats />
    </main>
  );
}

// Section titles wear Grobold like everywhere else in the app (SectionHeader
// is its grey-canvas twin; this one sits on the dark observatory).
function Caption({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 font-display text-sm font-semibold uppercase tracking-wide text-white/60">
      {children}
    </h2>
  );
}

// A small stat chip: tiny caption, big numeric value, optional one-liner.
// Give it an onClick and it becomes a button with a disclosure chevron —
// some chips open the receipts page behind their number.
function Fact({
  caption,
  value,
  sub,
  onClick,
}: {
  caption: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/55">
        {caption}
        {onClick && <ChevronRight className="h-3.5 w-3.5 text-white/40" strokeWidth={2.5} />}
      </p>
      <p className="mt-1 font-numeric text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-white/55">{sub}</p>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="press rounded-card bg-white/10 px-4 py-3 text-left"
      >
        {body}
      </button>
    );
  }
  return <div className="rounded-card bg-white/10 px-4 py-3">{body}</div>;
}

// Stand-in for a fun fact that has no data yet — the chip still shows, it just
// wears an em-dash instead of vanishing and leaving a hole in the grid.
const EMPTY = "—";

/** "Sun, Jun 7" from a local "YYYY-MM-DD" key (noon dodges TZ edges). */
function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "1 entry" / "3 entries" — the fact chips shouldn't say "1 days". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** How long the safe lasts: short runways in days, long ones in months. */
function runwayLabel(days: number): string {
  if (days >= 60) return `${(days / 30.44).toFixed(1)} months`;
  return count(days, "day", "days");
}

// The signed-in half. Lives in its own component so the top-level Stats never
// touches useStore() — signed-out renders have no StoreProvider above them.
function PersonalStats() {
  const { transactions, locked, safeTotalCents } = useStore();
  const series = useMemo(() => dailySpendSeries(transactions, 30), [transactions]);
  const cats = useMemo(() => topCategories(transactions), [transactions]);
  const facts = useMemo(() => monthInsights(transactions), [transactions]);

  const barItems = useMemo<StatBarItem[]>(() => {
    const top = Math.max(...cats.map((c) => c.totalCents), 1);
    return cats.map((c) => ({
      id: c.category,
      label: categoryLabel(c.category),
      icon: categoryIcon(c.category),
      color: categoryColor(c.category),
      value: formatUsdCents(c.totalCents),
      fraction: c.totalCents / top,
    }));
  }, [cats]);

  // While locked, money values are masked zeros — every stat would be a lie,
  // so the page keeps its shape but wears the cipher: no graphs, and real
  // fragments of the user's own ciphertext stand in for the numbers (same
  // convention as the masked history rows). Community numbers stay public.
  const cipherBits = transactions
    .map((t) => t.amountMask)
    .filter((m): m is string => m != null);
  const garble = (i: number) => cipherBits[i % cipherBits.length] ?? "••••";

  if (locked || facts.anyMasked) {
    return (
      <>
        <section className="rounded-card bg-white/10 px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            {monthLabel()}
          </p>
          <p className="mt-1 font-numeric text-4xl font-bold tabular-nums text-white/45">
            ${garble(0)}
          </p>
          <p className="mt-0.5 text-sm text-white/55">amounts locked</p>
        </section>

        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="press flex w-full items-center gap-3 rounded-card bg-white/10 px-4 py-3.5 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Lock className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-sm text-white/85">
            Your stats are encrypted. Enter your passphrase in Settings to see
            them.
          </span>
        </button>

        <section className="flex flex-col gap-2">
          <Caption>Fun facts</Caption>
          <div className="grid grid-cols-2 gap-2 opacity-60">
            <Fact caption="Biggest splurge" value={`$${garble(1)}`} />
            <Fact caption="Busiest day" value={garble(2)} />
            <Fact caption="Safe runway" value={garble(3)} />
            <Fact caption="On pace for" value={`$${garble(4)}`} />
            <Fact caption="Treat yourself" value={`$${garble(5)}`} />
            <Fact caption="Weekend Spend" value={garble(6)} />
            <Fact caption="Coffee runs" value={garble(7)} />
            <Fact caption="No-spend days" value={garble(8)} />
          </div>
        </section>
      </>
    );
  }

  const hasAny = facts.spendCount > 0 || series.some((p) => p.count > 0);
  if (!hasAny) {
    return (
      <section className="rounded-card bg-white/10 px-5 py-10 text-center text-white/55">
        Nothin&apos; to chart yet, Doc. Log a few entries and come back.
      </section>
    );
  }

  const flow = facts.incomeCents + facts.spentCents;
  const inPct = (facts.incomeCents / Math.max(flow, 1)) * 100;

  // How many days the safe's cash would cover at this month's pace.
  const runwayDays =
    facts.avgPerDayCents > 0
      ? Math.round(safeTotalCents / facts.avgPerDayCents)
      : 0;

  return (
    <>
      {/* Headline: the month so far. The daily rhythm isn't given a slot of
          its own. It fills the whole card as a backdrop and the numbers sit
          on top of it. */}
      <section className="relative overflow-hidden rounded-card bg-white/10">
        <SparkArea
          values={series.map((p) => p.totalCents)}
          stroke="rgba(245, 99, 0, 0.55)"
          fill="rgba(245, 99, 0, 0.16)"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {/* min-h matches the Home hero card exactly, so tapping the hero
            lands on the same card with the same chart — only the room gets
            darker. (Keep in sync with Home.tsx.) */}
        <div className="relative flex min-h-[188px] flex-col px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            {monthLabel()}
          </p>
          <p className="mt-1 font-numeric text-4xl font-bold tabular-nums">
            {formatUsdCents(facts.spentCents)}
          </p>
          <p className="mt-0.5 text-sm text-white/55">
            ≈ {formatUsdCents(facts.avgPerDayCents)} a day
          </p>
          <p className="mt-auto text-right text-[11px] uppercase tracking-wide text-white/45">
            spent per day · last 30 days
          </p>
        </div>
      </section>

      {barItems.length > 0 && (
        <section className="flex flex-col gap-2">
          <Caption>Where it goes</Caption>
          <div className="rounded-card bg-white/10 p-4">
            <StatBars items={barItems} />
          </div>
        </section>
      )}

      {/* Pairs by design: splurge|busiest, runway|forecast, treats|weekend,
          coffee|no-spend — then the in-vs-out bar across the bottom. Every chip
          always renders: a fun fact with no data yet shows an em-dash rather
          than vanishing and leaving a hole in the grid. */}
      <section className="flex flex-col gap-2">
        <Caption>Fun facts</Caption>
        <div className="grid grid-cols-2 gap-2">
          <Fact
            caption="Biggest splurge"
            value={
              facts.biggestExpense
                ? formatUsdCents(facts.biggestExpense.amount_usd_cents)
                : EMPTY
            }
            sub={
              facts.biggestExpense
                ? [categoryLabel(facts.biggestExpense.category), facts.biggestExpense.note]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
          />
          <Fact
            caption="Busiest day"
            value={facts.busiestDay ? count(facts.busiestDay.count, "entry", "entries") : EMPTY}
            sub={
              facts.busiestDay
                ? `${dayLabel(facts.busiestDay.date)} · ${formatUsdCents(facts.busiestDay.totalCents)}`
                : undefined
            }
          />
          <Fact
            caption="Safe runway"
            value={runwayDays > 0 ? runwayLabel(runwayDays) : EMPTY}
            sub={runwayDays > 0 ? "at this pace" : undefined}
          />
          <Fact
            caption="On pace for"
            value={facts.forecastCents > 0 ? formatUsdCents(facts.forecastCents) : EMPTY}
            sub={facts.forecastCents > 0 ? "by month's end" : undefined}
          />
          <Fact
            caption="Treat yourself"
            value={facts.treatCents > 0 ? formatUsdCents(facts.treatCents) : EMPTY}
            // Only tappable when there are receipts behind it.
            onClick={facts.treatCents > 0 ? () => navigate("/stats/treats") : undefined}
          />
          <Fact
            caption="Weekend Spend"
            value={facts.weekendCents > 0 ? formatUsdCents(facts.weekendCents) : EMPTY}
            onClick={facts.weekendCents > 0 ? () => navigate("/stats/weekend") : undefined}
          />
          <Fact caption="Coffee runs" value={String(facts.coffeeCount)} />
          <Fact caption="No-spend days" value={String(facts.noSpendDays)} />
          {flow > 0 && (
            <div className="col-span-2 rounded-card bg-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                In vs out
              </p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-pill bg-white/10">
                <div
                  className="h-full"
                  style={{ width: `${inPct}%`, backgroundColor: "#34C759" }}
                />
                <div className="h-full flex-1" style={{ backgroundColor: "#FF3B30" }} />
              </div>
              <div className="mt-1.5 flex justify-between font-numeric text-xs font-semibold tabular-nums">
                <span className="text-income">+{formatUsdCents(facts.incomeCents)}</span>
                <span className="text-expense">-{formatUsdCents(facts.spentCents)}</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// What a signed-out visitor sees where the personal section would be.
function PublicTeaser() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-card bg-white/10 px-5 py-8 text-center">
      <Carrot className="text-5xl" />
      <p className="text-base text-white/85">
        Wabbits get their own spending picture here.
      </p>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="press rounded-pill bg-carrot px-6 py-2.5 text-base font-semibold text-white"
      >
        Hop in
      </button>
    </section>
  );
}

// The community numbers — viewable by everyone, signed in or out.
function CommunityStats() {
  // undefined = still counting; null = rpc unavailable (offline, or the
  // migration hasn't been applied yet) — show a quiet fallback either way.
  const [stats, setStats] = useState<PublicStats | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const communityBars = useMemo<StatBarItem[]>(() => {
    const cats = stats?.topCategories ?? [];
    const top = Math.max(...cats.map((c) => c.count), 1);
    return cats.map((c) => ({
      id: c.category,
      label: categoryLabel(c.category),
      icon: categoryIcon(c.category),
      color: categoryColor(c.category),
      value: c.count.toLocaleString("en-US"),
      fraction: c.count / top,
    }));
  }, [stats]);

  return (
    <section className="flex flex-col gap-2">
      <Caption>Across BucksBuddy</Caption>
      {stats === undefined ? (
        <p className="rounded-card bg-white/10 px-4 py-6 text-center text-sm text-white/55">
          Counting carrots…
        </p>
      ) : stats === null ? (
        <p className="rounded-card bg-white/10 px-4 py-6 text-center text-sm text-white/55">
          Couldn&apos;t reach the community stats. Try again later.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Fact caption="Wabbits" value={stats.users.toLocaleString("en-US")} />
            <Fact caption="Entries" value={stats.transactions.toLocaleString("en-US")} />
            <Fact caption="E2EE" value={stats.encryptedUsers.toLocaleString("en-US")} />
          </div>
          {communityBars.length > 0 && (
            <div className="rounded-card bg-white/10 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-white/55">
                What everyone logs most
              </p>
              <StatBars items={communityBars} />
            </div>
          )}
          <p className="px-1 text-xs text-white/40">
            Counts only, amounts are encrypted. Nobody (including us) can
            total them. 🔒
          </p>
        </>
      )}
    </section>
  );
}
