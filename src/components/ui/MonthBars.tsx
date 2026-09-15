// A column chart of one figure per month. Hand-rolled, like SparkArea: two divs
// and a flexbox, no chart library.
//
// The unfinished month is the whole problem this component exists to solve. A
// window that ends today ends part-way through its last month, so that bar is
// shorter for no reason the reader did anything about — and a bar chart is read
// as a comparison whether or not the caption says otherwise. So a partial month
// is drawn hatched rather than solid, and says how far in it is. Nothing here
// projects the rest of it: an "at this rate" ghost bar would be a number the
// device never computed.

export type MonthBar = {
  key: string;
  /** "September 2026" — the accessible name. */
  label: string;
  /** "Sep" — what fits under the bar. */
  short: string;
  /** The bar's height, as a raw figure. Zero draws a floor sliver. */
  cents: number;
  /** Already formatted by the device that totalled it. */
  display: string;
  /** Days OF THAT MONTH inside the window, and the month's own length. */
  days: number;
  monthDays: number;
};

/** More months than this and per-bar labels stop fitting on a phone. */
const DENSE_AFTER = 7;

export function MonthBars({
  bars,
  color,
  label,
}: {
  bars: MonthBar[];
  /** The bar fill. */
  color: string;
  /** The chart's accessible name, e.g. "Spent per month". */
  label: string;
}) {
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.cents), 1);
  const dense = bars.length > DENSE_AFTER;

  return (
    <div className="flex flex-col gap-2" role="img" aria-label={label}>
      <ol className="flex h-28 items-end gap-1" data-testid="month-bars">
        {bars.map((bar) => {
          const partial = bar.days < bar.monthDays;
          return (
            <li
              key={bar.key}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              // The screen-reader name of the column: the chart above is one
              // image, so each bar states its own figure rather than relying on
              // a title attribute nothing announces.
              aria-label={`${bar.label}: ${bar.display}${
                partial ? ` over ${bar.days} days so far` : ""
              }`}
            >
              <div
                className="w-full rounded-t-[4px]"
                style={{
                  // Even an empty month keeps a visible floor, so a gap in the
                  // middle of the chart reads as zero rather than as missing.
                  height: `${Math.max((bar.cents / max) * 100, 2)}%`,
                  backgroundColor: partial ? "transparent" : color,
                  // A partial month is hatched in its own colour: the bar is
                  // real, its shortness is not a fact about spending.
                  backgroundImage: partial
                    ? `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)`
                    : undefined,
                }}
              />
            </li>
          );
        })}
      </ol>
      {/* A dense chart labels its ends only, and as one row rather than as
          thirty columns: "Jan" centred in a two-pixel column truncates to
          nothing. The span is also in the card's header either way. */}
      {dense ? (
        <div className="flex justify-between px-0.5 text-[10px] text-review-muted">
          <span>{bars[0].short}</span>
          <span>{bars[bars.length - 1].short}</span>
        </div>
      ) : (
        <ol className="flex gap-1">
          {bars.map((bar) => (
            <li
              key={bar.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
            >
              <span className="truncate text-[10px] text-review-muted">
                {bar.short}
              </span>
              <span className="font-numeric truncate text-[10px] font-bold tabular-nums text-review-text">
                {bar.display}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
