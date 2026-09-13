import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { RecapCard, type RecapCardProps } from "@/components/RecapCard";
import { useStore } from "@/lib/store";
import { navigate } from "@/lib/router";
import { supabase } from "@/lib/supabase";
import {
  aggregateRecap,
  initialRecapMonth,
  monthKey,
  parseMonth,
  recapName,
  recapTitles,
  type Recap,
  type RecapStyle,
} from "@/lib/recap";
import {
  downloadRecap,
  recapFilename,
  renderRecapPng,
  shareRecap,
  trackRecap,
  type RecapContext,
} from "@/lib/recapExport";
import { monthLabel } from "@/lib/dates";

const actionClass =
  "rounded-pill bg-carrot px-5 py-3 font-semibold text-white disabled:opacity-40";

// Mounted only with complete, authorized data. Unmount immediately on any
// invalidation/lock so in-flight captures cannot publish an obsolete image.
function ReadyCard({ card, month }: { card: RecapCardProps; month: string }) {
  const node = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [image, setImage] = useState<{
    card: RecapCardProps;
    blob: Blob;
    url: string;
    alt: string;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [shareRejected, setShareRejected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const alive = useRef(true);
  const latestCard = useRef(card);
  latestCard.current = card;
  const context: RecapContext = {
    style: card.style,
    period: card.current ? "current" : "past",
  };
  const ready = image?.card === card ? image : null;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setImage(null);
    setFailed(false);
    setShareRejected(false);
    setSharing(false);
    const source = node.current!;
    void renderRecapPng(source)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImage({ card, blob, url, alt: source.innerText });
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        trackRecap(
          "recap_failed",
          { style: card.style, period: card.current ? "current" : "past" },
          "render",
        );
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [card, attempt]);

  function download(prepared: NonNullable<typeof image>) {
    try {
      downloadRecap(prepared.url, recapFilename(month, card.style));
      trackRecap("recap_export_succeeded", context, "download");
    } catch {
      setShareRejected(true);
      trackRecap("recap_failed", context, "download");
    }
  }
  async function share(prepared: NonNullable<typeof image>, pngOnly: boolean) {
    setSharing(true);
    const result = await shareRecap(
      new File([prepared.blob], recapFilename(month, card.style), {
        type: "image/png",
      }),
      context,
      pngOnly,
    );
    if (!alive.current || latestCard.current !== card) return;
    setSharing(false);
    if (result === "download") download(prepared);
    if (result === "rejected") setShareRejected(true);
    if (result === "resolved")
      trackRecap("recap_export_succeeded", context, "share");
  }
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          width: 370,
          pointerEvents: "none",
        }}
      >
        <RecapCard ref={node} {...card} />
      </div>
      <div className="mx-auto w-full max-w-[370px]">
        {ready ? (
          <img
            src={ready.url}
            alt={ready.alt}
            className="h-auto w-full rounded-[22px]"
          />
        ) : (
          <RecapCard {...card} />
        )}
      </div>
      {!ready && !failed && <p role="status">Preparing your PNG…</p>}
      {failed && (
        <div role="alert">
          <p>Couldn’t create the PNG. Your preview and choices are saved.</p>
          <button
            className={actionClass}
            onClick={() => setAttempt((a) => a + 1)}
          >
            Retry PNG
          </button>
        </div>
      )}
      <p className="text-sm text-label-secondary">
        Only this card is shared. Categories, percentages and entry counts are
        visible; names and amounts are optional.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className={actionClass}
          disabled={!ready || sharing}
          onClick={ready ? () => void share(ready, false) : undefined}
        >
          Share card
        </button>
        <button
          className={actionClass}
          disabled={!ready}
          onClick={ready ? () => download(ready) : undefined}
        >
          Download PNG
        </button>
      </div>
      {shareRejected && (
        <div role="alert">
          <p>
            Sharing or saving wasn’t available. Try the PNG alone or Download
            PNG.
          </p>
          <button
            className={actionClass}
            disabled={!ready || sharing}
            onClick={ready ? () => void share(ready, true) : undefined}
          >
            Share PNG only
          </button>
        </div>
      )}
    </>
  );
}

export function RecapScreen() {
  const {
    loading,
    initializationError,
    refresh,
    locked,
    transactions,
    loadRecapMonth,
    homeCurrency,
  } = useStore();
  const [month, setMonth] = useState(() =>
    initialRecapMonth(window.location.hash),
  );
  const [style, setStyle] = useState<RecapStyle>("trading");
  const [titles, setTitles] = useState({ trading: "", monthly: "" });
  const [caption, setCaption] = useState(true);
  const [amounts, setAmounts] = useState(false);
  const [showName, setShowName] = useState(false);
  const [name, setName] = useState("");
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    token: object;
    recap: Recap | null;
    failed: boolean;
  } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const date = useMemo(() => parseMonth(month), [month]);
  const current = month === monthKey();
  const token = useMemo(
    () => ({}),
    [month, loading, locked, transactions, revision, loadRecapMonth],
  );
  const data = result?.token === token ? result : null;
  const recap = data?.recap;
  const options = recapTitles(
    style,
    recap ?? { categories: [], split: [], entries: 0, total: 0 },
  );
  const title = options.find((t) => t.id === titles[style]) ?? options[0];
  const card = useMemo(
    () =>
      recap && {
        recap,
        month: date,
        current,
        style,
        title,
        caption,
        amounts,
        name: showName ? recapName(name) : "",
        currency: homeCurrency,
      },
    [
      recap,
      date,
      current,
      style,
      title.id,
      caption,
      amounts,
      showName,
      name,
      homeCurrency,
    ],
  );

  useEffect(() => {
    trackRecap(
      "recap_opened",
      {
        style: "trading",
        period:
          initialRecapMonth(window.location.hash) === monthKey()
            ? "current"
            : "past",
      },
      "open",
    );
    const refresh = () => setRevision((r) => r + 1);
    const hashChange = () => setMonth(initialRecapMonth(window.location.hash));
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("hashchange", hashChange);
    // RLS limits events to this authenticated user's readable transactions.
    const channel = supabase
      .channel("recap-records")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        refresh,
      )
      .subscribe();
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("hashchange", hashChange);
      void supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    if (!loading && !locked) {
      void loadRecapMonth(date, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          const next = aggregateRecap(rows, date);
          setResult({ token, recap: next, failed: false });
          setTitles((old) => ({
            trading:
              recapTitles("trading", next).find((t) => t.id === old.trading)
                ?.id ?? recapTitles("trading", next)[0].id,
            monthly:
              recapTitles("monthly", next).find((t) => t.id === old.monthly)
                ?.id ?? recapTitles("monthly", next)[0].id,
          }));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResult({ token, recap: null, failed: true });
          trackRecap(
            "recap_failed",
            {
              style: "trading",
              period: month === monthKey() ? "current" : "past",
            },
            "load",
          );
        });
    }
    return () => controller.abort();
  }, [token, date, loading, locked, loadRecapMonth, month]);

  return (
    <main className="recap-controls ph-no-capture ph-mask mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(2rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))] text-label">
      <header className="flex items-center gap-3">
        <button aria-label="Back to Stats" onClick={() => navigate("/stats")}>
          <ChevronLeft />
        </button>
        <h1 className="font-display text-2xl">Recap</h1>
        <span className="ml-auto text-sm text-label-secondary">
          Made to share. Always free.
        </span>
      </header>
      <label>
        Month and year
        <input
          ref={picker}
          type="month"
          min="0001-01"
          max={monthKey()}
          value={month}
          onChange={(e) => {
            try {
              parseMonth(e.target.value);
              setMonth(e.target.value);
            } catch {
              /* Keep the last valid month while editing. */
            }
          }}
        />
      </label>
      <p>
        {monthLabel(date)}
        {current && " · Month so far"}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          Style
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as RecapStyle)}
          >
            <option value="trading">Trading card</option>
            <option value="monthly">Monthly recap</option>
          </select>
        </label>
        <label>
          Title
          <select
            disabled={!recap?.total}
            value={title.id}
            onChange={(e) =>
              setTitles((old) => ({ ...old, [style]: e.target.value }))
            }
          >
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-3">
        <label>
          <input
            type="checkbox"
            checked={caption}
            onChange={(e) => setCaption(e.target.checked)}
          />{" "}
          Include funny caption
        </label>
        <label>
          <input
            type="checkbox"
            checked={amounts}
            onChange={(e) => setAmounts(e.target.checked)}
          />{" "}
          Show amounts
        </label>
        <label>
          <input
            type="checkbox"
            checked={showName}
            onChange={(e) => setShowName(e.target.checked)}
          />{" "}
          Show name
        </label>
        {showName && (
          <label>
            Display name (optional, 24 characters)
            <input
              type="text"
              autoComplete="off"
              value={name}
              onChange={(e) =>
                setName(Array.from(e.target.value).slice(0, 24).join(""))
              }
            />
          </label>
        )}
      </div>
      {locked ? (
        <div>
          <p>Unlock with your passphrase to create a Recap.</p>
          <button className={actionClass} onClick={() => navigate("/settings")}>
            Unlock in Settings
          </button>
        </div>
      ) : data?.failed || initializationError ? (
        <div role="alert">
          <p>
            Couldn’t load and decrypt the complete month. Connect to the
            internet and retry. If an entry has an invalid amount, correct it in
            History.
          </p>
          <button
            className={actionClass}
            onClick={() => {
              if (initializationError) void refresh();
              else setRevision((r) => r + 1);
            }}
          >
            Retry
          </button>
          <button className="px-4" onClick={() => navigate("/history")}>
            Open History
          </button>
        </div>
      ) : !recap ? (
        <p role="status">Loading the complete month…</p>
      ) : !recap.total ? (
        <div>
          <p>No spending logged for this month yet.</p>
          <button
            className={actionClass}
            onClick={() => picker.current!.focus()}
          >
            Choose another month
          </button>
          <button className="px-4" onClick={() => navigate("/")}>
            Add expense
          </button>
        </div>
      ) : (
        card && <ReadyCard card={card} month={month} />
      )}
    </main>
  );
}
