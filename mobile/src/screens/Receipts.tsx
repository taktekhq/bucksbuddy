import { useMemo } from "react";
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
import { numeric, radius, white, withAlpha } from "@/lib/theme";
import { OBSERVATORY } from "@/screens/Stats";

// The receipts behind a tappable fun-fact chip: a read-only page listing this
// month's entries, reached from "Treat yourself" / "Weekend Spend" on Stats.
// A full page (not a drawer) so a long month scrolls with the document like
// everywhere else. Editing stays where the composer lives — Home.
//
// Same observatory dressing as Stats, so the tap-through feels like stepping
// deeper into the same room.

/** "1 entry" / "3 entries". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Jun 7" from an ISO timestamp. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function Receipts({ kind }: { kind: "treats" | "weekend" }) {
  const { transactions, locked } = useStore();

  const rows = useMemo(
    () => (kind === "treats" ? treatTransactions(transactions) : weekendTransactions(transactions)),
    [kind, transactions],
  );
  const totalCents = rows.reduce((sum, r) => sum + r.amount_usd_cents, 0);
  const masked = locked || rows.some((r) => r.amountMask != null);

  return (
    <Screen gradient={OBSERVATORY} statusBar="light">
      <NavHeader
        title={kind === "treats" ? "Treat Yourself" : "Weekend Spend"}
        onBack={() => navigate("/stats")}
        dark
      />

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
              <Text style={styles.caption}>{monthLabel()}</Text>
              <Text style={styles.total}>{formatUsdCents(totalCents)}</Text>
            </View>
            <Text style={styles.count}>{count(rows.length, "entry", "entries")}</Text>
          </View>

          {rows.length === 0 ? (
            <Text style={styles.empty}>Nothin' here this month, Doc.</Text>
          ) : (
            <View style={styles.list}>
              {rows.map((tx, i) => {
                const Icon = categoryIcon(tx.category);
                const color = categoryColor(tx.category);
                return (
                  <View key={tx.id} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
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
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  summary: { borderRadius: radius.card, backgroundColor: white(0.1), paddingHorizontal: 20, paddingVertical: 16 },
  summaryRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: white(0.55),
  },
  total: { ...numeric, fontSize: 20, lineHeight: 28, fontWeight: "700", color: "#FFF" },
  count: { fontSize: 12, lineHeight: 16, color: white(0.55) },
  empty: { paddingVertical: 40, textAlign: "center", fontSize: 16, lineHeight: 24, color: white(0.55) },
  list: { borderRadius: radius.card, backgroundColor: white(0.1), paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: white(0.05) },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#FFF" },
  note: { fontSize: 12, lineHeight: 16, color: white(0.55) },
  right: { alignItems: "flex-end" },
  amount: { ...numeric, fontSize: 14, lineHeight: 20, fontWeight: "700", color: "#FFF" },
  date: { fontSize: 12, lineHeight: 16, color: white(0.45) },
});
