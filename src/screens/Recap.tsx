import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Download, Lock, Share2 } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/MonthSwitcher";
import { RecapCard } from "@/components/recap/RecapCard";
import { RecapStory } from "@/components/recap/RecapStory";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { useThemeColor } from "@/lib/useThemeColor";
import posthog from "@/lib/posthog";
import { monthLabel } from "@/lib/dates";
import {
  cleanName,
  monthFacts,
  monthKey,
  monthKeyFromHash,
  NAME_MAX,
  nextRarity,
  parseMonthKey,
  RARITIES,
  rarityLabel,
  rarityStars,
  RecapDataError,
  shiftMonthKey,
  type MonthFacts,
  type RecapStyle,
} from "@/lib/recap";
import { RecapLoadError } from "@/lib/recapQuery";
import { defaultTitle, eligibleTitles, FALLBACK_TITLES } from "@/lib/recapTitles";
import { buildRecapView } from "@/lib/recapView";
import {
  deliverPng,
  downloadPng,
  pngFilename,
  shareTextFor,
  svgToPng,
} from "@/lib/recapExport";

// The Recap — "the binder": the fifth room, where a month of logging turns
// into a collectible card. Near-black under a single carrot spotlight, so the
// card is the one lit thing on the page. Deliberately distinct from the
// Stats observatory it's reached from.
//
// Privacy first: the card shows percentages and counts; amounts and the
// user's name are off every time the room is opened, and only go on the
// card when the toggles say so. Nothing is uploaded — the PNG is drawn on
// the device and handed to the share sheet or saved.
const BINDER_BG =
  "radial-gradient(70% 34% at 50% 0%, rgba(245,99,0,0.26) 0%, rgba(245,99,0,0) 100%), #141416";
const BINDER_FLOOR = "#141416";

// The exported width, in pixels; the height follows the layout's ratio.
const EXPORT_WIDTH = 1080;

type Load =
  | { status: "loading"; key: string }
  | { status: "error"; key: string; kind: "locked" | "incomplete" | "invalid" }
  | { status: "ready"; key: string; facts: MonthFacts };

const FALLBACK_IDS = new Set(FALLBACK_TITLES.map((t) => t.id));

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="press flex w-full items-center justify-between py-2 text-left"
    >
      <span className="text-[15px] text-white/90">{label}</span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-pill transition ${
          on ? "bg-carrot" : "bg-white/20"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-segment transition-[left] ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function Recap() {
  const { vaultReady, locked, loadMonth, homeCurrency } = useStore();
  useThemeColor("#2a1a12");

  // Which month: from the URL when Stats sent us here, else this one. Paging
  // rewrites the URL in place so a refresh keeps the month without the back
  // button having to walk through every month visited.
  const current = monthKey(new Date());
  const [key, setKey] = useState(() => monthKeyFromHash(window.location.hash));
  useEffect(() => {
    window.history.replaceState(null, "", `#/recap?month=${key}`);
  }, [key]);

  const [style, setStyle] = useState<RecapStyle>("card");
  // The title picked for each month, remembered while the room stays open.
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [showCaption, setShowCaption] = useState(true);
  const [showAmounts, setShowAmounts] = useState(false);
  const [showName, setShowName] = useState(false);
  const [name, setName] = useState("");

  const [load, setLoad] = useState<Load>({ status: "loading", key });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    posthog.capture("recap_opened", { period: key === current ? "current" : "past" });
    // Only the first open counts; paging months is the same visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the whole month, fresh, once the vault has been looked up. A month
  // switched away from mid-flight is abandoned, never shown late.
  useEffect(() => {
    if (!vaultReady) return;
    if (locked) {
      setLoad({ status: "error", key, kind: "locked" });
      return;
    }
    const controller = new AbortController();
    setLoad({ status: "loading", key });
    loadMonth(parseMonthKey(key)!, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        try {
          setLoad({ status: "ready", key, facts: monthFacts(rows, key) });
        } catch (err) {
          if (!(err instanceof RecapDataError)) throw err;
          setLoad({ status: "error", key, kind: "invalid" });
          posthog.capture("recap_failed", { stage: "load", kind: "invalid" });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const kind = err instanceof RecapLoadError ? err.kind : "incomplete";
        setLoad({ status: "error", key, kind });
        posthog.capture("recap_failed", { stage: "load", kind });
      });
    return () => controller.abort();
  }, [key, vaultReady, locked, loadMonth, attempt]);

  const facts = load.status === "ready" && load.key === key ? load.facts : null;
  const hasSpending = facts !== null && facts.totalCents > 0;

  const titles = useMemo(() => (hasSpending ? eligibleTitles(facts) : []), [facts, hasSpending]);
  const title = useMemo(
    () => (hasSpending ? (titles.find((t) => t.id === picks[key]) ?? defaultTitle(facts)) : null),
    [facts, hasSpending, titles, picks, key],
  );
  const cardName = showName ? cleanName(name) : "";
  const view = useMemo(
    () =>
      facts && hasSpending && title
        ? buildRecapView(facts, {
            title,
            stamps: titles.filter((t) => !FALLBACK_IDS.has(t.id)),
            showCaption,
            showAmounts,
            name: cardName,
            currency: homeCurrency,
          })
        : null,
    [facts, hasSpending, title, titles, showCaption, showAmounts, cardName, homeCurrency],
  );

  // The PNG is drawn ahead of the tap, so the share sheet can open inside
  // the tap itself (it won't open after an await). Everything that changes
  // the picture is in the key; a stale render is dropped, not shown.
  const viewKey = view
    ? [key, style, view.title.id, showCaption, showAmounts, cardName, homeCurrency].join("|")
    : null;
  const svgRef = useRef<SVGSVGElement>(null);
  const [png, setPng] = useState<{ key: string; blob: Blob } | null>(null);
  const [pngFailed, setPngFailed] = useState(false);
  const [pngAttempt, setPngAttempt] = useState(0);
  useEffect(() => {
    if (!viewKey) return;
    let cancelled = false;
    setPngFailed(false);
    // A short pause lets a run of taps (toggle, toggle, type a name) settle
    // into one render instead of one per keystroke.
    const timer = setTimeout(() => {
      const svg = svgRef.current;
      if (!svg) return;
      svgToPng(svg, EXPORT_WIDTH)
        .then((blob) => {
          if (!cancelled) setPng({ key: viewKey, blob });
        })
        .catch(() => {
          if (cancelled) return;
          setPngFailed(true);
          posthog.capture("recap_failed", { stage: "render" });
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [viewKey, pngAttempt]);
  const ready = png && png.key === viewKey ? png.blob : null;

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  function exported(method: "shared" | "downloaded") {
    posthog.capture("recap_exported", {
      style,
      method,
      period: key === current ? "current" : "past",
      rarity: view ? view.rarity : "none",
      amounts_shown: showAmounts,
      name_shown: cardName !== "",
    });
    setToast(method === "shared" ? "Shared. See you next month, Doc." : "Saved. See you next month, Doc.");
  }

  async function share() {
    if (!ready || !view) return;
    const result = await deliverPng(
      ready,
      pngFilename(key, style),
      shareTextFor(view.title.title, monthLabel(view.facts.month)),
    );
    if (result === "cancelled") return;
    exported(result);
  }

  function save() {
    if (!ready) return;
    downloadPng(ready, pngFilename(key, style));
    exported("downloaded");
  }

  const month = parseMonthKey(key)!;
  const monthNav = (
    <MonthSwitcher
      label={monthLabel(month)}
      onPrev={() => setKey((k) => shiftMonthKey(k, -1))}
      onNext={() => setKey((k) => shiftMonthKey(k, 1))}
      canPrev
      canNext={key < current}
    />
  );

  let body;
  if (!vaultReady || (load.status === "loading" && load.key === key) || (facts === null && load.status === "ready")) {
    body = (
      <p role="status" className="rounded-card bg-white/10 px-5 py-10 text-center text-white/60">
        Pulling your card…
      </p>
    );
  } else if (load.status === "error" && load.kind === "locked") {
    body = (
      <button
        type="button"
        onClick={() => navigate("/settings")}
        className="press flex w-full items-center gap-3 rounded-card bg-white/10 px-4 py-3.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70">
          <Lock className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="text-sm text-white/85">
          Your entries are encrypted. Enter your passphrase in Settings to pull
          this month&apos;s card.
        </span>
      </button>
    );
  } else if (load.status === "error") {
    body = (
      <div role="alert" className="flex flex-col gap-3 rounded-card bg-white/10 px-5 py-6 text-center">
        <p className="text-sm text-white/85">
          {load.kind === "invalid"
            ? "One of this month's entries has an amount that can't be read, so the card can't be trusted. Fix it in History and try again."
            : "Couldn't fetch the whole month, Doc. Check your connection and try again."}
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="press rounded-pill bg-carrot px-5 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
          {load.kind === "invalid" && (
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="press rounded-pill bg-white/10 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Open History
            </button>
          )}
        </div>
      </div>
    );
  } else if (!hasSpending) {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-card bg-white/10 px-5 py-8 text-center">
        <p className="text-base text-white/85">
          Nothin&apos; here yet, Doc. Log one thing and pull a card.
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="press rounded-pill bg-carrot px-6 py-2.5 text-base font-semibold text-white"
        >
          Add an entry
        </button>
      </div>
    );
  } else if (view && title) {
    const rarity = view.rarity;
    const next = nextRarity(view.facts);
    const stars = rarityStars(rarity);
    body = (
      <>
        {/* The card. The key replays the reveal when the month changes, not
            when a toggle redraws the same month. */}
        <section className="flex flex-col items-center gap-3">
          <div key={key} className="recap-reveal w-full max-w-[380px]">
            {style === "card" ? (
              <RecapCard ref={svgRef} view={view} />
            ) : (
              <RecapStory ref={svgRef} view={view} />
            )}
          </div>
          <p className="text-center text-sm text-white/60">
            {view.facts.current && next
              ? `Still filling. Log ${next.days} more ${next.days === 1 ? "day" : "days"} for ${rarityLabel(next.rarity)}.`
              : `${rarityLabel(rarity)}. Foil earned by ${view.facts.daysLogged} ${view.facts.daysLogged === 1 ? "day" : "days"} logged.`}
          </p>
        </section>

        {/* Choices. */}
        <section className="flex flex-col gap-4 rounded-card bg-white/10 p-4">
          <div
            role="tablist"
            aria-label="Layout"
            className="flex rounded-pill bg-white/10 p-0.5 text-xs font-semibold"
          >
            {(
              [
                ["card", "Card"],
                ["story", "Story"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={style === value}
                onClick={() => setStyle(value)}
                className={`press flex-1 rounded-pill py-2 transition ${
                  style === value ? "bg-carrot text-white shadow-segment" : "text-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
              Title · {titles.length - FALLBACK_TITLES.length} earned
            </p>
            <div
              role="radiogroup"
              aria-label="Title"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
            >
              {titles.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === title.id}
                  onClick={() => setPicks((p) => ({ ...p, [key]: t.id }))}
                  className={`press shrink-0 rounded-pill px-3.5 py-2 text-xs font-bold uppercase tracking-wide transition ${
                    t.id === title.id ? "bg-carrot text-white" : "bg-white/10 text-white/80"
                  }`}
                >
                  {t.title}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col divide-y divide-white/10">
            <Toggle label="Show the caption" on={showCaption} onChange={setShowCaption} />
            <Toggle label="Show amounts" on={showAmounts} onChange={setShowAmounts} />
            <Toggle label="Show my name" on={showName} onChange={setShowName} />
            {showName && (
              <label className="flex flex-col gap-1.5 py-3">
                <span className="text-xs text-white/60">Name on the card</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={NAME_MAX * 2}
                  autoComplete="off"
                  placeholder="Doc"
                  className="w-full rounded-pill border border-white/15 bg-white/10 px-4 py-2.5 text-base text-white outline-none ring-carrot/50 placeholder:text-white/35 focus:ring-2"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-white/45">
            Off by default: the card shows percentages and counts, never amounts
            or your name, unless you say so. Nothing leaves your phone.
          </p>
        </section>

        {/* Share and save. */}
        <section className="flex flex-col gap-2">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void share()}
              disabled={!ready}
              className="press flex flex-1 items-center justify-center gap-2 rounded-pill bg-carrot py-3.5 text-lg font-semibold text-white shadow-carrot disabled:opacity-40 disabled:shadow-none"
            >
              <Share2 className="h-5 w-5" strokeWidth={2.25} />
              Share
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!ready}
              aria-label="Save image"
              className="press flex items-center justify-center rounded-pill bg-white/10 px-5 text-white disabled:opacity-40"
            >
              <Download className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
          {pngFailed ? (
            <div role="alert" className="flex items-center justify-center gap-3 text-sm text-white/70">
              <span>The card didn&apos;t come out, Doc.</span>
              <button
                type="button"
                onClick={() => setPngAttempt((a) => a + 1)}
                className="press font-semibold text-carrot"
              >
                Try again
              </button>
            </div>
          ) : toast ? (
            <p role="status" className="text-center text-sm text-white/70">
              {toast}
            </p>
          ) : (
            <p role="status" className="text-center text-sm text-white/45">
              {ready ? "Ready to share." : "Preparing your card…"}
            </p>
          )}
        </section>

        {/* What's still in reach. */}
        <section className="flex flex-col gap-2 rounded-card bg-white/10 px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">
            Next pull
          </p>
          <div className="flex items-center gap-2" aria-label={`${rarityLabel(rarity)}, ${stars} of 5`}>
            {RARITIES.map((tier, i) => (
              <span
                key={tier.id}
                aria-hidden
                className={`h-2.5 flex-1 rounded-pill ${i < stars ? "bg-carrot" : "bg-white/15"}`}
              />
            ))}
          </div>
          <p className="text-sm text-white/75">
            {view.facts.current
              ? next
                ? `Log ${next.days} more ${next.days === 1 ? "day" : "days"} this month for a ${rarityLabel(next.rarity)} pull.`
                : rarity === "legendary"
                  ? "Every day logged. That's the gold one, Doc."
                  : "This month's foil is set. A fresh card starts on the 1st."
              : "Every day you log next month brings a rarer pull. Log every single day for the gold one."}
          </p>
        </section>
      </>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-white"
      style={{ background: BINDER_BG }}
    >
      <div
        aria-hidden
        className="fixed inset-0"
        style={{ background: BINDER_FLOOR, zIndex: -1 }}
      />

      <header className="relative flex items-center justify-center py-1">
        <button
          type="button"
          onClick={() => navigate("/stats")}
          aria-label="Back"
          className="press absolute left-0 -m-2 p-2 text-carrot"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
        </button>
        <h1 className="font-display text-base font-bold uppercase tracking-wide text-white/90">
          Recap
        </h1>
      </header>

      {monthNav}
      {body}
    </main>
  );
}
