// Pure calculation layer. No React, no DOM, no state.
// Screens must get every number from here (or from src/mock/data.ts).

import {
  bandings,
  credit_rates,
  goals,
  mdrt_floors,
  mdrt_tier_goals,
  metric_definitions,
  metric_thresholds,
  products,
  type BandingCode,
  type Case,
  type CaseMetricValues,
  type CreditMetric,
  type Goal,
  type GoalCadence,
  type MdrtCategory,
  type MdrtRouteMetric,
  type MdrtTierGoal,
  type MetricCode,
  type MetricDefinition,
  type PeriodType,
  type Product,
  type Tier,
} from "../mock/data";

import { fcShare } from "./policies";

export type { MdrtRouteMetric } from "../mock/data";

// ───────────────────────── Lookups ─────────────────────────

export function productById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function productsForInsurer(insurerId: string): Product[] {
  return products.filter((p) => p.insurer_id === insurerId);
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

/**
 * Editable goals live in memory while the mockup runs. Screens pass the
 * current set down; the defaults come from the mock tables.
 */
export interface GoalSet {
  targets: Goal[];
  mdrtTiers: MdrtTierGoal[];
}

export const defaultGoalSet: GoalSet = { targets: goals, mdrtTiers: mdrt_tier_goals };

/**
 * The one aim the FC is working toward, as the business's whiteboard lists
 * them: their MDRT tier (held in GoalSet.mdrtTiers), a finexis Elite tier, or
 * one of their own targets.
 * src/lib/aims.ts turns the non-MDRT ones into figures.
 */
export type PrimaryGoal = { kind: "tier" } | { kind: "elite"; tier: string } | { kind: "custom"; metric: MetricCode };

export function goalFor(advisorId: string, metric: MetricCode, year: number, targets: Goal[] = goals): Goal | null {
  return targets.find((x) => x.advisor_id === advisorId && x.metric === metric && x.year === year) ?? null;
}

export function mdrtTierGoalFor(advisorId: string, year: number, tiers: MdrtTierGoal[] = mdrt_tier_goals): Tier {
  return tiers.find((x) => x.advisor_id === advisorId && x.year === year)?.tier ?? "mdrt";
}

/** Change only the MDRT tier an advisor is aiming for (pure; returns a new GoalSet). */
export function withAdvisorTier(set: GoalSet, advisorId: string, year: number, tier: Tier): GoalSet {
  return {
    ...set,
    mdrtTiers: [...set.mdrtTiers.filter((t) => !(t.advisor_id === advisorId && t.year === year)), { advisor_id: advisorId, year, tier }],
  };
}

/** Replace one advisor's goals for a year with a new set (pure; returns a new GoalSet). */
export function withAdvisorGoals(set: GoalSet, advisorId: string, year: number, targets: Goal[], tier: Tier): GoalSet {
  return {
    ...set,
    targets: [...set.targets.filter((g) => !(g.advisor_id === advisorId && g.year === year)), ...targets],
    mdrtTiers: [...set.mdrtTiers.filter((t) => !(t.advisor_id === advisorId && t.year === year)), { advisor_id: advisorId, year, tier }],
  };
}

/** Cases belonging to one advisor (from the mock table). */
export function casesForAdvisor(advisorId: string, source: Case[]): Case[] {
  return source.filter((c) => c.advisor_id === advisorId);
}

// ───────────────────────── Per-case maths ─────────────────────────

/** The FC's commission on gross revenue at a band, by the firm's payout formula (see src/lib/policies.ts). */
export function commissionForCase(grossRevenue: number, bandingCode: BandingCode): number {
  return grossRevenue * fcShare(bandingCode);
}

/**
 * Estimated gross revenue from premium using the product's placeholder
 * commission rate. The confirmed figure always comes from Merlin; this is
 * only for the Calculator and for pending cases.
 */
export function estimateGrossRevenue(premium: number, product: Product): number {
  return premium * product.comm_rate;
}

export type CaseMetrics = CaseMetricValues;

const ZERO: CaseMetrics = { commission: 0, gross_revenue: 0, premium: 0, mdrt_premium: 0, mdrt_commission: 0, elite: 0, wape: 0 };

/**
 * Every figure one entry contributes. An imported month carries its figures
 * explicitly; a hypothetical case (the Calculator, the assistant's what-if)
 * gets them from the product's rates and the band.
 */
export function metricsForCase(c: Case): CaseMetrics {
  if (c.metrics) return { ...ZERO, ...c.metrics };
  if (!productById(c.product_id)) throw new Error(`Case ${c.id} references unknown product ${c.product_id}`);
  const commission = commissionForCase(c.gross_revenue, c.banding_code_at_time);
  return {
    commission,
    gross_revenue: c.gross_revenue,
    premium: c.premium_amount,
    mdrt_premium: c.premium_amount * creditRate(c.product_id, "mdrt_premium"),
    mdrt_commission: commission * creditRate(c.product_id, "mdrt_commission"),
    // Elite: the first-year GR.
    elite: c.gross_revenue,
    wape: 0,
  };
}

// ───────────────────────── Dates & periods ─────────────────────────

const MS_PER_DAY = 86_400_000;
const MS_PER_MONTH = (365.25 / 12) * MS_PER_DAY;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse "YYYY-MM-DD" as a local-time midnight (avoids UTC off-by-one). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a local Date as "YYYY-MM-DD". */
export function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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

/**
 * The window a goal of the given cadence is measured over, containing `ref`.
 * "year" follows the metric's own period type; the others are calendar-aligned.
 */
export function goalPeriod(cadence: GoalCadence, metricPeriod: PeriodType, ref: Date): Period {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  switch (cadence) {
    case "year":
      return periodBounds(metricPeriod, ref);
    case "half": {
      const startMonth = m < 6 ? 0 : 6;
      return { start: new Date(y, startMonth, 1), end: new Date(y, startMonth + 6, 0) };
    }
    case "quarter": {
      const startMonth = Math.floor(m / 3) * 3;
      return { start: new Date(y, startMonth, 1), end: new Date(y, startMonth + 3, 0) };
    }
    case "month":
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
  }
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
 * Sum a metric over the entries that fall inside [periodStart, periodEnd].
 * Superseded entries are always ignored. Pass a pre-filtered list to control
 * status (e.g. confirmed only for "achieved", confirmed + pending for "projected").
 */
export function aggregate(cases: Case[], metric: MetricCode, periodStart: Date, periodEnd: Date): number {
  let total = 0;
  for (const c of cases) {
    if (c.status === "superseded") continue;
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
  /** The same figure per remaining week, for short windows. */
  requiredPerWeek: number | null;
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

  const requiredPerWeek = requiredPerMonth === null ? null : requiredPerMonth / (52 / 12);
  const onTrack = achieved >= target || (elapsedMonths > 0 && runRateProjection >= target);
  return { runRateProjection, requiredPerMonth, requiredPerWeek, onTrack, gap, elapsedMonths, remainingMonths };
}

/** Whole weeks from today to the end of a period (0 once it has ended). */
export function weeksLeftIn(period: Period, today: Date): number {
  const endExclusive = period.end.getTime() + MS_PER_DAY;
  return Math.max(Math.floor((endExclusive - today.getTime()) / (7 * MS_PER_DAY)), 0);
}

export interface SeriesPoint {
  /** Bucket end (inclusive). */
  at: Date;
  label: string;
  /** Cumulative confirmed value of the metric from the window start to the bucket end. */
  value: number;
}

/**
 * Cumulative confirmed value of a metric at each bucket end within a window:
 * calendar month-ends when the window is longer than 100 days, else week-ends.
 * Every bucket is returned; callers plot the ones at or before today.
 */
export function cumulativeSeries(advisorId: string, cases: Case[], metric: MetricCode, period: Period, today: Date): SeriesPoint[] {
  const confirmed = cases.filter((c) => c.advisor_id === advisorId && c.status === "confirmed");
  const endExclusive = period.end.getTime() + MS_PER_DAY;
  const ends: { at: Date; label: string }[] = [];
  if ((endExclusive - period.start.getTime()) / MS_PER_DAY > 100) {
    let cur = new Date(period.start.getFullYear(), period.start.getMonth(), 1);
    for (;;) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      if (next.getTime() > endExclusive) break;
      ends.push({ at: new Date(next.getTime() - MS_PER_DAY), label: MONTH_SHORT[cur.getMonth()] });
      cur = next;
    }
  } else {
    for (let t = period.start.getTime(); t < endExclusive; t += 7 * MS_PER_DAY) {
      const at = new Date(Math.min(t + 6 * MS_PER_DAY, endExclusive - MS_PER_DAY));
      const d = new Date(t);
      ends.push({ at, label: `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}` });
    }
  }
  void today;
  return ends.map((e) => ({ at: e.at, label: e.label, value: aggregate(confirmed, metric, period.start, e.at) }));
}

/** Whole clients needed to close a gap; 0 when there is no gap; null when the average is not positive. */
export function clientsNeeded(gap: number, avgCommissionPerClient: number): number | null {
  if (gap <= 0) return 0;
  if (!(avgCommissionPerClient > 0)) return null;
  return Math.ceil(gap / avgCommissionPerClient);
}

// ───────────────────────── MDRT tiers ─────────────────────────

const TIER_ORDER: Tier[] = ["mdrt", "cot", "tot"];

export function thresholdFor(metric: MdrtRouteMetric, tier: Tier): number {
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

export function tierProgress(metric: MdrtRouteMetric, value: number): TierProgress {
  let reached: Tier | null = null;
  for (const tier of TIER_ORDER) if (value >= thresholdFor(metric, tier)) reached = tier;
  const next = TIER_ORDER[reached ? TIER_ORDER.indexOf(reached) + 1 : 0] ?? null;
  const progress = next ? Math.min(value / thresholdFor(metric, next), 1) : 1;
  return { reached, next, progress };
}

// ───────────────────────── Dashboard snapshots ─────────────────────────
// Everything a metric card needs, computed in one place so Home and Team
// show identical numbers.

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
  /** The window shown on the card: the goal's cadence window if a goal exists, else the metric's own period. */
  period: Period;
  cadence: GoalCadence | null;
  achieved: number; // confirmed only
  projected: number; // confirmed + pending
  target: number | null;
  gap: number | null;
  pace: Pace | null;
  lastYear: { period: Period; achieved: number; delta: number; deltaRatio: number | null };
  contributing: Case[];
}

export function metricSnapshot(
  advisorId: string,
  cases: Case[],
  metric: MetricCode,
  today: Date,
  goalSet: GoalSet = defaultGoalSet,
): MetricSnapshot {
  const definition = metricDefinition(metric);
  const goal = goalFor(advisorId, metric, today.getFullYear(), goalSet.targets);
  const period = goal ? goalPeriod(goal.cadence, definition.period_type, today) : periodBounds(definition.period_type, today);
  const mine = cases.filter((c) => c.advisor_id === advisorId && c.status !== "superseded");
  const confirmed = mine.filter((c) => c.status === "confirmed");

  const achieved = aggregate(confirmed, metric, period.start, period.end);
  const projected = aggregate(mine, metric, period.start, period.end);
  const target = goal ? goal.target_value : null;
  const gap = target === null ? null : Math.max(target - achieved, 0);
  const paceResult = target === null ? null : pace(achieved, target, period.start, period.end, today);

  const lyPeriod = comparablePeriodLastYear(period, today);
  const lyAchieved = aggregate(confirmed, metric, lyPeriod.start, lyPeriod.end);
  const delta = achieved - lyAchieved;

  return {
    definition,
    period,
    cadence: goal ? goal.cadence : null,
    achieved,
    projected,
    target,
    gap,
    pace: paceResult,
    lastYear: { period: lyPeriod, achieved: lyAchieved, delta, deltaRatio: lyAchieved > 0 ? delta / lyAchieved : null },
    contributing: contributingCases(mine, period.start, period.end),
  };
}

/** Whether the import carries WAPE at all; a WAPE goal says so when it doesn't. */
export function importHasWape(cases: Case[]): boolean {
  return cases.some((c) => c.metrics?.wape !== undefined);
}

export const MDRT_ROUTES: readonly MdrtRouteMetric[] = ["mdrt_commission", "mdrt_premium"];
export const ROUTE_LABEL: Record<MdrtRouteMetric, string> = { mdrt_commission: "Commission", mdrt_premium: "Premium" };
/** Lower-case noun for prose: "commission route". */
export const ROUTE_WORD: Record<MdrtRouteMetric, "commission" | "premium"> = { mdrt_commission: "commission", mdrt_premium: "premium" };
export const MDRT_CATEGORY_LABEL: Record<MdrtCategory, string> = { risk_protection: "Risk-Protection", other: "Other Products" };

export function floorsFor(metric: MdrtRouteMetric): { risk: number } {
  const f = mdrt_floors.find((x) => x.metric === metric);
  if (!f) throw new Error(`No MDRT floors for ${metric}`);
  return { risk: f.risk_protection };
}

/** The per-entry figure a route sums: premium credit on the premium route, commission credit on the commission route. */
export function routeCaseValue(metric: MdrtRouteMetric): "mdrt_commission" | "mdrt_premium" {
  return metric;
}

/**
 * Credit on one MDRT route, split the way MDRT judges it: Other Products
 * credit only counts once Risk-Protection credit has reached the floor (half
 * the entry-level requirement, the same for COT and TOT).
 */
export interface RouteCredit {
  /** From Risk-Protection products (life, ILPs, endowments, CI, disability, annuities). */
  risk: number;
  /** From Other Products (hospital plans, funds, portfolios, advice fees). */
  other: number;
  /** Everything earned on the route: risk + other. */
  total: number;
  /** What MDRT counts today: `other` is left out while `risk` is below the floor. */
  counted: number;
  /** Other Products credit earned but not counted yet (0 once unlocked). */
  locked: number;
  /** The Risk-Protection floor for this route. */
  riskFloor: number;
  /** Risk-Protection credit still needed to reach the floor (0 once there). */
  riskShortfall: number;
  /** True when the floor is met (the total may still be short of the tier). */
  gatesMet: boolean;
}

function categoryOf(c: Case): MdrtCategory {
  const p = productById(c.product_id);
  if (!p) throw new Error(`Case ${c.id} references unknown product ${c.product_id}`);
  return p.mdrt_category;
}

/**
 * Route credit over the entries inside [periodStart, periodEnd]. Pass a
 * pre-filtered list to control status (confirmed only, or confirmed + pending).
 */
export function routeCredit(cases: Case[], metric: MdrtRouteMetric, periodStart: Date, periodEnd: Date): RouteCredit {
  const key = routeCaseValue(metric);
  let risk = 0;
  let other = 0;
  for (const c of cases) {
    if (c.status === "superseded") continue;
    if (!inPeriod(effectiveDate(c), periodStart, periodEnd)) continue;
    const v = metricsForCase(c)[key];
    if (categoryOf(c) === "risk_protection") risk += v;
    else other += v;
  }
  const floors = floorsFor(metric);
  const riskShortfall = Math.max(floors.risk - risk, 0);
  const unlocked = riskShortfall === 0;
  return {
    risk,
    other,
    total: risk + other,
    counted: unlocked ? risk + other : risk,
    locked: unlocked ? 0 : other,
    riskFloor: floors.risk,
    riskShortfall,
    gatesMet: unlocked,
  };
}

export interface MdrtRoute {
  metric: MdrtRouteMetric;
  label: string;
  /** Confirmed credit as MDRT counts it (credit.counted). */
  achieved: number;
  /** Confirmed + pending credit as MDRT would count it. */
  projected: number;
  credit: RouteCredit;
  projectedCredit: RouteCredit;
  tiers: TierProgress;
  /** Threshold of the tier the FC is aiming for on this route. */
  goalThreshold: number;
  /** 0..1 progress of the counted credit toward the aimed-for tier. */
  goalProgress: number;
  /** goalProgress (kept apart so a route-internal minimum could hold it back again later). */
  qualifyingProgress: number;
  goalReached: boolean;
  pace: Pace;
}

export interface MdrtSnapshot {
  period: Period;
  /** The tier the FC set as their aspiration this year. */
  goalTier: Tier;
  routes: MdrtRoute[];
  /** The route that is furthest along toward the aimed-for tier, minimums included. */
  closer: MdrtRouteMetric;
  contributing: Case[];
}

export function mdrtSnapshot(advisorId: string, cases: Case[], today: Date, goalSet: GoalSet = defaultGoalSet): MdrtSnapshot {
  const period = periodBounds(metricDefinition("mdrt_commission").period_type, today);
  const goalTier = mdrtTierGoalFor(advisorId, today.getFullYear(), goalSet.mdrtTiers);
  const mine = cases.filter((c) => c.advisor_id === advisorId && c.status !== "superseded");
  const confirmed = mine.filter((c) => c.status === "confirmed");

  const routes: MdrtRoute[] = MDRT_ROUTES.map((metric) => {
    const credit = routeCredit(confirmed, metric, period.start, period.end);
    const projectedCredit = routeCredit(mine, metric, period.start, period.end);
    const achieved = credit.counted;
    const goalThreshold = thresholdFor(metric, goalTier);
    const goalProgress = Math.min(achieved / goalThreshold, 1);
    const tiers = credit.gatesMet ? tierProgress(metric, achieved) : { reached: null, next: "mdrt" as Tier, progress: Math.min(achieved / thresholdFor(metric, "mdrt"), 1) };
    return {
      metric,
      label: ROUTE_LABEL[metric],
      achieved,
      projected: projectedCredit.counted,
      credit,
      projectedCredit,
      tiers,
      goalThreshold,
      goalProgress,
      qualifyingProgress: goalProgress,
      goalReached: achieved >= goalThreshold && credit.gatesMet,
      pace: pace(achieved, goalThreshold, period.start, period.end, today),
    };
  });

  const closer = routes.reduce((best, r) => (r.qualifyingProgress > best.qualifyingProgress ? r : best), routes[0]).metric;

  return { period, goalTier, routes, closer, contributing: contributingCases(mine, period.start, period.end) };
}

/** Cumulative counted credit on a route at each bucket end (same buckets as cumulativeSeries). */
export function routeSeries(advisorId: string, cases: Case[], metric: MdrtRouteMetric, period: Period, today: Date): SeriesPoint[] {
  const confirmed = cases.filter((c) => c.advisor_id === advisorId && c.status === "confirmed");
  return cumulativeSeries(advisorId, cases, "commission", period, today).map((pt) => ({ at: pt.at, label: pt.label, value: routeCredit(confirmed, metric, period.start, pt.at).counted }));
}

/**
 * Whole clients needed on a route, each adding `riskPer` of Risk-Protection
 * credit and `otherPer` of Other Products credit, until the route qualifies
 * for `target`. Other Products credit (the FC's locked credit included)
 * starts counting the moment the Risk-Protection floor is crossed. 0 when
 * already there; null when the clients add nothing that can get there.
 */
export function clientsNeededOnRoute(credit: RouteCredit, target: number, riskPer: number, otherPer: number): number | null {
  if (credit.counted >= target && credit.gatesMet) return 0;
  if (!(riskPer > 0) && !(otherPer > 0)) return null;
  if (!(riskPer > 0) && credit.riskShortfall > 0) return null; // the floor can never be reached with these products
  for (let n = 1; n <= 100_000; n++) {
    const risk = credit.risk + n * riskPer;
    const other = credit.other + n * otherPer;
    if ((risk >= credit.riskFloor ? risk + other : risk) >= target) return n;
  }
  return null;
}
