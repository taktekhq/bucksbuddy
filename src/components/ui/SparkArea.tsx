// A tiny hand-rolled area sparkline — no chart library, just two <path>s. It
// stretches to whatever box the caller gives it (preserveAspectRatio="none"),
// so it works both as the faded wash behind the Home hero and as the big
// daily-spend chart on the Stats page.

const VIEW_W = 100;
const VIEW_H = 32;
// Keep the line inside the box so the stroke isn't clipped at the peak/floor.
const PAD_Y = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Line + closed-area path data for a series, normalized to the viewBox.
 * Null when there aren't two points to connect. An all-zero series draws a
 * flat floor line (the max is clamped to 1 so nothing divides by zero).
 */
export function buildAreaPath(
  values: number[],
): { line: string; area: string } | null {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const stepX = VIEW_W / (values.length - 1);
  const line = values
    .map((v, i) => {
      const x = round2(i * stepX);
      const y = round2(VIEW_H - PAD_Y - (v / max) * (VIEW_H - 2 * PAD_Y));
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return { line, area: `${line} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z` };
}

type Props = {
  values: number[];
  /** Line color; pass rgba()/hex8 in `fill` to control the wash's opacity. */
  stroke: string;
  fill: string;
  className?: string;
};

export function SparkArea({ values, stroke, fill, className }: Props) {
  const paths = buildAreaPath(values);
  if (!paths) return null;
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="spark-area"
      className={className}
    >
      <path d={paths.area} fill={fill} />
      <path
        d={paths.line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        // The svg is stretched non-uniformly; keep the stroke width honest.
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
