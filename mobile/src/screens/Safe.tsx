import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Coins,
  StickyNote,
  Vault,
} from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { NavHeader } from "@/components/ui/NavHeader";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import posthog from "@/lib/posthog";
import { SAFE_CATEGORY_ID } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatSignedUsdCents, formatUsdCents } from "@/lib/money";
import { fetchGoldUsdPerGram, formatGrams } from "@/lib/gold";
import { black, display, numeric, radius, shadowSegment, white } from "@/lib/theme";
import type { SafeGoldEntry, Transaction } from "@/types/db";

type Asset = "cash" | "gold";

const SYMBOL: Record<Currency, string> = { USD: "$", LBP: "LL" };

// The Safe lives in its own dark "vault" world — a deliberately different
// mentality from the bright daily tracker. The gradient is painted on the
// scrolling content and fades over the first ~640px, then holds a deep green.
// Behind it sits a fixed, viewport-filling backdrop in that same terminal green
// (the floor), so an overscroll bounce can never flash the light canvas.
const VAULT = {
  colors: ["#0E4A37", "#0A3A2A", "#06281E"] as const,
  stops: [0, 320, 640] as const,
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
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function groupInt(s: string): string {
  const [i, d] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d !== undefined ? `${grouped}.${d}` : grouped;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
      posthog.capture(isDeposit ? "safe_cash_deposited" : "safe_cash_withdrawn", { currency });
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
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  const goldValueCents = goldPerGram != null ? Math.round(safeGoldGrams * goldPerGram * 100) : null;
  const enteredGoldValueCents =
    goldPerGram != null && grams > 0 ? Math.round(grams * goldPerGram * 100) : null;

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

  return (
    <Screen gradient={VAULT} statusBar="light" gap={24}>
      <NavHeader title="The Safe" onBack={() => navigate("/")} dark tint={GOLD} />

      {/* TOTALS — cash and gold in one vault card. */}
      <View style={styles.vaultCard}>
        <View style={styles.vaultHead}>
          <Vault size={16} strokeWidth={2} color={white(0.55)} />
          <Text style={styles.vaultHeadText}>In the safe</Text>
        </View>

        <View style={[styles.assetHead, { marginTop: 12 }]}>
          <Banknote size={14} strokeWidth={2} color={white(0.45)} />
          <Text style={styles.assetHeadText}>Cash</Text>
        </View>
        <Text style={[styles.bigNumber, { color: safeTotalCents < 0 ? "#FF8A8A" : MINT }]}>
          {locked ? "$•••••" : formatSignedUsdCents(safeTotalCents)}
        </Text>

        <View style={[styles.assetHead, { marginTop: 16 }]}>
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
            ≈ {formatUsdCents(goldValueCents)} · {formatUsdCents(Math.round((goldPerGram ?? 0) * 100))}/g
            (live)
          </Text>
        ) : (
          <Text style={[styles.tiny, { color: white(0.3) }]}>
            Tracked in grams — live price unavailable.
          </Text>
        )}

        <Text style={[styles.tiny, { marginTop: 12, color: white(0.45) }]}>
          Cash here is moved out of your spendable balance; gold is tracked separately in grams.
        </Text>
      </View>

      {/* COMPOSER — choose cash or gold, then add to or take from the safe. */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Move money</Text>
        <View style={styles.composer}>
          {/* Cash / Gold asset selector. */}
          <View style={styles.track}>
            <Press
              onPress={() => switchAsset("cash")}
              style={[styles.segment, !isGold && styles.segmentActive]}
            >
              <Banknote size={16} strokeWidth={2.5} color={!isGold ? "#FFF" : white(0.55)} />
              <Text style={[styles.segmentText, { color: !isGold ? "#FFF" : white(0.55) }]}>Cash</Text>
            </Press>
            <Press
              onPress={() => switchAsset("gold")}
              style={[styles.segment, isGold && { backgroundColor: GOLD }]}
            >
              <Coins size={16} strokeWidth={2.5} color={isGold ? "#06281E" : white(0.55)} />
              <Text style={[styles.segmentText, { color: isGold ? "#06281E" : white(0.55) }]}>Gold</Text>
            </Press>
          </View>

          {/* Add / Take toggle. */}
          <View style={styles.track}>
            <Press
              onPress={() => setIsDeposit(true)}
              style={[styles.segment, isDeposit && { backgroundColor: actionColor, ...shadowSegment }]}
            >
              <ArrowDownToLine size={16} strokeWidth={2.5} color={isDeposit ? actionText : white(0.55)} />
              <Text style={[styles.segmentText, { color: isDeposit ? actionText : white(0.55) }]}>Add</Text>
            </Press>
            <Press
              onPress={() => setIsDeposit(false)}
              style={[styles.segment, !isDeposit && { backgroundColor: actionColor, ...shadowSegment }]}
            >
              <ArrowUpFromLine size={16} strokeWidth={2.5} color={!isDeposit ? actionText : white(0.55)} />
              <Text style={[styles.segmentText, { color: !isDeposit ? actionText : white(0.55) }]}>
                Take out
              </Text>
            </Press>
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
            <Text style={styles.approx}>≈ {formatUsdCents(enteredGoldValueCents)} at the live price</Text>
          )}
          {!isGold && currency === "LBP" && amount > 0 && (
            <Text style={styles.approx}>≈ {formatUsdCents(usdCents)}</Text>
          )}

          {/* Note (optional). */}
          <View style={[styles.field, { paddingVertical: 12 }]}>
            <StickyNote size={20} strokeWidth={2} color={white(0.45)} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={white(0.35)}
              accessibilityLabel="Note"
              maxLength={140}
              style={styles.noteInput}
            />
          </View>

          {/* CTA. */}
          <Press
            onPress={save}
            disabled={!canSave}
            style={[
              styles.cta,
              canSave
                ? { backgroundColor: actionColor }
                : { backgroundColor: "rgba(255,255,255,0.08)" },
            ]}
          >
            <Text style={[styles.ctaText, { color: canSave ? actionText : "rgba(255,255,255,0.4)" }]}>
              {cta}
            </Text>
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
          <View style={{ gap: 6 }}>
            {movements.map((m) => {
              const tone = m.kind === "gold" ? GOLD : m.isDeposit ? MINT : TAKE;
              const sign = m.isDeposit ? "+" : "-";
              // While locked, `mask` holds an obscured stand-in instead.
              const right =
                m.mask != null
                  ? `${sign}${m.kind === "gold" ? m.mask : `$${m.mask}`}`
                  : m.kind === "gold"
                    ? `${sign}${formatGrams(m.grams!)}`
                    : `${sign}${formatUsdCents(m.cents!)}`;
              const Icon = m.kind === "gold" ? Coins : m.isDeposit ? ArrowDownToLine : ArrowUpFromLine;
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
                  <View style={{ flex: 1, minWidth: 0 }}>
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
  vaultCard: {
    borderRadius: radius.card,
    backgroundColor: white(0.06),
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: white(0.1),
  },
  vaultHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  vaultHeadText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: white(0.55),
  },
  assetHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  assetHeadText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: white(0.45),
  },
  bigNumber: { ...numeric, fontSize: 36, lineHeight: 40, fontWeight: "700" },
  tiny: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  section: { gap: 8 },
  sectionTitle: {
    ...display,
    paddingHorizontal: 8,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.35,
    color: white(0.55),
  },
  composer: {
    gap: 12,
    borderRadius: radius.card,
    backgroundColor: white(0.06),
    padding: 16,
    borderWidth: 1,
    borderColor: white(0.1),
  },
  track: {
    flexDirection: "row",
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: black(0.25),
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  segmentActive: { backgroundColor: white(0.15), ...shadowSegment },
  segmentText: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: white(0.15),
    backgroundColor: black(0.15),
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  symbol: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: white(0.1),
  },
  symbolText: { fontSize: 16, fontWeight: "700" },
  amountInput: {
    ...numeric,
    flex: 1,
    minWidth: 0,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    color: "#FFF",
    padding: 0,
  },
  unit: { paddingHorizontal: 8, paddingVertical: 4, fontSize: 14, fontWeight: "700", color: white(0.6) },
  currency: { borderRadius: radius.lg, paddingHorizontal: 8, paddingVertical: 4 },
  currencyText: { fontSize: 14, fontWeight: "700", color: white(0.7) },
  approx: { marginTop: -4, paddingHorizontal: 4, fontSize: 12, lineHeight: 16, color: white(0.45) },
  noteInput: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, color: "#FFF", padding: 0 },
  cta: { marginTop: 4, width: "100%", borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  ctaText: { fontSize: 18, lineHeight: 28, fontWeight: "600" },
  error: { textAlign: "center", fontSize: 14, lineHeight: 20, fontWeight: "500", color: "#FF8A8A" },
  empty: { paddingVertical: 40, textAlign: "center", fontSize: 16, lineHeight: 24, color: white(0.45) },
  move: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#163E2F",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: white(0.1),
  },
  moveBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: white(0.1),
  },
  moveTitle: { fontSize: 16, lineHeight: 24, fontWeight: "500", color: "#FFF" },
  moveMeta: { fontSize: 12, lineHeight: 16, color: white(0.5) },
  moveAmount: { ...numeric, fontSize: 16, lineHeight: 24, fontWeight: "500" },
});
