import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Coins,
  StickyNote,
  Vault,
  type LucideIcon,
} from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen, type Gradient } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import posthog from "@/lib/posthog";
import { SAFE_CATEGORY_ID } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatSignedUsdCents, formatUsdCents } from "@/lib/money";
import { fetchGoldUsdPerGram, formatGrams } from "@/lib/gold";
import {
  black,
  display,
  motion,
  numeric,
  radius,
  shadows,
  space,
  text,
  trackingWide,
  weight,
  white,
  withAlpha,
} from "@/lib/theme";
import type { SafeGoldEntry, Transaction } from "@/types/db";

type Asset = "cash" | "gold";

const SYMBOL: Record<Currency, string> = { USD: "$", LBP: "LL" };

// The Safe lives in its own dark "vault" world — a deliberately different
// mentality from the bright daily tracker. The gradient is painted on the
// scrolling content and fades over the first ~640px, then holds a deep green.
// Behind it sits a fixed, viewport-filling backdrop in that same terminal green
// (the floor), so an overscroll bounce can never flash the light canvas
// through. `Screen` paints both; nothing global is touched, so Home is
// unaffected on the way back.
const VAULT: Gradient = {
  colors: ["#0E4A37", "#0A3A2A", "#06281E"],
  stops: [0, 320, 640],
  floor: "#06281E",
};
const GOLD = "#FFD479";
const MINT = "#7CE6AA";
const TAKE = "#FFA866";

// Keep the typed amount clean: digits, a single dot, max two decimals.
function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) {
    v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 2);
  }
  return v;
}

// Grams allow finer precision — up to three decimals (milligrams).
function sanitizeGrams(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) {
    v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 3);
  }
  return v;
}

function parseGrams(display: string): number {
  if (!display || display === ".") return 0;
  const n = Number.parseFloat(display);
  // The input is sanitized to digits + one dot, so `n` is always a finite,
  // non-negative number here; the `: 0` fallback is purely defensive.
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function groupInt(s: string): string {
  const [i, d] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${grouped}.${d}` : grouped;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Cash and gold normalized into one shape for the shared history list.
type Move = {
  key: string;
  kind: Asset;
  isDeposit: boolean; // true = added to the safe
  occurredAt: string;
  note: string | null;
  cents?: number;
  grams?: number;
  isLbp?: boolean;
  mask?: string; // obscured stand-in shown while locked
  onDelete: () => void | Promise<void>;
};

const TIMING = { duration: motion.transition };

// One half of a pill toggle. The web's `transition` class eases the active
// background and text color over 150ms; here Reanimated does the same on the
// UI thread. Colors tween in place (so Add/Take re-tint smoothly when the
// asset flips), and the 16px icon cross-fades between its two tints since an
// SVG stroke can't be interpolated as a style.
function Segment({
  active,
  activeBg,
  inactiveBg,
  activeText,
  shadow = false,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  activeBg: string;
  inactiveBg: string;
  activeText: string;
  /** `shadow-segment` on the active side (the gold tile has none). */
  shadow?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const inactiveText = white(0.55);
  const bgStyle = useAnimatedStyle(
    () => ({ backgroundColor: withTiming(active ? activeBg : inactiveBg, TIMING) }),
    [active, activeBg, inactiveBg],
  );
  const textStyle = useAnimatedStyle(
    () => ({ color: withTiming(active ? activeText : inactiveText, TIMING) }),
    [active, activeText, inactiveText],
  );
  const onStyle = useAnimatedStyle(() => ({ opacity: withTiming(active ? 1 : 0, TIMING) }), [active]);
  const offStyle = useAnimatedStyle(() => ({ opacity: withTiming(active ? 0 : 1, TIMING) }), [active]);

  return (
    <Press onPress={onPress} style={styles.segment}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.segmentBg,
          active && shadow && { boxShadow: shadows.segment },
          bgStyle,
        ]}
      />
      <View style={styles.segmentIcon}>
        <Animated.View style={[StyleSheet.absoluteFill, offStyle]}>
          <Icon size={16} strokeWidth={2.5} color={inactiveText} />
        </Animated.View>
        <Animated.View style={onStyle}>
          <Icon size={16} strokeWidth={2.5} color={activeText} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.segmentText, textStyle]}>{label}</Animated.Text>
    </Press>
  );
}

export function Safe() {
  const {
    safeTotalCents,
    transactions,
    addTransaction,
    deleteTransaction,
    safeGoldGrams,
    safeGoldEntries,
    addSafeGoldEntry,
    deleteSafeGoldEntry,
    lbpPerUsd,
    locked,
  } = useStore();

  const [asset, setAsset] = useState<Asset>("cash");
  const [isDeposit, setIsDeposit] = useState(true);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [display, setDisplay] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort live gold price (USD per gram); null while loading or if the
  // API is unreachable. Grams work fine without it.
  const [goldPerGram, setGoldPerGram] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    fetchGoldUsdPerGram().then((v) => {
      if (active) setGoldPerGram(v);
    });
    return () => {
      active = false;
    };
  }, []);

  const isGold = asset === "gold";
  const amount = parseAmountString(display);
  const usdCents = toUsdCents(amount, currency, lbpPerUsd);
  const grams = parseGrams(display);
  const canSave = (isGold ? grams > 0 : amount > 0) && !saving && !locked;

  function switchAsset(next: Asset) {
    setAsset(next);
    setDisplay("");
    setError(null);
  }

  async function save() {
    // Defensive: the CTA is disabled unless canSave, so this never returns.
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const trimmedNote = note.trim();
    const noteValue = trimmedNote === "" ? null : trimmedNote;
    const { error: saveError } = isGold
      ? await addSafeGoldEntry({ is_deposit: isDeposit, grams, note: noteValue })
      : await addTransaction({
          // Adding to the safe leaves your balance → an expense (Out).
          // Taking it back comes in → income (In).
          is_income: !isDeposit,
          category: SAFE_CATEGORY_ID,
          amount_usd_cents: usdCents,
          original_currency: currency,
          original_amount: amount,
          rate_used: lbpPerUsd,
          note: noteValue,
        });

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    if (isGold) {
      posthog.capture(isDeposit ? "safe_gold_deposited" : "safe_gold_withdrawn");
    } else {
      posthog.capture(isDeposit ? "safe_cash_deposited" : "safe_cash_withdrawn", {
        currency,
      });
    }
    setDisplay("");
    setNote("");
  }

  function confirmDelete(run: () => Promise<unknown>) {
    Alert.alert("Delete this safe movement?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  }

  // Cash safe movements are the "safe"-category transactions; merge with gold.
  const cashMoves: Move[] = transactions
    .filter((t) => t.category === SAFE_CATEGORY_ID)
    .map((t: Transaction) => ({
      key: `cash-${t.id}`,
      kind: "cash",
      isDeposit: !t.is_income,
      occurredAt: t.occurred_at,
      note: t.note,
      cents: t.amount_usd_cents,
      isLbp: t.original_currency === "LBP",
      mask: t.amountMask,
      onDelete: () => confirmDelete(() => deleteTransaction(t.id)),
    }));
  const goldMoves: Move[] = safeGoldEntries.map((e: SafeGoldEntry) => ({
    key: `gold-${e.id}`,
    kind: "gold",
    isDeposit: e.is_deposit,
    occurredAt: e.occurred_at,
    note: e.note,
    grams: e.grams,
    mask: e.gramsMask,
    onDelete: () => confirmDelete(() => deleteSafeGoldEntry(e.id)),
  }));
  const movements = [...cashMoves, ...goldMoves].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const goldValueCents =
    goldPerGram != null ? Math.round(safeGoldGrams * goldPerGram * 100) : null;
  const enteredGoldValueCents =
    goldPerGram != null && grams > 0
      ? Math.round(grams * goldPerGram * 100)
      : null;

  const amountLabel = isGold
    ? formatGrams(grams)
    : currency === "USD"
      ? formatUsdCents(usdCents)
      : `${groupInt(display)} LBP`;
  const cta = locked
    ? "Unlock in Settings to move money"
    : saving
      ? "Saving…"
      : (isGold ? grams : amount) <= 0
        ? `Enter ${isGold ? "an amount of gold" : "an amount"}`
        : isDeposit
          ? `Add ${amountLabel} to safe`
          : `Take ${amountLabel} out`;

  const actionColor = isGold ? GOLD : isDeposit ? "#1FB85A" : "#E0631A";
  const actionText = isGold ? "#06281E" : "#FFFFFF";
  const actionClear = withAlpha(actionColor, 0);

  // The CTA's `transition`: background and text ease between the action tint
  // and the dimmed disabled look.
  const ctaBg = useAnimatedStyle(
    () => ({
      backgroundColor: withTiming(canSave ? actionColor : "rgba(255,255,255,0.08)", TIMING),
    }),
    [canSave, actionColor],
  );
  const ctaText = useAnimatedStyle(
    () => ({ color: withTiming(canSave ? actionText : "rgba(255,255,255,0.4)", TIMING) }),
    [canSave, actionText],
  );

  return (
    <Screen gradient={VAULT} statusBar="light" gap={space(6)}>
      {/* Dark nav: back chevron + centered title. */}
      <NavHeader title="The Safe" onBack={() => navigate("/")} dark tint={GOLD} />

      {/* TOTALS — cash and gold in one vault card. */}
      <View>
        <View style={styles.vaultCard}>
          <View style={styles.vaultHead}>
            <Vault size={16} strokeWidth={2} color={white(0.55)} />
            <Text style={styles.vaultHeadText}>In the safe</Text>
          </View>

          <View style={[styles.assetHead, { marginTop: space(3) }]}>
            <Banknote size={14} strokeWidth={2} color={white(0.45)} />
            <Text style={styles.assetHeadText}>Cash</Text>
          </View>
          <Text style={[styles.bigNumber, { color: safeTotalCents < 0 ? "#FF8A8A" : MINT }]}>
            {locked ? "$•••••" : formatSignedUsdCents(safeTotalCents)}
          </Text>

          <View style={[styles.assetHead, { marginTop: space(4) }]}>
            <Coins size={14} strokeWidth={2} color={white(0.45)} />
            <Text style={styles.assetHeadText}>Gold</Text>
          </View>
          <Text style={[styles.bigNumber, { color: GOLD }]}>
            {locked ? "••••" : formatGrams(safeGoldGrams)}
          </Text>
          {locked ? (
            <Text style={[styles.tiny, { color: white(0.3) }]}>
              Locked — unlock in Settings to see the safe.
            </Text>
          ) : goldValueCents != null ? (
            <Text style={[styles.tiny, { color: white(0.45) }]}>
              ≈ {formatUsdCents(goldValueCents)} ·{" "}
              {/* goldValueCents != null implies goldPerGram != null; the `?? 0`
                  is defensive for the type-checker only. */}
              {formatUsdCents(Math.round((goldPerGram ?? 0) * 100))}/g (live)
            </Text>
          ) : (
            <Text style={[styles.tiny, { color: white(0.3) }]}>
              Tracked in grams — live price unavailable.
            </Text>
          )}

          <Text style={[styles.tiny, { marginTop: space(3), color: white(0.45) }]}>
            Cash here is moved out of your spendable balance; gold is tracked
            separately in grams.
          </Text>
        </View>
      </View>

      {/* COMPOSER — choose cash or gold, then add to or take from the safe. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Move money</Text>
        <View style={styles.composer}>
          {/* Cash / Gold asset selector. */}
          <View style={styles.track}>
            <Segment
              active={!isGold}
              activeBg={white(0.15)}
              inactiveBg={white(0)}
              activeText="#FFFFFF"
              shadow
              icon={Banknote}
              label="Cash"
              onPress={() => switchAsset("cash")}
            />
            <Segment
              active={isGold}
              activeBg={GOLD}
              inactiveBg={withAlpha(GOLD, 0)}
              activeText="#06281E"
              icon={Coins}
              label="Gold"
              onPress={() => switchAsset("gold")}
            />
          </View>

          {/* Add / Take toggle. */}
          <View style={styles.track}>
            <Segment
              active={isDeposit}
              activeBg={actionColor}
              inactiveBg={actionClear}
              activeText={actionText}
              shadow
              icon={ArrowDownToLine}
              label="Add"
              onPress={() => setIsDeposit(true)}
            />
            <Segment
              active={!isDeposit}
              activeBg={actionColor}
              inactiveBg={actionClear}
              activeText={actionText}
              shadow
              icon={ArrowUpFromLine}
              label="Take out"
              onPress={() => setIsDeposit(false)}
            />
          </View>

          {/* Amount (cash) or grams (gold). */}
          <View style={styles.field}>
            <View style={styles.symbol}>
              <Text style={[styles.symbolText, { color: isGold ? GOLD : MINT }]}>
                {isGold ? "g" : SYMBOL[currency]}
              </Text>
            </View>
            <TextInput
              keyboardType="decimal-pad"
              value={groupInt(display)}
              onChangeText={(t) => setDisplay(isGold ? sanitizeGrams(t) : sanitizeAmount(t))}
              placeholder={isGold ? "0" : "0.00"}
              placeholderTextColor={white(0.35)}
              accessibilityLabel={isGold ? "Grams" : "Amount"}
              selectionColor={isGold ? GOLD : MINT}
              style={styles.amountInput}
            />
            {isGold ? (
              <Text style={styles.unit}>grams</Text>
            ) : (
              <Press
                onPress={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
                accessibilityLabel="Switch currency"
                style={styles.currency}
                pressedStyle={{ backgroundColor: white(0.1) }}
              >
                <Text style={styles.currencyText}>{currency}</Text>
              </Press>
            )}
          </View>
          {isGold && enteredGoldValueCents != null && (
            <Text style={styles.approx}>
              ≈ {formatUsdCents(enteredGoldValueCents)} at the live price
            </Text>
          )}
          {!isGold && currency === "LBP" && amount > 0 && (
            <Text style={styles.approx}>≈ {formatUsdCents(usdCents)}</Text>
          )}

          {/* Note (optional). */}
          <View style={[styles.field, { paddingVertical: space(3) }]}>
            <StickyNote size={20} strokeWidth={2} color={white(0.45)} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={white(0.35)}
              accessibilityLabel="Note"
              maxLength={140}
              selectionColor={MINT}
              style={styles.noteInput}
            />
          </View>

          {/* CTA. */}
          <Press onPress={save} disabled={!canSave} style={styles.cta}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ctaBg, ctaBg]} />
            <Animated.Text style={[styles.ctaText, ctaText]}>{cta}</Animated.Text>
          </Press>

          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      </View>

      {/* HISTORY — cash and gold movements together. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safe history</Text>
        {movements.length === 0 ? (
          <Text style={styles.empty}>Nothin' in the safe yet, Doc. Add some above.</Text>
        ) : (
          <View style={styles.list}>
            {movements.map((m) => {
              const tone = m.kind === "gold" ? GOLD : m.isDeposit ? MINT : TAKE;
              const sign = m.isDeposit ? "+" : "-";
              // grams is always set on gold moves and cents on cash moves (see
              // construction above), so the non-null assertions hold.
              // While locked, `mask` holds an obscured stand-in instead.
              const right =
                m.mask != null
                  ? `${sign}${m.kind === "gold" ? m.mask : `$${m.mask}`}`
                  : m.kind === "gold"
                    ? `${sign}${formatGrams(m.grams!)}`
                    : `${sign}${formatUsdCents(m.cents!)}`;
              const Icon =
                m.kind === "gold"
                  ? Coins
                  : m.isDeposit
                    ? ArrowDownToLine
                    : ArrowUpFromLine;
              return (
                <SwipeToDelete
                  key={m.key}
                  onDelete={() => void m.onDelete()}
                  deleteColor="#E0463C"
                  style={styles.move}
                >
                  <View style={styles.moveBadge}>
                    <Icon size={20} strokeWidth={2} color={tone} />
                  </View>
                  <View style={styles.moveBody}>
                    <Text style={styles.moveTitle}>
                      {m.isDeposit ? "Added" : "Took out"}
                      {m.kind === "gold" ? " gold" : " cash"}
                    </Text>
                    {m.note && (
                      <Text style={styles.moveMeta} numberOfLines={1}>
                        {m.note}
                      </Text>
                    )}
                    <Text style={styles.moveMeta}>
                      {dateLabel(m.occurredAt)}
                      {m.kind === "cash" && m.isLbp && " · LBP"}
                    </Text>
                  </View>
                  <Text style={[styles.moveAmount, { color: tone }]}>{right}</Text>
                </SwipeToDelete>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // rounded-card bg-white/[0.06] px-5 py-6 ring-1 ring-white/10 (backdrop-blur skipped)
  vaultCard: {
    borderRadius: radius.card,
    backgroundColor: white(0.06),
    paddingHorizontal: space(5),
    paddingVertical: space(6),
    boxShadow: shadows.ringWhite10,
  },
  // flex items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-white/55
  vaultHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  vaultHeadText: {
    ...text["13"],
    fontWeight: weight.medium,
    textTransform: "uppercase",
    letterSpacing: trackingWide(13),
    color: white(0.55),
  },
  // flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/45
  assetHead: { flexDirection: "row", alignItems: "center", gap: space(2) },
  assetHeadText: {
    ...text["11"],
    fontWeight: weight.semibold,
    textTransform: "uppercase",
    letterSpacing: trackingWide(11),
    color: white(0.45),
  },
  // font-numeric text-4xl font-bold tabular-nums
  bigNumber: { ...numeric, ...text["4xl"], fontWeight: weight.bold },
  // mt-0.5 text-xs
  tiny: { marginTop: space(0.5), ...text.xs },
  // section: flex flex-col gap-2
  section: { gap: space(2) },
  // px-2 font-display text-sm font-semibold uppercase tracking-wide text-white/55
  sectionTitle: {
    ...display,
    ...text.sm,
    paddingHorizontal: space(2),
    letterSpacing: trackingWide(14),
    color: white(0.55),
  },
  // flex flex-col gap-3 rounded-card bg-white/[0.06] p-4 ring-1 ring-white/10
  composer: {
    gap: space(3),
    borderRadius: radius.card,
    backgroundColor: white(0.06),
    padding: space(4),
    boxShadow: shadows.ringWhite10,
  },
  // grid grid-cols-2 gap-1 rounded-pill bg-black/25 p-1
  track: {
    flexDirection: "row",
    gap: space(1),
    borderRadius: radius.pill,
    backgroundColor: black(0.25),
    padding: space(1),
  },
  // press flex items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space(1.5),
    borderRadius: radius.pill,
    paddingVertical: space(2.5),
  },
  segmentBg: { borderRadius: radius.pill },
  segmentIcon: { width: 16, height: 16 },
  segmentText: { ...text.base, fontWeight: weight.semibold },
  // flex items-center gap-3 rounded-card border border-white/15 bg-black/15 px-4 py-3.5
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: white(0.15),
    backgroundColor: black(0.15),
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
  },
  // h-10 w-10 shrink-0 rounded-full bg-white/10 text-base font-bold
  symbol: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: white(0.1),
  },
  symbolText: { ...text.base, fontWeight: weight.bold },
  // min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-white
  amountInput: {
    ...numeric,
    flex: 1,
    minWidth: 0,
    height: 36,
    fontSize: 30,
    fontWeight: weight.bold,
    color: "#FFFFFF",
    padding: 0,
    includeFontPadding: false,
  },
  // shrink-0 px-2 py-1 text-sm font-bold text-white/60
  unit: {
    ...text.sm,
    paddingHorizontal: space(2),
    paddingVertical: space(1),
    fontWeight: weight.bold,
    color: white(0.6),
  },
  // press shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-white/70 active:bg-white/10
  currency: { borderRadius: radius.lg, paddingHorizontal: space(2), paddingVertical: space(1) },
  currencyText: { ...text.sm, fontWeight: weight.bold, color: white(0.7) },
  // -mt-1 px-1 text-xs text-white/45
  approx: { marginTop: -space(1), paddingHorizontal: space(1), ...text.xs, color: white(0.45) },
  // min-w-0 flex-1 bg-transparent text-base text-white
  noteInput: {
    flex: 1,
    minWidth: 0,
    height: 24,
    fontSize: 16,
    color: "#FFFFFF",
    padding: 0,
    includeFontPadding: false,
  },
  // press mt-1 w-full rounded-pill py-3.5 text-lg font-semibold transition
  cta: {
    marginTop: space(1),
    width: "100%",
    borderRadius: radius.pill,
    paddingVertical: space(3.5),
    alignItems: "center",
  },
  ctaBg: { borderRadius: radius.pill },
  ctaText: { ...text.lg, fontWeight: weight.semibold },
  // text-center text-sm font-medium, #FF8A8A
  error: { textAlign: "center", ...text.sm, fontWeight: weight.medium, color: "#FF8A8A" },
  // py-10 text-center text-white/45
  empty: { paddingVertical: space(10), textAlign: "center", ...text.base, color: white(0.45) },
  // ul flex flex-col gap-1.5
  list: { gap: space(1.5) },
  // flex items-center gap-3 bg-[#163E2F] px-4 py-3.5 ring-1 ring-inset ring-white/10
  // — the sliding content is a plain rectangle; the frame clips its corners.
  move: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
    backgroundColor: "#163E2F",
    paddingHorizontal: space(4),
    paddingVertical: space(3.5),
    boxShadow: shadows.ringWhite10,
  },
  // h-10 w-10 shrink-0 rounded-pill bg-white/10
  moveBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: white(0.1),
  },
  moveBody: { flex: 1, minWidth: 0 },
  // font-medium text-white
  moveTitle: { ...text.base, fontWeight: weight.medium, color: "#FFFFFF" },
  // text-xs text-white/50
  moveMeta: { ...text.xs, color: white(0.5) },
  // font-numeric font-medium tabular-nums
  moveAmount: { ...numeric, ...text.base, fontWeight: weight.medium },
});
