// Display formatting only. No business logic here.

const sgdFormatter = new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 });

/** S$12,345 — rounded to whole dollars, never decimals. */
export function sgd(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}S$${sgdFormatter.format(Math.abs(rounded))}`;
}

export function count(value: number): string {
  return sgdFormatter.format(Math.round(value));
}

export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function longDate(d: Date): string {
  return d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
