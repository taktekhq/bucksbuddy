import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  Text,
  PixelRatio,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ChevronRight, Lock } from "lucide-react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Press } from "@/components/ui/Press";
import { COLUMN_MAX_WIDTH, Screen, type Gradient } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { Carrot } from "@/components/ui/Carrot";
import { SparkArea } from "@/components/ui/SparkArea";
import { StatBars, type StatBarItem } from "@/components/ui/StatBars";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
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
import {
  colors,
  display,
  numeric,
  radius,
  space,
  text,
  trackingWide,
  weight,
  white, motion, } from "@/lib/theme";

// The stats page — a deep indigo "observatory" you climb up to and look at
// your money from, deliberately distinct from History's charcoal rabbit hole
// and the Safe's green vault. It's half-public: signed-in users get their own
// breakdown (App wraps this route in the store only then), while signed-out
// visitors get the community numbers — those come from an aggregate-only rpc,
// so there's nothing personal to leak.
//
// `linear-gradient(180deg, #23234A 0px, #1B1B38 220px, #141428 460px)` over a
// fixed `#141428` floor — Receipts imports this so the tap-through stays in
// the same room.
export const OBSERVATORY: Gradient = {
  colors: ["#23234A", "#1B1B38", "#141428"],
  stops: [0, 220, 460],
  floor: "#141428",
};

export function Stats({ signedIn }: { signedIn: boolean }) {
  return (
    <Screen gradient={OBSERVATORY} statusBar="light">
      {/* Dark nav: back chevron + centered title. For signed-out visitors "/"
          is the landing page, so Back always lands somewhere sensible. */}
      <NavHeader title={signedIn ? "Your Stats" : "Stats"} onBack={() => navigate("/")} dark />

      {signedIn ? <PersonalStats /> : <PublicTeaser />}
      <CommunityStats />
    </Screen>
  );
}

// Section titles wear Grobold like everywhere else in the app (SectionHeader
// is its grey-canvas twin; this one sits on the dark observatory).
function Caption({ children }: { children: ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

// The web's `grid grid-cols-N gap-2`: measure the row with onLayout and hand
// each chip its exact column width — `(width - gap*(N-1)) / N` — rather than
// guessing a percentage. Before the first layout lands, the column is derived
// from the window (Screen's max-w-md column minus its px-4), so the first
// frame already has the right widths and nothing jumps.
const GRID_GAP = 8; // gap-2
const CellWidth = createContext<number | undefined>(undefined);

function Grid({
  columns,
  style,
  children,
}: {
  columns: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const width = measured ?? Math.min(windowWidth, COLUMN_MAX_WIDTH) - 2 * space(4);
  // Floor to the pixel grid: Yoga's float32 wrap check otherwise rounds the
  // last cell over the container on some widths and wraps it onto its own row.
  const scale = PixelRatio.get();
  const cell = Math.floor(((width - GRID_GAP * (columns - 1)) / columns) * scale) / scale;
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setMeasured(w);
  };
  return (
    <View onLayout={onLayout} style={[styles.grid, style]}>
      <CellWidth.Provider value={cell}>{children}</CellWidth.Provider>
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
  const width = useContext(CellWidth);
  const body = (
    <>
      <View style={styles.factCaptionRow}>
        <Text style={[styles.microCaption, styles.factCaptionText]}>{caption}</Text>
        {onPress && <ChevronRight size={14} strokeWidth={2.5} color={white(0.4)} />}
      </View>
      <Text style={styles.factValue}>{value}</Text>
      {sub && (
        <Text style={styles.factSub} numberOfLines={1}>
          {sub}
        </Text>
      )}
    </>
  );
  if (onPress) {
    return (
      <Press onPress={onPress} style={[styles.fact, { width }]}>
        {body}
      </Press>
    );
  }
  return <View style={[styles.fact, { width }]}>{body}</View>;
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
    <View style={styles.bars}>
      {months.map((m) => (
        <MonthBar
          key={m.monthKey}
          month={m}
          // Even an empty month keeps a faint sliver so the axis reads.
          pct={Math.max((m.totalCents / top) * 100, 3)}
          active={m.offset === selectedOffset}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

const BAR_TRACK_H = 96; // h-24
const BAR_EASE = Easing.bezier(0.4, 0, 0.2, 1); // Tailwind's `transition` curve
const BAR_MS = motion.transition;

// One bar. The web's `transition-[height]`: when the data reshuffles (a new
// entry, the fetch settling) the bar eases to its new height instead of
// snapping. Owns its shared value, per the porting rules.
const MonthBar = memo(function MonthBar({
  month: m,
  pct,
  active,
  onSelect,
}: {
  month: MonthSpend;
  pct: number;
  active: boolean;
  onSelect: (offset: number) => void;
}) {
  const height = useSharedValue((pct / 100) * BAR_TRACK_H);
  useEffect(() => {
    height.value = withTiming((pct / 100) * BAR_TRACK_H, { duration: BAR_MS, easing: BAR_EASE });
  }, [height, pct]);
  const fill = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Press
      onPress={() => onSelect(m.offset)}
      accessibilityLabel={`${m.label}: ${formatUsdCents(m.totalCents)}`}
      accessibilityState={{ selected: active }}
      style={styles.bar}
    >
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            { backgroundColor: active ? "#F56300" : "rgba(255,255,255,0.22)" },
            fill,
          ]}
        />
      </View>
      <Text style={[styles.barLabel, { color: active ? colors.carrot : white(0.5) }]}>
        {m.label}
      </Text>
    </Press>
  );
});

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
        <View style={styles.headline}>
          <Text style={styles.microCaption}>{monthLabel()}</Text>
          <Text style={[styles.headlineValue, { color: white(0.45) }]}>${garble(0)}</Text>
          <Text style={styles.headlineSub}>amounts locked</Text>
        </View>

        <Press onPress={() => navigate("/settings")} style={styles.lockedCard}>
          <View style={styles.lockBadge}>
            <Lock size={20} strokeWidth={2} color={white(0.7)} />
          </View>
          <Text style={styles.lockedText}>
            Your stats are encrypted. Enter your passphrase in Settings to see them.
          </Text>
        </Press>

        <View style={styles.section}>
          <Caption>Fun facts</Caption>
          <Grid columns={2} style={{ opacity: 0.6 }}>
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
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
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
      <View style={styles.heroCard}>
        <SparkArea
          values={series.map((p) => p.totalCents)}
          stroke="rgba(245, 99, 0, 0.55)"
          fill="rgba(245, 99, 0, 0.16)"
        />
        {/* min-h matches the Home hero card exactly, so tapping the hero
            lands on the same card with the same chart — only the room gets
            darker. (Keep in sync with Home.tsx.) */}
        <View style={styles.heroBody}>
          {/* The month itself is named in the switcher right above, so the
              headline just says what the number is. */}
          <Text style={styles.microCaption}>
            {isCurrentMonth ? "Spent this month" : "Spent"}
          </Text>
          <Text style={styles.headlineValue}>{formatUsdCents(facts.spentCents)}</Text>
          <Text style={styles.headlineSub}>
            ≈ {formatUsdCents(facts.avgPerDayCents)} a day
          </Text>
          <Text style={styles.heroFoot}>
            spent per day · {isCurrentMonth ? "last 30 days" : monthLabel(anchor)}
          </Text>
        </View>
      </View>

      {/* The cross-month picture: how each month's spending stacks up, a typical
          month, and last month's damage. The bars double as a month picker —
          tapping one pages the whole screen to that month. */}
      {hasMonthly && (
        <View style={styles.section}>
          <Caption>Spending by month</Caption>
          <View style={styles.panel}>
            <MonthlyBars
              months={monthly}
              selectedOffset={monthOffset}
              onSelect={setMonthOffset}
            />
          </View>
          <Grid columns={2}>
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
        <View style={styles.section}>
          <Caption>Where it goes</Caption>
          <View style={styles.panel}>
            <StatBars items={barItems} />
          </View>
        </View>
      )}

      {/* Pairs by design: splurge|busiest, runway|forecast, treats|weekend,
          coffee|no-spend — then the in-vs-out bar across the bottom. Every chip
          always renders: a fun fact with no data yet shows an em-dash rather
          than vanishing and leaving a hole in the grid. */}
      <View style={styles.section}>
        <Caption>Fun facts</Caption>
        <Grid columns={2}>
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
          {flow > 0 && (
            <View style={[styles.fact, styles.full]}>
              <Text style={styles.microCaption}>In vs out</Text>
              <View style={styles.flowTrack}>
                <View style={[styles.flowIn, { width: `${inPct}%` }]} />
                <View style={styles.flowOut} />
              </View>
              <View style={styles.flowLabels}>
                <Text style={[styles.flowLabel, { color: colors.income }]}>
                  +{formatUsdCents(facts.incomeCents)}
                </Text>
                <Text style={[styles.flowLabel, { color: colors.expense }]}>
                  -{formatUsdCents(facts.spentCents)}
                </Text>
              </View>
            </View>
          )}
        </Grid>
      </View>
    </>
  );
}

// What a signed-out visitor sees where the personal section would be.
function PublicTeaser() {
  return (
    <View style={styles.teaser}>
      <Carrot size={48} />
      <Text style={styles.teaserText}>
        Wabbits get their own spending picture here.
      </Text>
      <Press onPress={() => navigate("/")} style={styles.hopIn}>
        <Text style={styles.hopInText}>Hop in</Text>
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
    <View style={styles.section}>
      <Caption>Across BucksBuddy</Caption>
      {stats === undefined ? (
        <Text style={styles.communityNote}>Counting carrots…</Text>
      ) : stats === null ? (
        <Text style={styles.communityNote}>
          Couldn't reach the community stats. Try again later.
        </Text>
      ) : (
        <>
          <Grid columns={3}>
            <Fact caption="Wabbits" value={stats.users.toLocaleString("en-US")} />
            <Fact caption="Entries" value={stats.transactions.toLocaleString("en-US")} />
            <Fact caption="E2EE" value={stats.encryptedUsers.toLocaleString("en-US")} />
          </Grid>
          {communityBars.length > 0 && (
            <View style={styles.panel}>
              <Text style={[styles.microCaption, styles.mb3]}>What everyone logs most</Text>
              <StatBars items={communityBars} />
            </View>
          )}
          <Text style={styles.footnote}>
            Counts only, amounts are encrypted. Nobody (including us) can total them. 🔒
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // px-1 font-display text-sm font-semibold uppercase tracking-wide text-white/60
  caption: {
    ...display,
    ...text.sm,
    paddingHorizontal: 4,
    letterSpacing: trackingWide(14),
    color: white(0.6),
  },
  section: { gap: 8 }, // flex-col gap-2
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  full: { width: "100%" }, // col-span-2
  mb3: { marginBottom: 12 },

  // text-[11px] font-semibold uppercase tracking-wide text-white/55
  microCaption: {
    ...text["11"],
    fontWeight: weight.semibold,
    textTransform: "uppercase",
    letterSpacing: trackingWide(11),
    color: white(0.55),
  },

  // rounded-card bg-white/10 px-4 py-3
  fact: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  factCaptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  factCaptionText: { flexShrink: 1 },
  // mt-1 font-numeric text-xl font-bold tabular-nums
  factValue: {
    ...numeric,
    ...text.xl,
    marginTop: 4,
    fontWeight: weight.bold,
    color: colors.white,
  },
  // mt-0.5 truncate text-xs text-white/55
  factSub: { ...text.xs, marginTop: 2, color: white(0.55) },

  // rounded-card bg-white/10 px-5 py-5 (the locked headline)
  headline: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  // mt-1 font-numeric text-4xl font-bold tabular-nums
  headlineValue: {
    ...numeric,
    ...text["4xl"],
    marginTop: 4,
    fontWeight: weight.bold,
    color: colors.white,
  },
  // mt-0.5 text-sm text-white/55
  headlineSub: { ...text.sm, marginTop: 2, color: white(0.55) },

  // rounded-card bg-white/10 px-5 py-10 text-center text-white/55
  empty: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  emptyText: { ...text.base, textAlign: "center", color: white(0.55) },

  // relative overflow-hidden rounded-card bg-white/10 — clips the spark to
  // the corners. No shadow lives here, so clipping and radius can share a view.
  heroCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: radius.card,
    backgroundColor: white(0.1),
  },
  // relative flex min-h-[188px] flex-col px-5 py-5
  heroBody: {
    position: "relative",
    minHeight: 188,
    flexDirection: "column",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  // mt-auto text-right text-[11px] uppercase tracking-wide text-white/45
  heroFoot: {
    ...text["11"],
    marginTop: "auto",
    textAlign: "right",
    textTransform: "uppercase",
    letterSpacing: trackingWide(11),
    color: white(0.45),
  },

  // rounded-card bg-white/10 p-4
  panel: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    padding: 16,
  },

  // flex items-end justify-between gap-1.5
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  // press flex flex-1 flex-col items-center gap-1.5
  bar: { flex: 1, flexDirection: "column", alignItems: "center", gap: 6 },
  // flex h-24 w-full items-end
  barTrack: { height: BAR_TRACK_H, width: "100%", justifyContent: "flex-end" },
  // w-full rounded-t-sm
  barFill: {
    width: "100%",
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  // text-[10px] font-semibold uppercase tracking-wide
  barLabel: {
    ...text["10"],
    fontWeight: weight.semibold,
    textTransform: "uppercase",
    letterSpacing: trackingWide(10),
  },

  // press flex w-full items-center gap-3 rounded-card bg-white/10 px-4 py-3.5
  lockedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  // h-9 w-9 shrink-0 rounded-full bg-white/10
  lockBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: white(0.1),
  },
  lockedText: { ...text.sm, flex: 1, color: white(0.85) },

  // mt-2 flex h-2 overflow-hidden rounded-pill bg-white/10
  flowTrack: {
    marginTop: 8,
    flexDirection: "row",
    height: 8,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: white(0.1),
  },
  flowIn: { height: "100%", backgroundColor: "#34C759" },
  flowOut: { height: "100%", flex: 1, backgroundColor: "#FF3B30" },
  // mt-1.5 flex justify-between font-numeric text-xs font-semibold tabular-nums
  flowLabels: { marginTop: 6, flexDirection: "row", justifyContent: "space-between" },
  flowLabel: { ...numeric, ...text.xs, fontWeight: weight.semibold },

  // flex flex-col items-center gap-3 rounded-card bg-white/10 px-5 py-8 text-center
  teaser: {
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  teaserText: { ...text.base, textAlign: "center", color: white(0.85) },
  // press rounded-pill bg-carrot px-6 py-2.5 text-base font-semibold text-white
  hopIn: {
    borderRadius: radius.pill,
    backgroundColor: colors.carrot,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  hopInText: { ...text.base, fontWeight: weight.semibold, color: colors.white },

  // rounded-card bg-white/10 px-4 py-6 text-center text-sm text-white/55
  communityNote: {
    ...text.sm,
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 16,
    paddingVertical: 24,
    textAlign: "center",
    color: white(0.55),
  },
  // px-1 text-xs text-white/40
  footnote: { ...text.xs, paddingHorizontal: 4, color: white(0.4) },
});
