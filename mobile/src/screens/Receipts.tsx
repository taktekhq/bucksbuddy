import { useMemo } from "react";
import { Text, View } from "react-native";
import { ChevronLeft, Lock } from "lucide-react-native";
import { Screen } from "@/components/ui/Screen";
import { Press } from "@/components/ui/Press";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { colors, withAlpha, OBSERVATORY } from "@/lib/theme";
import { categoryColor, categoryIcon, categoryLabel } from "@/lib/categories";
import { monthLabel } from "@/lib/dates";
import { formatUsdCents } from "@/lib/money";
import { treatTransactions, weekendTransactions } from "@/lib/stats";

// The receipts behind a tappable fun-fact chip: a read-only page listing this
// month's entries, reached from "Treat yourself" / "Weekend Spend" on Stats.
// A full page (not a drawer) so a long month scrolls with the document like
// everywhere else. Editing stays where the composer lives — Home.
//
// Same observatory dressing as Stats (OBSERVATORY comes from lib/theme, never
// redefined here), so the tap-through feels like stepping deeper into the same
// room.

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
    // The web's <main> classes, minus what Screen already supplies:
    // `mx-auto max-w-md min-h-full` and the safe-area halves of the paddings
    // (`pt-[calc(1rem+var(--safe-top))]` → `pt-4` + the inset). The
    // `fixed inset-0` floor div is Screen's `gradient.floor` (PORTING §2e).
    <Screen
      gradient={OBSERVATORY}
      statusBar="light"
      className="flex flex-col gap-5 px-4 pb-8 pt-4 text-white"
    >
      {/* Dark nav: back chevron to Stats + centered title. */}
      <View className="relative flex flex-row items-center justify-center py-1">
        <Press
          onPress={() => navigate("/stats")}
          accessibilityLabel="Back"
          className="absolute left-0 -m-2 p-2 text-carrot"
        >
          {/* `h-6 w-6` → size={24}, `text-carrot` → color prop (PORTING §2b). */}
          <ChevronLeft size={24} strokeWidth={2.5} color={colors.carrot} />
        </Press>
        <Text className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          {kind === "treats" ? "Treat Yourself" : "Weekend Spend"}
        </Text>
      </View>

      {masked ? (
        // Masked amounts would list as zeros — nudge to unlock instead.
        <Press
          onPress={() => navigate("/settings")}
          className="flex flex-row w-full items-center gap-3 rounded-card bg-white/10 px-4 py-3.5 text-left"
        >
          <View className="flex flex-row h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Lock size={20} strokeWidth={2} color={withAlpha(colors.white, 0.7)} />
          </View>
          <Text className="flex-1 text-sm text-white/85">
            These entries are encrypted. Enter your passphrase in Settings to
            see them.
          </Text>
        </Press>
      ) : (
        <>
          {/* The month and its damage. */}
          <View className="rounded-card bg-white/10 px-5 py-4">
            <View className="flex flex-row items-baseline justify-between gap-3">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
                {monthLabel()}
              </Text>
              <Text className="font-numeric text-xl font-bold tabular-nums text-white">
                {formatUsdCents(totalCents)}
              </Text>
            </View>
            <Text className="text-xs text-white/55">{count(rows.length, "entry", "entries")}</Text>
          </View>

          {rows.length === 0 ? (
            <Text className="py-10 text-center text-white/55">
              Nothin&apos; here this month, Doc.
            </Text>
          ) : (
            <View className="rounded-card bg-white/10 px-4">
              <View>
                {rows.map((tx, i) => {
                  const Icon = categoryIcon(tx.category);
                  const color = categoryColor(tx.category);
                  // `last:border-0` has no React Native variant: the 1px
                  // `border-b` simply goes on every row but the last, which is
                  // the same result (PORTING §4).
                  const last = i === rows.length - 1;
                  return (
                    <View
                      key={tx.id}
                      className={`flex flex-row items-center gap-3 ${last ? "" : "border-b border-white/5"} py-3`}
                    >
                      <View
                        className="flex flex-row h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${color}26` }}
                      >
                        <Icon size={16} strokeWidth={2} color={color} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="truncate text-sm font-semibold text-white" numberOfLines={1}>
                          {categoryLabel(tx.category)}
                        </Text>
                        {tx.note && (
                          <Text className="truncate text-xs text-white/55" numberOfLines={1}>
                            {tx.note}
                          </Text>
                        )}
                      </View>
                      <View className="shrink-0 text-right">
                        <Text className="font-numeric text-sm font-bold tabular-nums text-right text-white">
                          {formatUsdCents(tx.amount_usd_cents)}
                        </Text>
                        <Text className="text-xs text-white/45 text-right">
                          {shortDate(tx.occurred_at)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
