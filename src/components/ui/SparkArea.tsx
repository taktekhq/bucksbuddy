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
 * The line is a Catmull-Rom spline rendered as cubic Béziers — daily points
 * roll into hills instead of sawtoothing.
 */
export function buildAreaPath(
  values: number[],
): { line: string; area: string } | null {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const stepX = VIEW_W / (values.length - 1);
  const points = values.map((v, i) => [
    round2(i * stepX),
    round2(VIEW_H - PAD_Y - (v / max) * (VIEW_H - 2 * PAD_Y)),
  ]);

  // Neighbors clamped at the ends; control y clamped to the padded box so a
  // sharp valley can't make the curve dip under the floor.
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  const clampY = (y: number) =>
    round2(Math.max(PAD_Y, Math.min(VIEW_H - PAD_Y, y)));

  let line = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    const c1 = `${round2(x1 + (x2 - x0) / 6)} ${clampY(y1 + (y2 - y0) / 6)}`;
    const c2 = `${round2(x2 - (x3 - x1) / 6)} ${clampY(y2 - (y3 - y1) / 6)}`;
    line += ` C${c1} ${c2} ${x2} ${y2}`;
  }
  return { line, area: `${line} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z` };
}

type Props = {
  values: number[];
  /**
   * Line color. Omit it for a fill-only wash — as a faded backdrop, the area
   * silhouette reads soft where a crisp line would read jagged.
   */
  stroke?: string;
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
      {stroke && (
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
      )}
    </svg>
  );
}
