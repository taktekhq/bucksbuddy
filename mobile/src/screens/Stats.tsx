import { useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChevronRight, Lock } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
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
import { colors, display, numeric, radius, white } from "@/lib/theme";

// The stats page — a deep indigo "observatory" you climb up to and look at
// your money from, deliberately distinct from History's charcoal rabbit hole
// and the Safe's green vault. It's half-public: signed-in users get their own
// breakdown (App wraps this route in the store only then), while signed-out
// visitors get the community numbers — those come from an aggregate-only rpc,
// so there's nothing personal to leak.
export const OBSERVATORY = {
  colors: ["#23234A", "#1B1B38", "#141428"] as const,
  stops: [0, 220, 460] as const,
  floor: "#141428",
};

export function Stats({ signedIn }: { signedIn: boolean }) {
  return (
    <Screen gradient={OBSERVATORY} statusBar="light">
      {/* For signed-out visitors "/" is the landing page, so Back always lands
          somewhere sensible. */}
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

// A small stat chip: tiny caption, big numeric value, optional one-liner.
// Give it an onPress and it becomes a button with a disclosure chevron —
// some chips open the receipts page behind their number.
function Fact({
  caption,
  value,
  sub,
  onPress,
  style,
}: {
  caption: string;
  value: string;
  sub?: string;
  onPress?: () => void;
  style?: object;
}) {
  const body = (
    <>
      <View style={styles.factCaptionRow}>
        <Text style={styles.factCaption}>{caption}</Text>
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
      <Press onPress={onPress} style={[styles.fact, style]}>
        {body}
      </Press>
    );
  }
  return <View style={[styles.fact, style]}>{body}</View>;
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
      {months.map((m) => {
        const active = m.offset === selectedOffset;
        return (
          <Press
            key={m.monthKey}
            onPress={() => onSelect(m.offset)}
            accessibilityLabel={`${m.label}: ${formatUsdCents(m.totalCents)}`}
            style={styles.bar}
          >
            <View style={styles.barTrack}>
              <View
                style={{
                  width: "100%",
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                  // Even an empty month keeps a faint sliver so the axis reads.
                  height: `${Math.max((m.totalCents / top) * 100, 3)}%`,
                  backgroundColor: active ? "#F56300" : "rgba(255,255,255,0.22)",
                }}
              />
            </View>
            <Text style={[styles.barLabel, { color: active ? colors.carrot : white(0.5) }]}>
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

  // The cross-month trend: spending per month over the last half-year.
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
          <Text style={styles.factCaption}>{monthLabel()}</Text>
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
          <View style={[styles.grid, { opacity: 0.6 }]}>
            <Fact caption="Biggest splurge" value={`$${garble(1)}`} style={styles.half} />
            <Fact caption="Busiest day" value={garble(2)} style={styles.half} />
            <Fact caption="Safe runway" value={garble(3)} style={styles.half} />
            <Fact caption="On pace for" value={`$${garble(4)}`} style={styles.half} />
            <Fact caption="Treat yourself" value={`$${garble(5)}`} style={styles.half} />
            <Fact caption="Weekend Spend" value={garble(6)} style={styles.half} />
            <Fact caption="Coffee runs" value={garble(7)} style={styles.half} />
            <Fact caption="No-spend days" value={garble(8)} style={styles.half} />
          </View>
        </View>
      </>
    );
  }

  const hasAny = facts.spendCount > 0 || series.some((p) => p.count > 0);
  if (!hasAny) {
    return (
      <>
        {monthNav}
        <View style={[styles.headline, { paddingVertical: 40 }]}>
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
    facts.avgPerDayCents > 0 ? Math.round(safeTotalCents / facts.avgPerDayCents) : 0;

  return (
    <>
      {monthNav}
      {/* Headline: the month so far. The daily rhythm fills the whole card as
          a backdrop and the numbers sit on top of it. */}
      <View style={styles.heroCard}>
        <SparkArea
          values={series.map((p) => p.totalCents)}
          stroke="rgba(245, 99, 0, 0.55)"
          fill="rgba(245, 99, 0, 0.16)"
        />
        {/* min-h matches the Home hero card exactly. (Keep in sync.) */}
        <View style={styles.heroBody}>
          <Text style={styles.factCaption}>
            {isCurrentMonth ? "Spent this month" : "Spent"}
          </Text>
          <Text style={styles.headlineValue}>{formatUsdCents(facts.spentCents)}</Text>
          <Text style={styles.headlineSub}>≈ {formatUsdCents(facts.avgPerDayCents)} a day</Text>
          <Text style={styles.heroFoot}>
            spent per day · {isCurrentMonth ? "last 30 days" : monthLabel(anchor)}
          </Text>
        </View>
      </View>

      {/* The cross-month picture: how each month's spending stacks up, a typical
          month, and last month's damage. The bars double as a month picker. */}
      {hasMonthly && (
        <View style={styles.section}>
          <Caption>Spending by month</Caption>
          <View style={styles.panel}>
            <MonthlyBars months={monthly} selectedOffset={monthOffset} onSelect={setMonthOffset} />
          </View>
          <View style={styles.grid}>
            <Fact
              caption="Per month"
              value={avgMonthCents > 0 ? formatUsdCents(avgMonthCents) : EMPTY}
              sub={avgMonthCents > 0 ? "typical month" : undefined}
              style={styles.half}
            />
            <Fact
              caption="Last month"
              value={lastMonthCents > 0 ? formatUsdCents(lastMonthCents) : EMPTY}
              onPress={lastMonthCents > 0 ? () => setMonthOffset(-1) : undefined}
              style={styles.half}
            />
          </View>
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
          coffee|no-spend — then the in-vs-out bar across the bottom. */}
      <View style={styles.section}>
        <Caption>Fun facts</Caption>
        <View style={styles.grid}>
          <Fact
            caption="Biggest splurge"
            value={facts.biggestExpense ? formatUsdCents(facts.biggestExpense.amount_usd_cents) : EMPTY}
            sub={
              facts.biggestExpense
                ? [categoryLabel(facts.biggestExpense.category), facts.biggestExpense.note]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
            style={styles.half}
          />
          <Fact
            caption="Busiest day"
            value={facts.busiestDay ? count(facts.busiestDay.count, "entry", "entries") : EMPTY}
            sub={
              facts.busiestDay
                ? `${dayLabel(facts.busiestDay.date)} · ${formatUsdCents(facts.busiestDay.totalCents)}`
                : undefined
            }
            style={styles.half}
          />
          {/* Runway and the month-end forecast are present-tense — they only
              make sense for the current month. Past months show an em-dash. */}
          <Fact
            caption="Safe runway"
            value={isCurrentMonth && runwayDays > 0 ? runwayLabel(runwayDays) : EMPTY}
            sub={isCurrentMonth && runwayDays > 0 ? "at this pace" : undefined}
            style={styles.half}
          />
          <Fact
            caption="On pace for"
            value={isCurrentMonth && facts.forecastCents > 0 ? formatUsdCents(facts.forecastCents) : EMPTY}
            sub={isCurrentMonth && facts.forecastCents > 0 ? "by month's end" : undefined}
            style={styles.half}
          />
          <Fact
            caption="Treat yourself"
            value={facts.treatCents > 0 ? formatUsdCents(facts.treatCents) : EMPTY}
            // Only tappable when there are receipts behind it — and only for
            // the current month, since the receipts pages list this month.
            onPress={isCurrentMonth && facts.treatCents > 0 ? () => navigate("/stats/treats") : undefined}
            style={styles.half}
          />
          <Fact
            caption="Weekend Spend"
            value={facts.weekendCents > 0 ? formatUsdCents(facts.weekendCents) : EMPTY}
            onPress={isCurrentMonth && facts.weekendCents > 0 ? () => navigate("/stats/weekend") : undefined}
            style={styles.half}
          />
          <Fact caption="Coffee runs" value={String(facts.coffeeCount)} style={styles.half} />
          <Fact caption="No-spend days" value={String(facts.noSpendDays)} style={styles.half} />
          {flow > 0 && (
            <View style={[styles.fact, styles.full]}>
              <Text style={styles.factCaption}>In vs out</Text>
              <View style={styles.flowTrack}>
                <View style={{ width: `${inPct}%`, height: "100%", backgroundColor: "#34C759" }} />
                <View style={{ flex: 1, height: "100%", backgroundColor: "#FF3B30" }} />
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
        </View>
      </View>
    </>
  );
}

// What a signed-out visitor sees where the personal section would be.
function PublicTeaser() {
  return (
    <View style={styles.teaser}>
      <Carrot size={48} />
      <Text style={styles.teaserText}>Wabbits get their own spending picture here.</Text>
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
        <Text style={styles.communityNote}>Couldn't reach the community stats. Try again later.</Text>
      ) : (
        <>
          <View style={styles.grid}>
            <Fact caption="Wabbits" value={stats.users.toLocaleString("en-US")} style={styles.third} />
            <Fact caption="Entries" value={stats.transactions.toLocaleString("en-US")} style={styles.third} />
            <Fact caption="E2EE" value={stats.encryptedUsers.toLocaleString("en-US")} style={styles.third} />
          </View>
          {communityBars.length > 0 && (
            <View style={styles.panel}>
              <Text style={[styles.factCaption, { marginBottom: 12 }]}>What everyone logs most</Text>
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

const GRID_GAP = 8;

const styles = StyleSheet.create({
  caption: {
    ...display,
    paddingHorizontal: 4,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.35,
    color: white(0.6),
  },
  section: { gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  // Two-up and three-up chips: fractional widths minus their share of the gap.
  half: { width: "48.8%" },
  third: { width: "31.9%" },
  full: { width: "100%" },
  fact: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  factCaptionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  factCaption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: white(0.55),
  },
  factValue: { ...numeric, marginTop: 4, fontSize: 20, lineHeight: 28, fontWeight: "700", color: "#FFF" },
  factSub: { marginTop: 2, fontSize: 12, lineHeight: 16, color: white(0.55) },
  headline: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  headlineValue: { ...numeric, marginTop: 4, fontSize: 36, lineHeight: 40, fontWeight: "700", color: "#FFF" },
  headlineSub: { marginTop: 2, fontSize: 14, lineHeight: 20, color: white(0.55) },
  emptyText: { textAlign: "center", fontSize: 16, lineHeight: 24, color: white(0.55) },
  heroCard: { position: "relative", overflow: "hidden", borderRadius: radius.card, backgroundColor: white(0.1) },
  heroBody: { position: "relative", minHeight: 188, paddingHorizontal: 20, paddingVertical: 20 },
  heroFoot: {
    marginTop: "auto",
    textAlign: "right",
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: white(0.45),
  },
  panel: { borderRadius: radius.card, backgroundColor: white(0.1), padding: 16 },
  bars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6 },
  bar: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { height: 96, width: "100%", justifyContent: "flex-end" },
  barLabel: { fontSize: 10, lineHeight: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  lockedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  lockBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: white(0.1),
  },
  lockedText: { flex: 1, fontSize: 14, lineHeight: 20, color: white(0.85) },
  flowTrack: {
    marginTop: 8,
    flexDirection: "row",
    height: 8,
    overflow: "hidden",
    borderRadius: radius.pill,
    backgroundColor: white(0.1),
  },
  flowLabels: { marginTop: 6, flexDirection: "row", justifyContent: "space-between" },
  flowLabel: { ...numeric, fontSize: 12, lineHeight: 16, fontWeight: "600" },
  teaser: {
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  teaserText: { textAlign: "center", fontSize: 16, lineHeight: 24, color: white(0.85) },
  hopIn: { borderRadius: radius.pill, backgroundColor: colors.carrot, paddingHorizontal: 24, paddingVertical: 10 },
  hopInText: { fontSize: 16, lineHeight: 24, fontWeight: "600", color: "#FFF" },
  communityNote: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 16,
    paddingVertical: 24,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    color: white(0.55),
  },
  footnote: { paddingHorizontal: 4, fontSize: 12, lineHeight: 16, color: white(0.4) },
});
