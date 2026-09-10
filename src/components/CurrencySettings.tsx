import { useEffect, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  CURRENCIES,
  parseRateString,
  type Currency,
} from "@/lib/currency";
import { symbolPrefix } from "@/lib/money";

// Keep a typed rate clean: digits and a single dot (any number of decimals —
// "0.92" needs two, a rate the other way round can need six).
function sanitizeRate(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  return v;
}

const selectClass =
  "appearance-none truncate rounded-lg border border-separator bg-transparent py-2 pl-3 pr-8 text-right text-base text-label outline-none ring-carrot/40 transition focus:ring-2";

// The currency card in Settings, an inset grouped list in the iOS style:
//   Main currency        [USD ▾]
//   LBP per $1           [89500] ×
//   EUR per $1           [0.92]  ×
//   Add currency…        [    ▾]
// Rates save on blur (no button) and flash a green check. Picking a currency
// to add opens a rate row for it; it only joins the list once a rate is typed.
export function CurrencySettings() {
  const { homeCurrency, currencies, transactions, setHomeCurrency, setCurrencies } =
    useStore();
  // A just-picked currency waiting for its first rate.
  const [pending, setPending] = useState<Currency | null>(null);
  // Which row just saved, for the check mark.
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const taken = new Set<string>([homeCurrency, ...currencies.map((c) => c.code)]);
  if (pending) taken.add(pending);
  const available = CURRENCIES.filter((c) => !taken.has(c.code));
  const homeUnit = `${symbolPrefix(homeCurrency)}1`;

  async function run(
    action: () => Promise<{ error: string | null }>,
    code?: string,
  ): Promise<boolean> {
    setErr(null);
    const { error } = await action();
    if (error) {
      setErr(error);
      return false;
    }
    if (code) {
      setSavedCode(code);
      setTimeout(() => setSavedCode(null), 1500);
    }
    return true;
  }

  async function changeHome(code: Currency) {
    // The stored numbers aren't converted, only read in the new currency — fine
    // for a fresh account, worth a pause once there's history.
    if (
      transactions.length > 0 &&
      !window.confirm(
        `Switch your main currency to ${code}? Existing entries keep their numbers as they are — they are not converted.`,
      )
    ) {
      return;
    }
    await run(() => setHomeCurrency(code));
  }

  async function commitRate(code: Currency, rate: number) {
    const next = currencies.some((c) => c.code === code)
      ? currencies.map((c) => (c.code === code ? { code, rate } : c))
      : [...currencies, { code, rate }];
    if (await run(() => setCurrencies(next), code)) setPending(null);
  }

  async function remove(code: Currency) {
    await run(() => setCurrencies(currencies.filter((c) => c.code !== code)));
  }

  return (
    <div className="divide-y divide-separator overflow-hidden rounded-card bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <label htmlFor="home-currency" className="text-base text-label">
          Main currency
        </label>
        <div className="relative min-w-0">
          <select
            id="home-currency"
            value={homeCurrency}
            onChange={(e) => void changeHome(e.target.value as Currency)}
            className={`${selectClass} max-w-[11rem] font-semibold`}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-label-secondary"
            strokeWidth={2}
          />
        </div>
      </div>

      {currencies.map((c) => (
        <RateRow
          key={c.code}
          code={c.code}
          homeUnit={homeUnit}
          initial={String(c.rate)}
          saved={savedCode === c.code}
          onCommit={(rate) => void commitRate(c.code, rate)}
          onRemove={() => void remove(c.code)}
        />
      ))}

      {pending && (
        <RateRow
          key={pending}
          code={pending}
          homeUnit={homeUnit}
          initial=""
          autoFocus
          saved={false}
          onCommit={(rate) => void commitRate(pending, rate)}
          onRemove={() => setPending(null)}
        />
      )}

      {!pending && available.length > 0 && (
        <div className="relative">
          <select
            aria-label="Add currency"
            value=""
            onChange={(e) => setPending(e.target.value as Currency)}
            className="w-full appearance-none bg-transparent px-4 py-3.5 text-base font-medium text-carrot outline-none"
          >
            <option value="" disabled>
              Add currency…
            </option>
            {available.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-label-secondary"
            strokeWidth={2}
          />
        </div>
      )}

      {err && <p className="px-4 py-2 text-sm font-medium text-danger">{err}</p>}
      <p className="px-4 py-3 text-xs text-label-secondary">
        Everything is kept in your main currency. Amounts typed in another
        currency convert at the rate you set here.
      </p>
    </div>
  );
}

// One secondary currency: "EUR per $1", its rate, and a remove button. Commits
// on blur (or Enter). Junk reverts to the saved rate — or, for a row that has
// no saved rate yet, drops the row.
function RateRow({
  code,
  homeUnit,
  initial,
  autoFocus = false,
  saved,
  onCommit,
  onRemove,
}: {
  code: Currency;
  homeUnit: string;
  initial: string;
  autoFocus?: boolean;
  saved: boolean;
  onCommit: (rate: number) => void;
  onRemove: () => void;
}) {
  const [value, setValue] = useState(initial);

  // Follow the stored rate when it changes underneath us (a save, or a home
  // switch re-basing every rate).
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  function commit() {
    const rate = parseRateString(value);
    if (rate === null) {
      if (initial === "") onRemove();
      else setValue(initial);
      return;
    }
    if (rate === Number(initial)) return;
    onCommit(rate);
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <label htmlFor={`rate-${code}`} className="text-base text-label">
        {code} per {homeUnit}
      </label>
      <div className="flex items-center gap-2">
        {saved && <Check className="h-4 w-4 text-income" strokeWidth={3} />}
        <input
          id={`rate-${code}`}
          type="text"
          inputMode="decimal"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(sanitizeRate(e.target.value))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-28 rounded-lg border border-separator px-3 py-2 text-right text-base tabular-nums text-label outline-none ring-carrot/40 transition focus:ring-2"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${code}`}
          className="press -mr-1 p-1 text-label-secondary"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
