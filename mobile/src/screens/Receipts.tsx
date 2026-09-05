import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Lock } from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { monthLabel } from "@/lib/dates";
import { formatUsdCents } from "@/lib/money";
import { treatTransactions, weekendTransactions } from "@/lib/stats";
import type { Transaction } from "@/types/db";
import {
  colors,
  numeric,
  radius,
  text,
  trackingWide,
  weight,
  white,
  withAlpha,
} from "@/lib/theme";
import { OBSERVATORY } from "@/screens/Stats";

// The receipts behind a tappable fun-fact chip: a read-only page listing this
// month's entries, reached from "Treat yourself" / "Weekend Spend" on Stats.
// A full page (not a drawer) so a long month scrolls with the document like
// everywhere else. Editing stays where the composer lives — Home.
//
// Same observatory dressing as Stats (OBSERVATORY is imported, never redefined),
// so the tap-through feels like stepping deeper into the same room.

/** "1 entry" / "3 entries". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Jun 7" from an ISO timestamp. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function Receipts({ kind }: { kind: "treats" | "weekend" }) {
  const { transactions, locked } = useStore();

  const rows = useMemo(
    () =>
      kind === "treats"
        ? treatTransactions(transactions)
        : weekendTransactions(transactions),
    [kind, transactions],
  );
  const totalCents = rows.reduce((sum, r) => sum + r.amount_usd_cents, 0);
  const masked = locked || rows.some((r) => r.amountMask != null);

  return (
    <Screen gradient={OBSERVATORY} statusBar="light">
      {/* Dark nav: back chevron to Stats + centered title. The native stack
          pops back to the Stats this page was pushed from. */}
      <NavHeader title={kind === "treats" ? "Treat Yourself" : "Weekend Spend"} dark />

      {masked ? (
        // Masked amounts would list as zeros — nudge to unlock instead.
        <Press onPress={() => navigate("/settings")} style={styles.lockedCard}>
          <View style={styles.lockBadge}>
            <Lock size={20} strokeWidth={2} color={white(0.7)} />
          </View>
          <Text style={styles.lockedText}>
            These entries are encrypted. Enter your passphrase in Settings to see them.
          </Text>
        </Press>
      ) : (
        <>
          {/* The month and its damage. */}
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.microCaption}>{monthLabel()}</Text>
              <Text style={styles.total}>{formatUsdCents(totalCents)}</Text>
            </View>
            <Text style={styles.count}>{count(rows.length, "entry", "entries")}</Text>
          </View>

          {rows.length === 0 ? (
            <Text style={styles.empty}>Nothin' here this month, Doc.</Text>
          ) : (
            <View style={styles.list}>
              {rows.map((tx, i) => (
                <Row key={tx.id} tx={tx} last={i === rows.length - 1} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

// flex items-center gap-3 border-b border-white/5 py-3 last:border-0
const Row = memo(function Row({ tx, last }: { tx: Transaction; last: boolean }) {
  const Icon = categoryIcon(tx.category);
  const color = categoryColor(tx.category);
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.15) }]}>
        <Icon size={16} strokeWidth={2} color={color} />
      </View>
      <View style={styles.body}>
        <Text style={styles.label} numberOfLines={1}>
          {categoryLabel(tx.category)}
        </Text>
        {tx.note && (
          <Text style={styles.note} numberOfLines={1}>
            {tx.note}
          </Text>
        )}
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>{formatUsdCents(tx.amount_usd_cents)}</Text>
        <Text style={styles.date}>{shortDate(tx.occurred_at)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
  // h-9 w-9 shrink-0 rounded-full bg-white/10 text-white/70
  lockBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: white(0.1),
  },
  lockedText: { ...text.sm, flex: 1, color: white(0.85) },

  // rounded-card bg-white/10 px-5 py-4
  summary: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  // flex items-baseline justify-between gap-3
  summaryRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  // text-[11px] font-semibold uppercase tracking-wide text-white/55
  microCaption: {
    ...text["11"],
    fontWeight: weight.semibold,
    textTransform: "uppercase",
    letterSpacing: trackingWide(11),
    color: white(0.55),
  },
  // font-numeric text-xl font-bold tabular-nums
  total: { ...numeric, ...text.xl, fontWeight: weight.bold, color: colors.white },
  // text-xs text-white/55
  count: { ...text.xs, color: white(0.55) },

  // py-10 text-center text-white/55 — bare text, no card, like the web.
  empty: { ...text.base, paddingVertical: 40, textAlign: "center", color: white(0.55) },

  // rounded-card bg-white/10 px-4
  list: {
    borderRadius: radius.card,
    backgroundColor: white(0.1),
    paddingHorizontal: 16,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: white(0.05) },
  // h-8 w-8 shrink-0 rounded-full, tinted `${color}26`
  badge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0 },
  label: { ...text.sm, fontWeight: weight.semibold, color: colors.white },
  note: { ...text.xs, color: white(0.55) },
  right: { alignItems: "flex-end" },
  amount: { ...numeric, ...text.sm, fontWeight: weight.bold, color: colors.white },
  date: { ...text.xs, color: white(0.45) },
});
