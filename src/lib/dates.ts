// Month-boundary helpers. Single user — we group by the user's local month using
// the server's local time consistently between the home query and any aggregation.

export function currentMonthRange(now = new Date()): {
  from: Date;
  to: Date;
} {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { from, to };
}

export function monthLabel(now = new Date()): string {
  return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
