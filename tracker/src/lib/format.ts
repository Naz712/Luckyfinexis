// Display formatting only. No business logic here.
import type { MetricUnit } from "../mock/data";
import type { Pace } from "./calc";

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

/** "Jan–Dec 2026", "Apr 2026–Mar 2027", "Q3 2026" or "Sep 2026". */
export function periodLabel(p: { start: Date; end: Date }): string {
  const sy = p.start.getFullYear();
  const ey = p.end.getFullYear();
  const sm = p.start.getMonth();
  const em = p.end.getMonth();
  if (sy === ey && sm === em) return `${MONTHS[sm]} ${sy}`;
  if (sy === ey && sm % 3 === 0 && em === sm + 2) return `Q${sm / 3 + 1} ${sy}`;
  if (sy === ey) return `${MONTHS[sm]}–${MONTHS[em]} ${sy}`;
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

export const CADENCE_LABEL = { year: "Annual", half: "Half-year", quarter: "Quarterly", month: "Monthly" } as const;
/** "per quarter" etc. for goal amounts. */
export const CADENCE_PER = { year: "per year", half: "per half-year", quarter: "per quarter", month: "per month" } as const;

/** Axis-style money: "S$0", "S$800", "S$2.5k", "S$12k". */
export function sgdCompact(value: number): string {
  const v = Math.round(value);
  if (Math.abs(v) < 1000) return `S$${v}`;
  const k = v / 1000;
  return `S$${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
}

/** A metric value in its own unit: money as S$, counts as plain numbers. */
export function fmtMetric(value: number, unit: MetricUnit): string {
  return unit === "sgd" ? sgd(value) : count(value);
}

/** One short sentence on pace toward a target, shared by Home and Goals. */
export function paceText(pace: Pace | null, unit: MetricUnit, reached: boolean): string {
  if (reached) return "Goal reached";
  if (!pace) return "";
  if (pace.onTrack) return `On track · projected ${fmtMetric(pace.runRateProjection, unit)}`;
  if (pace.requiredPerMonth === null) return `Period ended · short by ${fmtMetric(pace.gap, unit)}`;
  if (pace.remainingMonths < 1.5 && pace.requiredPerWeek !== null) return `Need ${fmtMetric(pace.requiredPerWeek, unit)}/week`;
  return `Need ${fmtMetric(pace.requiredPerMonth, unit)}/month`;
}
