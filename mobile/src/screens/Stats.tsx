import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PixelRatio, Text, View, type LayoutChangeEvent } from "react-native";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Press } from "@/components/ui/Press";
import { Carrot } from "@/components/ui/Carrot";
import { SparkArea } from "@/components/ui/SparkArea";
import { StatBars, type StatBarItem } from "@/components/ui/StatBars";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { colors, withAlpha, OBSERVATORY } from "@/lib/theme";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { currentMonthRange, monthAnchor, monthLabel } from "@/lib/dates";
import { formatUsdCents } from "@/lib/money";
import {
  dailySpendSeries,
  monthInsights,
  monthlySpendTotals,
  monthSpendSeries,
  topCategories,
  type MonthSpend,
} from "@/lib/stats";
import { fetchPublicStats, type PublicStats } from "@/lib/publicStats";

// The stats page — a deep indigo "observatory" you climb up to and look at
// your money from, deliberately distinct from History's charcoal rabbit hole
// and the Safe's green vault. It's half-public: signed-in users get their own
// breakdown (App wraps this route in the store only then), while signed-out
// visitors get the community numbers — those come from an aggregate-only rpc,
// so there's nothing personal to leak.
//
// The web's <main> classes come through on `Screen`, minus the four a browser
// needed and Screen already supplies: `mx-auto max-w-md min-h-full` (Screen's
// own column) and the safe-area halves of the paddings — `pt-[calc(1rem+…)]`
// is `pt-4` plus the inset Screen adds. The `fixed inset-0` floor div is
// Screen's `gradient.floor` (PORTING §2e).

export function Stats({ signedIn }: { signedIn: boolean }) {
  return (
    <Screen
      gradient={OBSERVATORY}
      statusBar="light"
      className="flex flex-col gap-5 px-4 pb-8 pt-4 text-white"
    >
      {/* Dark nav: back chevron + centered title. For signed-out visitors "/"
          is the landing page, so Back always lands somewhere sensible. */}
      <View className="relative flex flex-row items-center justify-center py-1">
        <Press
          onPress={() => navigate("/")}
          accessibilityLabel="Back"
          className="absolute left-0 -m-2 p-2 text-carrot"
        >
          {/* `h-6 w-6` → size={24}, `text-carrot` → color prop (PORTING §2b). */}
          <ChevronLeft size={24} strokeWidth={2.5} color={colors.carrot} />
        </Press>
        <Text className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          {signedIn ? "Your Stats" : "Stats"}
        </Text>
      </View>

      {signedIn ? <PersonalStats /> : <PublicTeaser />}
      <CommunityStats />
    </Screen>
  );
}

// Section titles wear Grobold like everywhere else in the app (SectionHeader
// is its grey-canvas twin; this one sits on the dark observatory).
function Caption({ children }: { children: ReactNode }) {
  return (
    <Text className="px-1 font-display text-sm font-semibold uppercase tracking-wide text-white/60">
      {children}
    </Text>
  );
}

// The web's `grid grid-cols-N gap-2`. React Native has no CSS grid, so it's a
// `flex-row flex-wrap gap-2` row whose width is measured with onLayout; each
// chip is then handed its exact column — `(width - gap*(N-1)) / N` — and the
// `col-span-2` card the full width. Floored to the pixel grid so a float32
// rounding error in Yoga's wrap check can't push the last chip onto its own
// row (PORTING §4, and the only thing here a class can't say).
const GRID_GAP = 8; // gap-2

type Cells = { cell?: number; full?: number };
const GridCells = createContext<Cells>({});

function Grid({
  columns,
  className,
  children,
}: {
  columns: number;
  className: string;
  children: ReactNode;
}) {
  const [width, setWidth] = useState<number | null>(null);
  const scale = PixelRatio.get();
  const cells: Cells =
    width === null
      ? {}
      : {
          cell: Math.floor(((width - GRID_GAP * (columns - 1)) / columns) * scale) / scale,
          full: width,
        };
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };
  return (
    <View className={className} onLayout={onLayout}>
      <GridCells.Provider value={cells}>{children}</GridCells.Provider>
    </View>
  );
}

// A small stat chip: tiny caption, big numeric value, optional one-liner.
// Give it an onPress and it becomes a button with a disclosure chevron —
// some chips open the receipts page behind their number.
function Fact({
  caption,
  value,
  sub,
  onPress,
}: {
  caption: string;
  value: string;
  sub?: string;
  onPress?: () => void;
}) {
  const { cell } = useContext(GridCells);
  const body = (
    <>
      {/* The web's `<p className="flex …">` holds the caption *and* an svg, so
          it becomes a row View; its text classes ride onto the inner Text. */}
      <View className="flex flex-row items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-white/55">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
          {caption}
        </Text>
        {onPress && (
          <ChevronRight size={14} strokeWidth={2.5} color={withAlpha(colors.white, 0.4)} />
        )}
      </View>
      <Text className="mt-1 font-numeric text-xl font-bold tabular-nums text-white">{value}</Text>
      {sub && (
        <Text className="mt-0.5 truncate text-xs text-white/55" numberOfLines={1}>
          {sub}
        </Text>
      )}
    </>
  );
  if (onPress) {
    return (
      <Press onPress={onPress} className="rounded-card bg-white/10 px-4 py-3 text-left" style={{ width: cell }}>
        {body}
      </Press>
    );
  }
  return (
    <View className="rounded-card bg-white/10 px-4 py-3" style={{ width: cell }}>
      {body}
    </View>
  );
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

// The cross-month spending trend: one bar per month, tap a bar to jump the page
// to that month. The bar for the month currently on screen wears the carrot.
function MonthlyBars({
  months,
  selectedOffset,
  onSelect,
}: {
  months: MonthSpend[];
  selectedOffset: number;
  onSelect: (offset: number) => void;
}) {
  const top = Math.max(...months.map((m) => m.totalCents), 1);
  return (
    <View className="flex flex-row items-end justify-between gap-1.5">
      {months.map((m) => {
        const active = m.offset === selectedOffset;
        return (
          <Press
            key={m.monthKey}
            onPress={() => onSelect(m.offset)}
            accessibilityLabel={`${m.label}: ${formatUsdCents(m.totalCents)}`}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <View className="flex flex-row h-24 w-full items-end">
              <View
                className="w-full rounded-t-sm transition-[height]"
                style={{
                  // Even an empty month keeps a faint sliver so the axis reads.
                  height: `${Math.max((m.totalCents / top) * 100, 3)}%`,
                  backgroundColor: active ? "#F56300" : "rgba(255,255,255,0.22)",
                }}
              />
            </View>
            <Text
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                active ? "text-carrot" : "text-white/50"
              }`}
            >
              {m.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

// The signed-in half. Lives in its own component so the top-level Stats never
// touches useStore() — signed-out renders have no StoreProvider above them.
function PersonalStats() {
  const { transactions, locked, safeTotalCents } = useStore();

  // Which month is on screen: 0 = this month, -1 = last month, … You can page
  // back as long as there's older data and forward only up to the present.
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = useMemo(() => monthAnchor(monthOffset), [monthOffset]);
  const isCurrentMonth = monthOffset === 0;
  const hasOlder = useMemo(() => {
    const { from } = currentMonthRange(anchor);
    return transactions.some((t) => new Date(t.occurred_at) < from);
  }, [transactions, anchor]);

  // The current month charts the last 30 days (its caption says so); a past
  // month charts its own day 1 → last day instead.
  const series = useMemo(
    () =>
      isCurrentMonth
        ? dailySpendSeries(transactions, 30)
        : monthSpendSeries(transactions, anchor),
    [transactions, anchor, isCurrentMonth],
  );
  const cats = useMemo(() => topCategories(transactions, 6, anchor), [transactions, anchor]);
  const facts = useMemo(() => monthInsights(transactions, anchor), [transactions, anchor]);

  // The cross-month trend: spending per month over the last half-year. Drives
  // both the bar chart and the "per month" / "last month" call-outs. Bounded by
  // FETCH_CAP like everything else; older months can read low once the cap bites.
  const monthly = useMemo(() => monthlySpendTotals(transactions, 6), [transactions]);
  const hasMonthly = monthly.some((m) => m.totalCents > 0);
  // "Typical month" averages the completed months that had spending — the
  // current month is still filling up, so it would drag the figure down.
  const completed = monthly.filter((m) => !m.isCurrent && m.totalCents > 0);
  const avgMonthCents = completed.length
    ? Math.round(completed.reduce((s, m) => s + m.totalCents, 0) / completed.length)
    : 0;
  const lastMonthCents = monthly.find((m) => m.offset === -1)?.totalCents ?? 0;

  const monthNav = (
    <MonthSwitcher
      label={monthLabel(anchor)}
      onPrev={() => setMonthOffset((o) => o - 1)}
      onNext={() => setMonthOffset((o) => Math.min(o + 1, 0))}
      canPrev={hasOlder}
      canNext={!isCurrentMonth}
    />
  );

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
        <View className="rounded-card bg-white/10 px-5 py-5">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            {monthLabel()}
          </Text>
          <Text className="mt-1 font-numeric text-4xl font-bold tabular-nums text-white/45">
            ${garble(0)}
          </Text>
          <Text className="mt-0.5 text-sm text-white/55">amounts locked</Text>
        </View>

        <Press
          onPress={() => navigate("/settings")}
          className="flex flex-row w-full items-center gap-3 rounded-card bg-white/10 px-4 py-3.5 text-left"
        >
          <View className="flex flex-row h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Lock size={20} strokeWidth={2} color={withAlpha(colors.white, 0.7)} />
          </View>
          <Text className="flex-1 text-sm text-white/85">
            Your stats are encrypted. Enter your passphrase in Settings to see
            them.
          </Text>
        </Press>

        <View className="flex flex-col gap-2">
          <Caption>Fun facts</Caption>
          <Grid columns={2} className="flex-row flex-wrap gap-2 opacity-60">
            <Fact caption="Biggest splurge" value={`$${garble(1)}`} />
            <Fact caption="Busiest day" value={garble(2)} />
            <Fact caption="Safe runway" value={garble(3)} />
            <Fact caption="On pace for" value={`$${garble(4)}`} />
            <Fact caption="Treat yourself" value={`$${garble(5)}`} />
            <Fact caption="Weekend Spend" value={garble(6)} />
            <Fact caption="Coffee runs" value={garble(7)} />
            <Fact caption="No-spend days" value={garble(8)} />
          </Grid>
        </View>
      </>
    );
  }

  const hasAny = facts.spendCount > 0 || series.some((p) => p.count > 0);
  if (!hasAny) {
    return (
      <>
        {monthNav}
        <View className="rounded-card bg-white/10 px-5 py-10 text-center text-white/55">
          <Text className="text-center text-white/55">
            {isCurrentMonth
              ? "Nothin' to chart yet, Doc. Log a few entries and come back."
              : "Nothin' logged this month, Doc."}
          </Text>
        </View>
      </>
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
      {monthNav}
      {/* Headline: the month so far. The daily rhythm isn't given a slot of
          its own. It fills the whole card as a backdrop and the numbers sit
          on top of it. */}
      <View className="relative overflow-hidden rounded-card bg-white/10">
        <SparkArea
          values={series.map((p) => p.totalCents)}
          stroke="rgba(245, 99, 0, 0.55)"
          fill="rgba(245, 99, 0, 0.16)"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {/* min-h matches the Home hero card exactly, so tapping the hero
            lands on the same card with the same chart — only the room gets
            darker. (Keep in sync with Home.tsx.) */}
        <View className="relative flex min-h-[188px] flex-col px-5 py-5">
          {/* The month itself is named in the switcher right above, so the
              headline just says what the number is. */}
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            {isCurrentMonth ? "Spent this month" : "Spent"}
          </Text>
          <Text className="mt-1 font-numeric text-4xl font-bold tabular-nums text-white">
            {formatUsdCents(facts.spentCents)}
          </Text>
          <Text className="mt-0.5 text-sm text-white/55">
            ≈ {formatUsdCents(facts.avgPerDayCents)} a day
          </Text>
          <Text className="mt-auto text-right text-[11px] uppercase tracking-wide text-white/45">
            spent per day · {isCurrentMonth ? "last 30 days" : monthLabel(anchor)}
          </Text>
        </View>
      </View>

      {/* The cross-month picture: how each month's spending stacks up, a typical
          month, and last month's damage. The bars double as a month picker —
          tapping one pages the whole screen to that month. */}
      {hasMonthly && (
        <View className="flex flex-col gap-2">
          <Caption>Spending by month</Caption>
          <View className="rounded-card bg-white/10 p-4">
            <MonthlyBars
              months={monthly}
              selectedOffset={monthOffset}
              onSelect={(o) => setMonthOffset(o)}
            />
          </View>
          <Grid columns={2} className="flex-row flex-wrap gap-2">
            <Fact
              caption="Per month"
              value={avgMonthCents > 0 ? formatUsdCents(avgMonthCents) : EMPTY}
              sub={avgMonthCents > 0 ? "typical month" : undefined}
            />
            <Fact
              caption="Last month"
              value={lastMonthCents > 0 ? formatUsdCents(lastMonthCents) : EMPTY}
              onPress={lastMonthCents > 0 ? () => setMonthOffset(-1) : undefined}
            />
          </Grid>
        </View>
      )}

      {barItems.length > 0 && (
        <View className="flex flex-col gap-2">
          <Caption>Where it goes</Caption>
          <View className="rounded-card bg-white/10 p-4">
            <StatBars items={barItems} />
          </View>
        </View>
      )}

      {/* Pairs by design: splurge|busiest, runway|forecast, treats|weekend,
          coffee|no-spend — then the in-vs-out bar across the bottom. Every chip
          always renders: a fun fact with no data yet shows an em-dash rather
          than vanishing and leaving a hole in the grid. */}
      <View className="flex flex-col gap-2">
        <Caption>Fun facts</Caption>
        <Grid columns={2} className="flex-row flex-wrap gap-2">
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
          {/* Runway and the month-end forecast are present-tense — they read
              off the live safe and the days left in the month, so they only
              make sense for the current month. Past months show an em-dash. */}
          <Fact
            caption="Safe runway"
            value={isCurrentMonth && runwayDays > 0 ? runwayLabel(runwayDays) : EMPTY}
            sub={isCurrentMonth && runwayDays > 0 ? "at this pace" : undefined}
          />
          <Fact
            caption="On pace for"
            value={
              isCurrentMonth && facts.forecastCents > 0
                ? formatUsdCents(facts.forecastCents)
                : EMPTY
            }
            sub={isCurrentMonth && facts.forecastCents > 0 ? "by month's end" : undefined}
          />
          <Fact
            caption="Treat yourself"
            value={facts.treatCents > 0 ? formatUsdCents(facts.treatCents) : EMPTY}
            // Only tappable when there are receipts behind it — and only for the
            // current month, since the receipts pages always list this month.
            onPress={
              isCurrentMonth && facts.treatCents > 0
                ? () => navigate("/stats/treats")
                : undefined
            }
          />
          <Fact
            caption="Weekend Spend"
            value={facts.weekendCents > 0 ? formatUsdCents(facts.weekendCents) : EMPTY}
            onPress={
              isCurrentMonth && facts.weekendCents > 0
                ? () => navigate("/stats/weekend")
                : undefined
            }
          />
          <Fact caption="Coffee runs" value={String(facts.coffeeCount)} />
          <Fact caption="No-spend days" value={String(facts.noSpendDays)} />
          {flow > 0 && <InVsOut inPct={inPct} incomeCents={facts.incomeCents} spentCents={facts.spentCents} />}
        </Grid>
      </View>
    </>
  );
}

// The `col-span-2` chip at the foot of the fun-facts grid. Split out only so it
// can read the grid's measured full width from context.
function InVsOut({
  inPct,
  incomeCents,
  spentCents,
}: {
  inPct: number;
  incomeCents: number;
  spentCents: number;
}) {
  const { full } = useContext(GridCells);
  return (
    <View className="col-span-2 rounded-card bg-white/10 px-4 py-3" style={{ width: full }}>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
        In vs out
      </Text>
      <View className="mt-2 flex flex-row h-2 overflow-hidden rounded-pill bg-white/10">
        <View className="h-full" style={{ width: `${inPct}%`, backgroundColor: "#34C759" }} />
        <View className="h-full flex-1" style={{ backgroundColor: "#FF3B30" }} />
      </View>
      <View className="mt-1.5 flex flex-row justify-between font-numeric text-xs font-semibold tabular-nums">
        <Text className="font-numeric text-xs font-semibold tabular-nums text-income">
          +{formatUsdCents(incomeCents)}
        </Text>
        <Text className="font-numeric text-xs font-semibold tabular-nums text-expense">
          -{formatUsdCents(spentCents)}
        </Text>
      </View>
    </View>
  );
}

// What a signed-out visitor sees where the personal section would be.
function PublicTeaser() {
  return (
    <View className="flex flex-col items-center gap-3 rounded-card bg-white/10 px-5 py-8 text-center">
      {/* The web's `<Carrot className="text-5xl" />`; the emoji is sized by a
          prop here (see components/ui/Carrot). text-5xl = 48. */}
      <Carrot size={48} />
      <Text className="text-base text-white/85">
        Wabbits get their own spending picture here.
      </Text>
      <Press
        onPress={() => navigate("/")}
        className="rounded-pill bg-carrot px-6 py-2.5 text-base font-semibold text-white"
      >
        <Text className="text-base font-semibold text-white">Hop in</Text>
      </Press>
    </View>
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
    <View className="flex flex-col gap-2">
      <Caption>Across BucksBuddy</Caption>
      {stats === undefined ? (
        <Text className="rounded-card bg-white/10 px-4 py-6 text-center text-sm text-white/55">
          Counting carrots…
        </Text>
      ) : stats === null ? (
        <Text className="rounded-card bg-white/10 px-4 py-6 text-center text-sm text-white/55">
          Couldn&apos;t reach the community stats. Try again later.
        </Text>
      ) : (
        <>
          <Grid columns={3} className="flex-row flex-wrap gap-2">
            <Fact caption="Wabbits" value={stats.users.toLocaleString("en-US")} />
            <Fact caption="Entries" value={stats.transactions.toLocaleString("en-US")} />
            <Fact caption="E2EE" value={stats.encryptedUsers.toLocaleString("en-US")} />
          </Grid>
          {communityBars.length > 0 && (
            <View className="rounded-card bg-white/10 p-4">
              <Text className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-white/55">
                What everyone logs most
              </Text>
              <StatBars items={communityBars} />
            </View>
          )}
          <Text className="px-1 text-xs text-white/40">
            Counts only, amounts are encrypted. Nobody (including us) can
            total them. 🔒
          </Text>
        </>
      )}
    </View>
  );
}
