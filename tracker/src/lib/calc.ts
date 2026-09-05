// Pure calculation layer. No React, no DOM, no state.
// Screens must get every number from here (or from src/mock/data.ts).

import {
  GROSS_REVENUE_PLACEHOLDER_RATE,
  advisors,
  bandings,
  cases as allCases,
  credit_rates,
  goals,
  metric_definitions,
  metric_thresholds,
  products,
  type Advisor,
  type BandingCode,
  type Case,
  type CreditMetric,
  type MetricCode,
  type MetricDefinition,
  type PeriodType,
  type Product,
  type Tier,
} from "../mock/data";

// ───────────────────────── Lookups ─────────────────────────

export function productById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function productsForInsurer(insurerId: string): Product[] {
  return products.filter((p) => p.insurer_id === insurerId);
}

export function advisorById(id: string): Advisor | undefined {
  return advisors.find((a) => a.id === id);
}

export function bandingRate(code: BandingCode): number {
  const b = bandings.find((x) => x.code === code);
  if (!b) throw new Error(`Unknown banding code: ${code}`);
  return b.commission_rate;
}

export function creditRate(productId: string, metric: CreditMetric): number {
  const r = credit_rates.find((x) => x.product_id === productId && x.metric === metric);
  return r ? r.rate : 0;
}

export function metricDefinition(code: MetricCode): MetricDefinition {
  const d = metric_definitions.find((m) => m.code === code);
  if (!d) throw new Error(`Unknown metric: ${code}`);
  return d;
}

export function goalFor(advisorId: string, metric: MetricCode, year: number): number | null {
  const g = goals.find((x) => x.advisor_id === advisorId && x.metric === metric && x.year === year);
  return g ? g.target_value : null;
}

/** Cases belonging to one advisor (from the mock table). */
export function casesForAdvisor(advisorId: string, source: Case[] = allCases): Case[] {
  return source.filter((c) => c.advisor_id === advisorId);
}

// ───────────────────────── Per-case maths ─────────────────────────

export function commissionForCase(grossRevenue: number, bandingCode: BandingCode): number {
  return grossRevenue * bandingRate(bandingCode);
}

/**
 * PLACEHOLDER estimate used by the Calculator until the real revenue rules
 * per product are supplied: gross revenue = premium × GROSS_REVENUE_PLACEHOLDER_RATE.
 */
export function estimateGrossRevenue(premium: number): number {
  return premium * GROSS_REVENUE_PLACEHOLDER_RATE;
}

/** WAPE weighting: regular premium × min(term / 10, 1); single premium × 1 (the 0.10 comes from credit_rates). */
export function wapeTermFactor(product: Product, termYears: number): number {
  if (product.premium_type === "regular") return Math.min(termYears / 10, 1);
  return 1;
}

export interface CaseMetrics {
  commission: number;
  gross_revenue: number;
  mdrt_premium: number;
  mdrt_commission: number;
  wape: number;
}

export function metricsForCase(c: Case): CaseMetrics {
  const product = productById(c.product_id);
  if (!product) throw new Error(`Case ${c.id} references unknown product ${c.product_id}`);
  const commission = commissionForCase(c.gross_revenue, c.banding_code_at_time);
  return {
    commission,
    gross_revenue: c.gross_revenue,
    mdrt_premium: c.premium_amount * creditRate(c.product_id, "mdrt_premium"),
    mdrt_commission: commission * creditRate(c.product_id, "mdrt_commission"),
    wape:
      c.premium_amount *
      wapeTermFactor(product, c.premium_term_years) *
      creditRate(c.product_id, "wape"),
  };
}

// ───────────────────────── Dates & periods ─────────────────────────

const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = (365.25 / 12) * MS_PER_DAY;

/** Parse "YYYY-MM-DD" as a local-time midnight (avoids UTC off-by-one). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The date a case counts on: confirmation date if confirmed, else submission date. */
export function effectiveDate(c: Case): Date {
  return parseISODate(c.confirmed_on ?? c.submitted_on);
}

export interface Period {
  start: Date;
  end: Date; // inclusive, last day of the period
}

const PERIOD_SHAPE: Record<PeriodType, { startMonth: number; months: number }> = {
  jan_dec: { startMonth: 1, months: 12 },
  jan_jun: { startMonth: 1, months: 6 },
  feb_jan: { startMonth: 2, months: 12 },
  apr_mar: { startMonth: 4, months: 12 },
};

/**
 * The period of the given type that contains `ref`, or — when no window
 * contains it (e.g. jan_jun in September) — the most recent one that started.
 */
export function periodBounds(type: PeriodType, ref: Date): Period {
  const { startMonth, months } = PERIOD_SHAPE[type];
  const startYear = ref.getMonth() + 1 >= startMonth ? ref.getFullYear() : ref.getFullYear() - 1;
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(startYear, startMonth - 1 + months, 0); // day 0 = last day of previous month
  return { start, end };
}

export function samePeriodLastYear(p: Period): Period {
  return {
    start: new Date(p.start.getFullYear() - 1, p.start.getMonth(), p.start.getDate()),
    end: new Date(p.end.getFullYear() - 1, p.end.getMonth(), p.end.getDate()),
  };
}

export function weeksLeftInYear(today: Date): number {
  const end = new Date(today.getFullYear(), 11, 31);
  return Math.max(0, Math.floor((end.getTime() - today.getTime()) / (7 * MS_PER_DAY)));
}

export function inPeriod(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

// ───────────────────────── Aggregation ─────────────────────────

/**
 * Sum a metric over the cases that fall inside [periodStart, periodEnd].
 * Superseded cases are always ignored. Pass a pre-filtered list to control
 * status (e.g. confirmed only for "achieved", confirmed + pending for "projected").
 *
 * Count metrics: `new_clients` counts clients whose first case in `cases`
 * falls in the period. `elite`, `referrals` and `testimonials` have no
 * source table in the mock data yet, so they aggregate to 0.
 */
export function aggregate(cases: Case[], metric: MetricCode, periodStart: Date, periodEnd: Date): number {
  const live = cases.filter((c) => c.status !== "superseded");

  if (metric === "new_clients") {
    const firstSeen = new Map<string, Date>();
    for (const c of live) {
      const d = effectiveDate(c);
      const prev = firstSeen.get(c.client_name);
      if (!prev || d < prev) firstSeen.set(c.client_name, d);
    }
    let n = 0;
    for (const d of firstSeen.values()) if (inPeriod(d, periodStart, periodEnd)) n++;
    return n;
  }

  if (metric === "elite" || metric === "referrals" || metric === "testimonials") {
    return 0; // no source data in the mock yet
  }

  let total = 0;
  for (const c of live) {
    if (!inPeriod(effectiveDate(c), periodStart, periodEnd)) continue;
    total += metricsForCase(c)[metric];
  }
  return total;
}

/** Cases that contribute to a metric in a period (for "tap a card → list"). */
export function contributingCases(cases: Case[], periodStart: Date, periodEnd: Date): Case[] {
  return cases
    .filter((c) => c.status !== "superseded" && inPeriod(effectiveDate(c), periodStart, periodEnd))
    .sort((a, b) => effectiveDate(b).getTime() - effectiveDate(a).getTime());
}

// ───────────────────────── Pace ─────────────────────────

export interface Pace {
  /** Achieved so far, extrapolated linearly to the end of the period. */
  runRateProjection: number;
  /** What must be added each remaining month to hit the target; 0 when reached; null when the period is over. */
  requiredPerMonth: number | null;
  onTrack: boolean;
  gap: number;
  elapsedMonths: number;
  remainingMonths: number;
}

export function pace(achieved: number, target: number, periodStart: Date, periodEnd: Date, today: Date): Pace {
  const endExclusive = periodEnd.getTime() + MS_PER_DAY;
  const totalMonths = (endExclusive - periodStart.getTime()) / MS_PER_MONTH;
  const clampedNow = Math.min(Math.max(today.getTime(), periodStart.getTime()), endExclusive);
  const elapsedMonths = (clampedNow - periodStart.getTime()) / MS_PER_MONTH;
  const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);
  const gap = Math.max(target - achieved, 0);
  const runRateProjection = elapsedMonths > 0 ? (achieved * totalMonths) / elapsedMonths : 0;

  let requiredPerMonth: number | null;
  if (gap === 0) requiredPerMonth = 0;
  else if (remainingMonths > 0) requiredPerMonth = gap / remainingMonths;
  else requiredPerMonth = null;

  const onTrack = achieved >= target || (elapsedMonths > 0 && runRateProjection >= target);
  return { runRateProjection, requiredPerMonth, onTrack, gap, elapsedMonths, remainingMonths };
}

/** Whole clients needed to close a gap; 0 when there is no gap; null when the average is not positive. */
export function clientsNeeded(gap: number, avgCommissionPerClient: number): number | null {
  if (gap <= 0) return 0;
  if (!(avgCommissionPerClient > 0)) return null;
  return Math.ceil(gap / avgCommissionPerClient);
}

// ───────────────────────── MDRT tiers ─────────────────────────

const TIER_ORDER: Tier[] = ["mdrt", "cot", "tot"];

export function thresholdFor(metric: "mdrt_premium" | "mdrt_commission", tier: Tier): number {
  const t = metric_thresholds.find((x) => x.metric === metric && x.tier === tier);
  if (!t) throw new Error(`No threshold for ${metric}/${tier}`);
  return t.value;
}

export interface TierProgress {
  reached: Tier | null;
  next: Tier | null;
  /** 0..1 progress toward `next` (or 1 when every tier is reached). */
  progress: number;
}

export function tierProgress(metric: "mdrt_premium" | "mdrt_commission", value: number): TierProgress {
  let reached: Tier | null = null;
  for (const tier of TIER_ORDER) if (value >= thresholdFor(metric, tier)) reached = tier;
  const next = TIER_ORDER[reached ? TIER_ORDER.indexOf(reached) + 1 : 0] ?? null;
  const progress = next ? Math.min(value / thresholdFor(metric, next), 1) : 1;
  return { reached, next, progress };
}

// ───────────────────────── Dashboard snapshots ─────────────────────────
// Everything a metric card needs, computed in one place so Home and Team
// show identical numbers.

/** Metrics with no source table in the mock; they aggregate to 0 and cards say "not tracked yet". */
export const UNTRACKED_METRICS: ReadonlySet<MetricCode> = new Set(["elite", "referrals", "testimonials"]);

/**
 * The same window last year, cut off at the same point in time as `today`
 * so "vs same period last year" compares like with like (e.g. 1 Jan–5 Sep
 * 2025 against 1 Jan–5 Sep 2026), not a finished year against a partial one.
 */
export function comparablePeriodLastYear(p: Period, today: Date): Period {
  const ly = samePeriodLastYear(p);
  const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  return { start: ly.start, end: cutoff < ly.end ? cutoff : ly.end };
}

export interface MetricSnapshot {
  definition: MetricDefinition;
  period: Period;
  achieved: number; // confirmed only
  projected: number; // confirmed + pending
  target: number | null;
  gap: number | null;
  pace: Pace | null;
  tracked: boolean;
  lastYear: { period: Period; achieved: number; delta: number; deltaRatio: number | null };
  contributing: Case[];
}

export function metricSnapshot(advisorId: string, cases: Case[], metric: MetricCode, today: Date): MetricSnapshot {
  const definition = metricDefinition(metric);
  const period = periodBounds(definition.period_type, today);
  const mine = cases.filter((c) => c.advisor_id === advisorId && c.status !== "superseded");
  const confirmed = mine.filter((c) => c.status === "confirmed");

  const achieved = aggregate(confirmed, metric, period.start, period.end);
  const projected = aggregate(mine, metric, period.start, period.end);
  const target = goalFor(advisorId, metric, period.start.getFullYear());
  const gap = target === null ? null : Math.max(target - achieved, 0);
  const tracked = !UNTRACKED_METRICS.has(metric);
  const paceResult = target === null || !tracked ? null : pace(achieved, target, period.start, period.end, today);

  const lyPeriod = comparablePeriodLastYear(period, today);
  const lyAchieved = aggregate(confirmed, metric, lyPeriod.start, lyPeriod.end);
  const delta = achieved - lyAchieved;

  return {
    definition,
    period,
    achieved,
    projected,
    target,
    gap,
    pace: paceResult,
    tracked,
    lastYear: { period: lyPeriod, achieved: lyAchieved, delta, deltaRatio: lyAchieved > 0 ? delta / lyAchieved : null },
    contributing: tracked ? contributingCases(mine, period.start, period.end) : [],
  };
}

export type MdrtRouteMetric = "mdrt_commission" | "mdrt_premium";

export interface MdrtRoute {
  metric: MdrtRouteMetric;
  label: string;
  achieved: number;
  projected: number;
  tiers: TierProgress;
  /** Threshold of the next tier not yet reached (null once TOT is reached). */
  nextThreshold: number | null;
  pace: Pace | null;
}

export interface MdrtSnapshot {
  period: Period;
  routes: MdrtRoute[];
  /** The route that is furthest along toward its next tier. */
  closer: MdrtRouteMetric;
  contributing: Case[];
}

export function mdrtSnapshot(advisorId: string, cases: Case[], today: Date): MdrtSnapshot {
  const period = periodBounds(metricDefinition("mdrt_commission").period_type, today);
  const mine = cases.filter((c) => c.advisor_id === advisorId && c.status !== "superseded");
  const confirmed = mine.filter((c) => c.status === "confirmed");

  const routes: MdrtRoute[] = (["mdrt_commission", "mdrt_premium"] as const).map((metric) => {
    const achieved = aggregate(confirmed, metric, period.start, period.end);
    const projected = aggregate(mine, metric, period.start, period.end);
    const tiers = tierProgress(metric, achieved);
    const nextThreshold = tiers.next ? thresholdFor(metric, tiers.next) : null;
    return {
      metric,
      label: metric === "mdrt_commission" ? "Commission" : "Premium",
      achieved,
      projected,
      tiers,
      nextThreshold,
      pace: nextThreshold === null ? null : pace(achieved, nextThreshold, period.start, period.end, today),
    };
  });

  const rank = (r: MdrtRoute) => (r.tiers.reached ? TIER_ORDER.indexOf(r.tiers.reached) + 1 : 0) + r.tiers.progress;
  const closer = routes.reduce((best, r) => (rank(r) > rank(best) ? r : best), routes[0]).metric;

  return { period, routes, closer, contributing: contributingCases(mine, period.start, period.end) };
}
