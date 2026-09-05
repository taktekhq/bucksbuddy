import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import {
  Banknote,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  Lock,
  Settings,
  Vault,
} from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { COLUMN_MAX_WIDTH, GradientLayer, ScreenFrame, type Gradient } from "@/components/ui/Screen";
import { NetTotal } from "@/components/ui/NetTotal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SparkArea } from "@/components/ui/SparkArea";
import { Carrot } from "@/components/ui/Carrot";
import { AddComposer } from "@/components/AddComposer";
import { HistoryList } from "@/components/HistoryList";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import posthog from "@/lib/posthog";
import { takePendingEdit } from "@/lib/editIntent";
import { isToday, monthLabel } from "@/lib/dates";
import { dailySpendSeries } from "@/lib/stats";
import { formatUsdCents } from "@/lib/money";
import { formatGrams } from "@/lib/gold";
import {
  colors,
  display,
  numeric,
  radius,
  shadows,
  space,
  text,
  trackingWide,
  weight,
  withAlpha,
} from "@/lib/theme";
import type { Transaction } from "@/types/db";

// Amber/gold that reads on the light card (the metal, but legible).
const GOLD_INK = "#A16207";

// "linear-gradient(180deg, #E6F8EE 0%, #F2F2F7 260px)" — the savings tint.
const SAVINGS: Gradient = {
  colors: ["#E6F8EE", "#F2F2F7"],
  stops: [0, 260],
  floor: "#F2F2F7",
};

// transition-[background] duration-500 (Tailwind's default ease).
const TINT_FADE = { duration: 500, easing: Easing.bezier(0.4, 0, 0.2, 1) };

export function Home() {
  const {
    transactions,
    balanceCents,
    loading,
    deleteTransaction,
    safeTotalCents,
    safeGoldGrams,
    locked,
  } = useStore();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // The full history lives on its own "/history" page; the page itself only
  // lists today's entries so it doesn't grow without bound.
  const todays = transactions.filter((t) => isToday(t.occurred_at));

  // Editing a row on the full-history page navigates back here with the target
  // stashed; pick it up once the matching transaction is in hand. Home stays
  // mounted at the root of the native stack, so besides the first-mount read
  // the stash is checked every time the page comes back into focus.
  const [pendingEditId, setPendingEditId] = useState<string | null>(takePendingEdit);
  useFocusEffect(
    useCallback(() => {
      const id = takePendingEdit();
      if (id) setPendingEditId(id);
    }, []),
  );
  useEffect(() => {
    if (!pendingEditId) return;
    const tx = transactions.find((t) => t.id === pendingEditId);
    if (tx) {
      setEditing(tx);
      setPendingEditId(null);
      scroll.current?.scrollTo({ y: 0, animated: true });
    }
  }, [pendingEditId, transactions]);

  // The safe balance is private by default — tap the eye to reveal it.
  const [safeShown, setSafeShown] = useState(false);

  // When there's money or gold tucked away, the whole page picks up a soft
  // savings tint so it's obvious at a glance that the safe is in play.
  const hasSavings = safeTotalCents > 0 || safeGoldGrams > 0;

  // The tint fades in and out (the web's transition-[background] duration-500)
  // rather than popping — the gradient layer is always there, its opacity moves.
  const tint = useSharedValue(hasSavings ? 1 : 0);
  useEffect(() => {
    tint.value = withTiming(hasSavings ? 1 : 0, TINT_FADE);
  }, [hasSavings, tint]);
  const tintStyle = useAnimatedStyle(() => ({ opacity: tint.value }));

  function handleEdit(tx: Transaction) {
    setEditing(tx);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  function clearEdit() {
    setEditing(null);
  }

  function handleDelete(tx: Transaction) {
    Alert.alert("Delete this entry?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteTransaction(tx.id);
          posthog.capture("transaction_deleted", {
            category: tx.category,
            is_income: tx.is_income,
          });
        },
      },
    ]);
  }

  // When locked (this device doesn't have the passphrase yet) amounts show
  // obscured, so the safe balance can't be revealed either.
  const reveal = safeShown && !locked;

  // The last 30 days of spending, washed faintly behind the hero — the same
  // daily chart the Stats page draws, dialed down to sit on the light card.
  // Hidden while locked: masked amounts read as zeros, and a flat line would
  // be a lie.
  const sparkValues = useMemo(
    () => dailySpendSeries(transactions, 30).map((p) => p.totalCents),
    [transactions],
  );

  return (
    <ScreenFrame floor={colors.canvas}>
      {/* Savings tint as a fixed, viewport-filling backdrop so it spans the
          full width and never flashes the canvas on overscroll. It sits under
          the ScrollView, so it stays put while the cards scroll over it. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tintStyle]}>
        <GradientLayer gradient={SAVINGS} />
      </Animated.View>

      {/* <main class="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 …"> —
          Screen's ScrollView, verbatim, so the tint above can live outside it. */}
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.grow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.column,
            { paddingTop: space(4) + insets.top, paddingBottom: space(8) + insets.bottom },
          ]}
        >
          {/* Carrot mark + wordmark + safe + settings — the plain Apple nav bar. */}
          <View style={styles.nav}>
            <View style={styles.brand}>
              <Carrot size={24} />
              <Text style={styles.wordmark}>Bucks{"\n"}Buddy</Text>
            </View>
            <View style={styles.navActions}>
              <Press onPress={() => navigate("/safe")} accessibilityLabel="Safe" style={styles.navButton}>
                <Vault size={24} strokeWidth={1.75} color={colors.labelSecondary} />
              </Press>
              <Press
                onPress={() => navigate("/settings")}
                accessibilityLabel="Settings"
                style={styles.navButton}
              >
                <Settings size={24} strokeWidth={1.75} color={colors.labelSecondary} />
              </Press>
            </View>
          </View>

          {/* Money for the month — month caption above the net number. The safe
              balance rides along underneath so saved money shows in the picture.
              Tapping the number opens the Stats page; the spending sparkline sits
              washed-out behind everything (overflow-hidden clips it to the card's
              radius). */}
          <View>
            {/* min-h matches the Stats headline card exactly, so tapping through
                feels like the same card changing rooms. (Keep in sync with
                Stats.tsx.) The shadow rides on a wrapper: the card itself clips
                the sparkline, and a clipping view can't cast one. */}
            <View style={styles.heroShadow}>
              <View style={styles.hero}>
                {!locked && (
                  <SparkArea
                    values={sparkValues}
                    stroke="rgba(245, 99, 0, 0.4)"
                    fill="rgba(245, 99, 0, 0.1)"
                  />
                )}
                <Press
                  onPress={() => navigate("/stats")}
                  accessibilityLabel="See your stats"
                  style={styles.heroButton}
                >
                  {/* The headline is the running balance — it carries across
                      months instead of resetting to $0 on the 1st. Just the
                      month rides underneath for context: a per-month net would
                      be misleading here, since a carried-over surplus or
                      deficit isn't money earned or lost this month. (Per-month
                      spending lives on the Stats page.) */}
                  <NetTotal cents={balanceCents} label="Balance" masked={locked} />
                  <Text style={styles.month}>{monthLabel()}</Text>
                  {/* iOS-style disclosure hint: this number goes somewhere. */}
                  <View pointerEvents="none" style={styles.chevron}>
                    <ChevronRight size={20} strokeWidth={2} color={colors.labelMuted} />
                  </View>
                </Press>
                {/* Only the number is the stats tap target — this row already
                    has buttons of its own. `relative` keeps the row above the
                    sparkline. */}
                <View style={styles.safeRow}>
                  <Press onPress={() => navigate("/safe")} style={styles.safeButton}>
                    <View style={styles.safeBadge}>
                      <Vault size={20} strokeWidth={2} color={colors.income} />
                    </View>
                    <View style={styles.body}>
                      <Text style={styles.safeCaption}>In the safe</Text>
                      <View style={styles.safeValues}>
                        <View style={styles.safeValue}>
                          <Banknote size={16} strokeWidth={2} color={colors.income} />
                          <Text style={styles.safeCash}>
                            {reveal ? formatUsdCents(safeTotalCents) : "••••"}
                          </Text>
                        </View>
                        <View style={styles.safeValue}>
                          <Coins size={14} strokeWidth={2} color={GOLD_INK} />
                          <Text style={styles.safeGold}>
                            {reveal ? formatGrams(safeGoldGrams) : "•••"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Press>
                  <Press
                    onPress={() => setSafeShown((v) => !v)}
                    disabled={locked}
                    disabledOpacity={0.4}
                    accessibilityLabel={reveal ? "Hide safe balance" : "Show safe balance"}
                    accessibilityState={{ selected: reveal }}
                    style={styles.eye}
                  >
                    {reveal ? (
                      <EyeOff size={20} strokeWidth={2} color={withAlpha(colors.income, 0.7)} />
                    ) : (
                      <Eye size={20} strokeWidth={2} color={withAlpha(colors.income, 0.7)} />
                    )}
                  </Press>
                </View>
              </View>
            </View>
          </View>

          {/* "What's up, Doc?" — the add form is always visible and ready. While
              locked you can't encrypt new entries, so it's a nudge to unlock. */}
          <View style={styles.section}>
            <SectionHeader>What's up, Doc?</SectionHeader>
            {locked ? (
              <Press onPress={() => navigate("/settings")} style={styles.lockedCard}>
                <View style={styles.lockBadge}>
                  <Lock size={20} strokeWidth={2} color={colors.labelSecondary} />
                </View>
                <Text style={styles.lockedText}>
                  Locked — enter your passphrase in Settings to view and add.
                </Text>
              </Press>
            ) : (
              <View style={styles.card}>
                <AddComposer editing={editing} onClearEdit={clearEdit} />
              </View>
            )}
          </View>

          {/* History — today's entries inline; everything else in the drawer. */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <SectionHeader>History</SectionHeader>
              {transactions.length > 0 && (
                <Press onPress={() => navigate("/history")} style={styles.showAll}>
                  <Text style={styles.showAllText}>Show all</Text>
                </Press>
              )}
            </View>
            {loading && transactions.length === 0 ? (
              <Text style={styles.empty}>Loading…</Text>
            ) : todays.length > 0 ? (
              <HistoryList rows={todays} onEdit={handleEdit} onDelete={handleDelete} />
            ) : (
              <Text style={styles.empty}>
                {transactions.length > 0
                  ? "Nothin' today, Doc."
                  : "Nothin' here yet, Doc. Add your first one above."}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  // mx-auto flex min-h-full max-w-md flex-col gap-5 px-4
  column: {
    flexGrow: 1,
    width: "100%",
    maxWidth: COLUMN_MAX_WIDTH,
    alignSelf: "center",
    gap: space(5),
    paddingHorizontal: space(4),
  },
  // flex items-center justify-between px-1
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space(1),
  },
  brand: { flexDirection: "row", alignItems: "center", gap: space(2) },
  // font-display text-sm uppercase leading-none text-label-muted
  wordmark: {
    ...display,
    fontSize: 14,
    lineHeight: 14,
    color: colors.labelMuted,
  },
  navActions: { flexDirection: "row", alignItems: "center", gap: space(4) },
  // -m-2 p-2
  navButton: { margin: -space(2), padding: space(2) },
  // shadow-card on a wrapper, same radius + bg as the clipping card.
  heroShadow: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  // relative min-h-[188px] overflow-hidden rounded-card bg-surface px-5 py-5
  hero: {
    position: "relative",
    minHeight: 188,
    overflow: "hidden",
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: space(5),
    paddingVertical: space(5),
  },
  heroButton: { position: "relative", width: "100%" },
  // mt-1 text-[13px] font-medium text-label-secondary
  month: {
    marginTop: space(1),
    ...text["13"],
    fontWeight: weight.medium,
    color: colors.labelSecondary,
  },
  // absolute right-0 top-1/2 -translate-y-1/2
  chevron: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  // relative mt-4 flex items-center gap-3 rounded-card bg-income/10 px-4 py-3
  safeRow: {
    position: "relative",
    marginTop: space(4),
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    borderRadius: radius.card,
    backgroundColor: withAlpha(colors.income, 0.1),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  // flex min-w-0 flex-1 items-center gap-3
  safeButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
  },
  // h-9 w-9 rounded-full bg-income/15
  safeBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.income, 0.15),
  },
  body: { flex: 1, minWidth: 0 },
  // text-[11px] font-semibold uppercase tracking-wide text-income
  safeCaption: {
    ...text["11"],
    fontWeight: weight.semibold,
    textTransform: "uppercase",
    letterSpacing: trackingWide(11),
    color: colors.income,
  },
  // flex flex-wrap items-center gap-x-3 gap-y-0.5
  safeValues: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space(3),
    rowGap: space(0.5),
  },
  // flex items-center gap-1
  safeValue: { flexDirection: "row", alignItems: "center", gap: space(1) },
  // font-numeric text-xl font-bold tabular-nums text-income
  safeCash: { ...numeric, ...text.xl, fontWeight: weight.bold, color: colors.income },
  // font-numeric text-sm font-bold tabular-nums, GOLD_INK
  safeGold: { ...numeric, ...text.sm, fontWeight: weight.bold, color: GOLD_INK },
  // -m-2 shrink-0 p-2
  eye: { margin: -space(2), padding: space(2) },
  // flex flex-col gap-2
  section: { gap: space(2) },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  // px-2 text-sm font-semibold text-carrot
  showAll: { paddingHorizontal: space(2) },
  showAllText: { ...text.sm, fontWeight: weight.semibold, color: colors.carrot },
  // rounded-card bg-surface shadow-card
  card: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  // flex w-full items-center gap-3 rounded-card bg-surface px-4 py-3.5 shadow-card
  lockedCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
    boxShadow: shadows.card,
  },
  // h-9 w-9 rounded-full bg-grouped
  lockBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.grouped,
  },
  // text-sm text-label
  lockedText: { ...text.sm, flex: 1, color: colors.label },
  // py-10 text-center text-label-secondary
  empty: {
    paddingVertical: space(10),
    textAlign: "center",
    ...text.base,
    color: colors.labelSecondary,
  },
});
