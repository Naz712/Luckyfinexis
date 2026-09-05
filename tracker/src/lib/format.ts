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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sat, 5 Sep 2026" */
export function longDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${shortDate(d)} ${d.getFullYear()}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jan–Dec 2026" or "Apr 2026–Mar 2027". */
export function periodLabel(p: { start: Date; end: Date }): string {
  const sy = p.start.getFullYear();
  const ey = p.end.getFullYear();
  if (sy === ey) return `${MONTHS[p.start.getMonth()]}–${MONTHS[p.end.getMonth()]} ${sy}`;
  return `${MONTHS[p.start.getMonth()]} ${sy}–${MONTHS[p.end.getMonth()]} ${ey}`;
}

/** "1 Jan–5 Sep 2025" */
export function dateRange(p: { start: Date; end: Date }): string {
  const sy = p.start.getFullYear();
  const ey = p.end.getFullYear();
  const s = `${p.start.getDate()} ${MONTHS[p.start.getMonth()]}${sy === ey ? "" : ` ${sy}`}`;
  return `${s}–${p.end.getDate()} ${MONTHS[p.end.getMonth()]} ${ey}`;
}

/** "5 Sep" */
export function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Signed money or count: "+S$4,200", "-S$300", "+3". */
export function signed(value: number, unit: "sgd" | "count"): string {
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);
  return unit === "sgd" ? `${sign}${sgd(abs)}` : `${sign}${count(abs)}`;
}

export function signedPct(ratio: number): string {
  const sign = ratio >= 0 ? "+" : "-";
  return `${sign}${Math.round(Math.abs(ratio) * 100)}%`;
}
