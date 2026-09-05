// Path math for the hand-rolled area sparkline (see SparkArea on both
// shells — src/components/ui/SparkArea.tsx on web,
// apps/mobile/src/components/ui/SparkArea.tsx on native). No chart library,
// just the path data; each shell renders it with its own SVG primitives
// (react-dom's <svg> vs. react-native-svg's <Svg>).

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
export function buildAreaPath(values: number[]): { line: string; area: string } | null {
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
  const clampY = (y: number) => round2(Math.max(PAD_Y, Math.min(VIEW_H - PAD_Y, y)));

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

export const SPARKLINE_VIEW_BOX = `0 0 ${VIEW_W} ${VIEW_H}`;
