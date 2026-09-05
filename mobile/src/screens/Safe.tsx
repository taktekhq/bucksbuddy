import { useEffect, useState } from "react";
import { Alert, Text, TextInput, View } from "react-native";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ChevronLeft,
  Coins,
  StickyNote,
  Vault,
} from "lucide-react-native";
import { Press } from "@/components/ui/Press";
import { Screen } from "@/components/ui/Screen";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import posthog from "@/lib/posthog";
import { SwipeToDelete } from "@/components/ui/SwipeToDelete";
import { SAFE_CATEGORY_ID } from "@/lib/categories";
import { type Currency, parseAmountString, toUsdCents } from "@/lib/currency";
import { formatSignedUsdCents, formatUsdCents } from "@/lib/money";
import { fetchGoldUsdPerGram, formatGrams } from "@/lib/gold";
import { colors, VAULT, withAlpha } from "@/lib/theme";
import type { SafeGoldEntry, Transaction } from "@/types/db";

type Asset = "cash" | "gold";

const SYMBOL: Record<Currency, string> = { USD: "$", LBP: "LL" };

// The Safe lives in its own dark "vault" world — a deliberately different
// mentality from the bright daily tracker. The web paints a gradient on the
// scrolling <main> that fades over the first ~640px and then holds a deep
// green, with a `fixed inset-0` floor behind it in that same terminal green so
// an overscroll bounce never flashes the light canvas through. Both are
// `Screen`'s job here (PORTING.md §2e) — `gradient={VAULT}` is the web's
// VAULT_BG and VAULT_FLOOR, verbatim, in lib/theme.
const GOLD = "#FFD479";
const MINT = "#7CE6AA";
const TAKE = "#FFA866";

// The web reads these off inherited `text-white/N`; an icon takes a color prop.
const WHITE_55 = withAlpha(colors.white, 0.55);
const WHITE_45 = withAlpha(colors.white, 0.45);

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

  // The web's `useThemeColor("#0E4A37")` tints the browser chrome to the
  // vault's top color; here the status bar goes light (see `Screen` below).

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

  // window.confirm("Delete this safe movement?") → the native alert (PORTING.md §1).
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

  return (
    // <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-4
    //   pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-white">
    // `mx-auto max-w-md` and the safe-area halves of the padding are Screen's.
    <Screen
      gradient={VAULT}
      statusBar="light"
      className="flex min-h-full flex-col gap-6 px-4 pb-8 pt-4 text-white"
    >
      {/* Dark nav: back chevron + centered title. */}
      <View className="relative flex flex-row items-center justify-center py-1">
        <Press
          onPress={() => navigate("/")}
          accessibilityLabel="Back"
          className="absolute left-0 -m-2 p-2"
        >
          {/* style={{ color: GOLD }} on the web's button — a color prop here. */}
          <ChevronLeft size={24} strokeWidth={2.5} color={GOLD} />
        </Press>
        <Text className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          The Safe
        </Text>
      </View>

      {/* TOTALS — cash and gold in one vault card. */}
      <View>
        {/* backdrop-blur isn't supported on native (PORTING.md §4) — dropped. */}
        <View className="rounded-card bg-white/[0.06] px-5 py-6 ring-1 ring-white/10">
          <View className="flex flex-row items-center gap-2 text-[13px] font-medium uppercase tracking-wide text-white/55">
            <Vault size={16} strokeWidth={2} color={WHITE_55} />
            <Text className="text-[13px] font-medium uppercase tracking-wide text-white/55">
              In the safe
            </Text>
          </View>

          <View className="mt-3 flex flex-row items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            <Banknote size={14} strokeWidth={2} color={WHITE_45} />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Cash
            </Text>
          </View>
          <Text
            className="font-numeric text-4xl font-bold tabular-nums"
            style={{ color: safeTotalCents < 0 ? "#FF8A8A" : MINT }}
          >
            {locked ? "$•••••" : formatSignedUsdCents(safeTotalCents)}
          </Text>

          <View className="mt-4 flex flex-row items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            <Coins size={14} strokeWidth={2} color={WHITE_45} />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
              Gold
            </Text>
          </View>
          <Text
            className="font-numeric text-4xl font-bold tabular-nums"
            style={{ color: GOLD }}
          >
            {locked ? "••••" : formatGrams(safeGoldGrams)}
          </Text>
          {locked ? (
            <Text className="mt-0.5 text-xs text-white/30">
              Locked — unlock in Settings to see the safe.
            </Text>
          ) : goldValueCents != null ? (
            <Text className="mt-0.5 text-xs text-white/45">
              ≈ {formatUsdCents(goldValueCents)} ·{" "}
              {/* goldValueCents != null implies goldPerGram != null; the `?? 0`
                  is defensive for the type-checker only. */}
              {formatUsdCents(Math.round((goldPerGram ?? 0) * 100))}/g (live)
            </Text>
          ) : (
            <Text className="mt-0.5 text-xs text-white/30">
              Tracked in grams — live price unavailable.
            </Text>
          )}

          <Text className="mt-3 text-xs text-white/45">
            Cash here is moved out of your spendable balance; gold is tracked
            separately in grams.
          </Text>
        </View>
      </View>

      {/* COMPOSER — choose cash or gold, then add to or take from the safe. */}
      <View className="flex flex-col gap-2">
        <Text className="px-2 font-display text-sm font-semibold uppercase tracking-wide text-white/55">
          Move money
        </Text>
        <View className="flex flex-col gap-3 rounded-card bg-white/[0.06] p-4 ring-1 ring-white/10">
          {/* Cash / Gold asset selector. */}
          {/* `grid grid-cols-2` → `flex-row` + `flex-1` on each half: React
              Native has no CSS grid (PORTING.md §4). Same for the toggle below. */}
          <View className="flex flex-row gap-1 rounded-pill bg-black/25 p-1">
            <Press
              onPress={() => switchAsset("cash")}
              className={`flex flex-row flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                !isGold ? "bg-white/15 text-white shadow-segment" : "text-white/55"
              }`}
            >
              <Banknote size={16} strokeWidth={2.5} color={!isGold ? colors.white : WHITE_55} />
              <Text
                className={`text-base font-semibold ${
                  !isGold ? "text-white" : "text-white/55"
                }`}
              >
                Cash
              </Text>
            </Press>
            <Press
              onPress={() => switchAsset("gold")}
              className="flex flex-row flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition"
              // The web's one style object carries backgroundColor *and* color;
              // text color doesn't inherit here, so it rides on the Text below.
              style={isGold ? { backgroundColor: GOLD } : undefined}
            >
              <Coins
                size={16}
                strokeWidth={2.5}
                color={isGold ? "#06281E" : "rgba(255,255,255,0.55)"}
              />
              <Text
                className="text-base font-semibold"
                style={isGold ? { color: "#06281E" } : { color: "rgba(255,255,255,0.55)" }}
              >
                Gold
              </Text>
            </Press>
          </View>

          {/* Add / Take toggle. */}
          <View className="flex flex-row gap-1 rounded-pill bg-black/25 p-1">
            <Press
              onPress={() => setIsDeposit(true)}
              className={`flex flex-row flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                isDeposit ? "shadow-segment" : "text-white/55"
              }`}
              style={isDeposit ? { backgroundColor: actionColor } : undefined}
            >
              <ArrowDownToLine
                size={16}
                strokeWidth={2.5}
                color={isDeposit ? actionText : WHITE_55}
              />
              <Text
                className={`text-base font-semibold ${isDeposit ? "" : "text-white/55"}`}
                style={isDeposit ? { color: actionText } : undefined}
              >
                Add
              </Text>
            </Press>
            <Press
              onPress={() => setIsDeposit(false)}
              className={`flex flex-row flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-base font-semibold transition ${
                !isDeposit ? "shadow-segment" : "text-white/55"
              }`}
              style={!isDeposit ? { backgroundColor: actionColor } : undefined}
            >
              <ArrowUpFromLine
                size={16}
                strokeWidth={2.5}
                color={!isDeposit ? actionText : WHITE_55}
              />
              <Text
                className={`text-base font-semibold ${!isDeposit ? "" : "text-white/55"}`}
                style={!isDeposit ? { color: actionText } : undefined}
              >
                Take out
              </Text>
            </Press>
          </View>

          {/* Amount (cash) or grams (gold). */}
          <View className="flex flex-row items-center gap-3 rounded-card border border-white/15 bg-black/15 px-4 py-3.5">
            <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-bold">
              <Text className="text-base font-bold" style={{ color: isGold ? GOLD : MINT }}>
                {isGold ? "g" : SYMBOL[currency]}
              </Text>
            </View>
            <TextInput
              keyboardType="decimal-pad"
              value={groupInt(display)}
              onChangeText={(t) => setDisplay(isGold ? sanitizeGrams(t) : sanitizeAmount(t))}
              placeholder={isGold ? "0" : "0.00"}
              accessibilityLabel={isGold ? "Grams" : "Amount"}
              selectionColor={isGold ? GOLD : MINT}
              className="min-w-0 flex-1 bg-transparent font-numeric text-3xl font-bold tabular-nums text-white placeholder:text-white/35"
            />
            {isGold ? (
              <Text className="shrink-0 px-2 py-1 text-sm font-bold text-white/60">grams</Text>
            ) : (
              <Press
                onPress={() => setCurrency((c) => (c === "USD" ? "LBP" : "USD"))}
                accessibilityLabel="Switch currency"
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-white/70 active:bg-white/10"
              >
                <Text className="text-sm font-bold text-white/70">{currency}</Text>
              </Press>
            )}
          </View>
          {isGold && enteredGoldValueCents != null && (
            <Text className="-mt-1 px-1 text-xs text-white/45">
              ≈ {formatUsdCents(enteredGoldValueCents)} at the live price
            </Text>
          )}
          {!isGold && currency === "LBP" && amount > 0 && (
            <Text className="-mt-1 px-1 text-xs text-white/45">
              ≈ {formatUsdCents(usdCents)}
            </Text>
          )}

          {/* Note (optional). */}
          <View className="flex flex-row items-center gap-3 rounded-card border border-white/15 bg-black/15 px-4 py-3">
            <StickyNote size={20} strokeWidth={2} color={WHITE_45} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              accessibilityLabel="Note"
              maxLength={140}
              selectionColor={GOLD}
              className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-white/35"
            />
          </View>

          {/* CTA. */}
          <Press
            onPress={save}
            disabled={!canSave}
            className="mt-1 w-full rounded-pill py-3.5 text-lg font-semibold transition"
            style={
              canSave
                ? { backgroundColor: actionColor }
                : { backgroundColor: "rgba(255,255,255,0.08)" }
            }
          >
            <Text
              className="w-full text-center text-lg font-semibold"
              style={canSave ? { color: actionText } : { color: "rgba(255,255,255,0.4)" }}
            >
              {cta}
            </Text>
          </Press>

          {error && (
            <Text className="text-center text-sm font-medium" style={{ color: "#FF8A8A" }}>
              {error}
            </Text>
          )}
        </View>
      </View>

      {/* HISTORY — cash and gold movements together. */}
      <View className="flex flex-col gap-2">
        <Text className="px-2 font-display text-sm font-semibold uppercase tracking-wide text-white/55">
          Safe history
        </Text>
        {movements.length === 0 ? (
          <Text className="py-10 text-center text-white/45">
            Nothin' in the safe yet, Doc. Add some above.
          </Text>
        ) : (
          <View className="flex flex-col gap-1.5">
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
                <View key={m.key}>
                  <SwipeToDelete
                    onDelete={() => void m.onDelete()}
                    deleteColor="#E0463C"
                    className="flex flex-row items-center gap-3 bg-[#163E2F] px-4 py-3.5 ring-1 ring-inset ring-white/10"
                  >
                    <View className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-white/10">
                      <Icon size={20} strokeWidth={2} color={tone} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="font-medium text-white">
                        {m.isDeposit ? "Added" : "Took out"}
                        {m.kind === "gold" ? " gold" : " cash"}
                      </Text>
                      {m.note && (
                        <Text className="truncate text-xs text-white/50" numberOfLines={1}>
                          {m.note}
                        </Text>
                      )}
                      <Text className="text-xs text-white/50">
                        {dateLabel(m.occurredAt)}
                        {m.kind === "cash" && m.isLbp && " · LBP"}
                      </Text>
                    </View>
                    <Text
                      className="font-numeric font-medium tabular-nums"
                      style={{ color: tone }}
                    >
                      {right}
                    </Text>
                  </SwipeToDelete>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
