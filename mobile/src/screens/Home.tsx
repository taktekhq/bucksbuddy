import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { Screen } from "@/components/ui/Screen";
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
import { colors, display, numeric, radius, shadowCard, withAlpha } from "@/lib/theme";
import type { Transaction } from "@/types/db";

// Amber/gold that reads on the light card (the metal, but legible).
const GOLD_INK = "#A16207";

// The savings tint: mint at the top fading into the canvas over 260px.
const SAVINGS_GRADIENT = {
  colors: ["#E6F8EE", "#F2F2F7"] as const,
  stops: [0, 260] as const,
  floor: colors.canvas,
};

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
  const [editing, setEditing] = useState<Transaction | null>(null);
  const scroll = useRef<ScrollView>(null);

  // The full history lives on its own "/history" page; the page itself only
  // lists today's entries so it doesn't grow without bound.
  const todays = transactions.filter((t) => isToday(t.occurred_at));

  // Editing a row on the full-history page navigates back here with the target
  // stashed; pick it up once the matching transaction is in hand.
  const [pendingEditId, setPendingEditId] = useState<string | null>(takePendingEdit);
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
    <Screen
      scrollRef={scroll}
      gradient={hasSavings ? SAVINGS_GRADIENT : undefined}
      floor={colors.canvas}
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
          <Press onPress={() => navigate("/settings")} accessibilityLabel="Settings" style={styles.navButton}>
            <Settings size={24} strokeWidth={1.75} color={colors.labelSecondary} />
          </Press>
        </View>
      </View>

      {/* Money for the month — month caption above the net number. The safe
          balance rides along underneath so saved money shows in the picture.
          Tapping the number opens the Stats page; the spending sparkline sits
          washed-out behind everything (overflow hidden clips it to the card's
          radius). */}
      <View>
        {/* min-h matches the Stats headline card exactly, so tapping through
            feels like the same card changing rooms. (Keep in sync with
            Stats.tsx.) */}
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
            {/* The headline is the running balance — it carries across months
                instead of resetting to $0 on the 1st. Just the month rides
                underneath for context. (Per-month spending lives on Stats.) */}
            <NetTotal cents={balanceCents} label="Balance" masked={locked} />
            <Text style={styles.month}>{monthLabel()}</Text>
            {/* iOS-style disclosure hint: this number goes somewhere. */}
            <View style={styles.chevron}>
              <ChevronRight size={20} strokeWidth={2} color={colors.labelMuted} />
            </View>
          </Press>
          {/* Only the number is the stats tap target — this row has buttons
              of its own. */}
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
              style={styles.eye}
              hitSlop={8}
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

      {/* History — today's entries inline; everything else on its own page. */}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmark: {
    ...display,
    fontSize: 14,
    lineHeight: 14,
    color: colors.labelMuted,
  },
  navActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  navButton: { padding: 8, margin: -8 },
  hero: {
    position: "relative",
    minHeight: 188,
    overflow: "hidden",
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...shadowCard,
  },
  heroButton: { position: "relative", width: "100%" },
  month: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: "500", color: colors.labelSecondary },
  chevron: { position: "absolute", right: 0, top: "50%", marginTop: -10 },
  safeRow: {
    position: "relative",
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: withAlpha(colors.income, 0.1),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  safeButton: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  safeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(colors.income, 0.15),
  },
  body: { flex: 1, minWidth: 0 },
  safeCaption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: colors.income,
  },
  safeValues: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 2 },
  safeValue: { flexDirection: "row", alignItems: "center", gap: 4 },
  safeCash: { ...numeric, fontSize: 20, lineHeight: 28, fontWeight: "700", color: colors.income },
  safeGold: { ...numeric, fontSize: 14, lineHeight: 20, fontWeight: "700", color: GOLD_INK },
  eye: { padding: 8, margin: -8 },
  section: { gap: 8 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  showAll: { paddingHorizontal: 8 },
  showAllText: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.carrot },
  card: { borderRadius: radius.card, backgroundColor: colors.surface, ...shadowCard },
  lockedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadowCard,
  },
  lockBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.grouped,
  },
  lockedText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.label },
  empty: {
    paddingVertical: 40,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    color: colors.labelSecondary,
  },
});
