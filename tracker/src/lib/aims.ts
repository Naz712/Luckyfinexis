// The aims an FC can work toward, beyond MDRT, in the business's order:
// a tier of Final Sprint (Finexis's last-quarter campaign), Finexis Elite (a
// tier of the trip scheme), and a custom goal on commission, gross revenue or WAPE. MDRT,
// COT and TOT stay in calc.ts (mdrtSnapshot), with their two routes. Home's
// hero, Goals and the Calculator's "how far this gets you" read the other
// aims through soloAim, so all three agree.
import { metric_definitions, TODAY, type Advisor, type Case, type MetricCode, type MetricUnit } from "../mock/data";
import { aggregate, goalFor, goalPeriod, importHasWape, metricDefinition, pace, parseISODate, periodBounds, type GoalSet, type Pace, type Period, type PrimaryGoal } from "./calc";
import { ELITE, eliteTiersFor, type EliteTier } from "./elite";
import { CATALOGUE, type Campaign } from "./policies";

/**
 * Final Sprint: Finexis's campaign for the last quarter. Finexis sets what
 * counts and the targets (the catalogue's final_sprint block). Until the
 * campaign sheet is in, the last quarter's first-year gross revenue is
 * tracked with no targets.
 */
export const FINAL_SPRINT: Campaign = CATALOGUE.final_sprint ?? {
  name: "Final Sprint",
  period: [`${TODAY.getFullYear()}-10-01`, `${TODAY.getFullYear()}-12-31`],
  metric: "gross_revenue",
  basis: "First-year gross revenue on cases from 1 Oct to 31 Dec, until Finexis's rules for the campaign are in.",
  tiers: [],
  rules: [],
  confirmed: false,
  source: "",
};

export type SprintTier = Campaign["tiers"][number];

export function sprintPeriod(): Period {
  return { start: parseISODate(FINAL_SPRINT.period[0]), end: parseISODate(FINAL_SPRINT.period[1]) };
}

/** The campaign tier an aim names, or the lowest; null while Finexis hasn't set any. */
export function sprintTierOf(code: string | null): SprintTier | null {
  return FINAL_SPRINT.tiers.find((t) => t.code === code) ?? FINAL_SPRINT.tiers[0] ?? null;
}

/** Elite's qualifying period. */
export function elitePeriod(): Period {
  return { start: parseISODate(ELITE.period[0]), end: parseISODate(ELITE.period[1]) };
}

/** The Elite tier an aim names, or the FC's lowest tier. */
export function eliteTierOf(advisor: Advisor, code: string): EliteTier {
  const tiers = eliteTiersFor(advisor);
  return tiers.find((t) => t.code === code) ?? tiers[0]!;
}

/** The metrics a custom goal can be set on, as the whiteboard lists them. */
export const CUSTOM_METRICS = (["commission", "gross_revenue", "wape"] as MetricCode[]).map((c) => metric_definitions.find((m) => m.code === c)!);

/** One non-MDRT aim as figures: what counts, over which window, how far along, and the pace. */
export interface SoloAim {
  kind: "sprint" | "elite" | "custom";
  /** "Final Sprint 2026", an Elite tier with the year, "Your gross revenue goal". */
  name: string;
  metric: MetricCode;
  unit: MetricUnit;
  period: Period;
  /** Confirmed so far inside the window. */
  achieved: number;
  /** Confirmed plus pending. */
  projected: number;
  target: number | null;
  pace: Pace | null;
  gap: number;
  /** A sentence on what counts. */
  blurb: string;
  /** True before the window opens (Final Sprint before October). */
  notStarted: boolean;
  /** False when the import has no figures for the metric (WAPE without its column). */
  inImport: boolean;
}

/** The figures for a Final Sprint, Elite or custom aim. */
export function soloAim(advisor: Advisor, cases: Case[], goalSet: GoalSet, primary: Exclude<PrimaryGoal, { kind: "tier" }>, today: Date): SoloAim {
  const year = today.getFullYear();
  const mine = cases.filter((c) => c.advisor_id === advisor.id && c.status !== "superseded");
  const confirmed = mine.filter((c) => c.status === "confirmed");
  const figures = (metric: MetricCode, period: Period, target: number | null) => {
    const achieved = aggregate(confirmed, metric, period.start, period.end);
    const projected = aggregate(mine, metric, period.start, period.end);
    return {
      achieved,
      projected,
      target,
      pace: target !== null && target > 0 ? pace(achieved, target, period.start, period.end, today) : null,
      gap: target !== null ? Math.max(target - achieved, 0) : 0,
      notStarted: today < period.start,
    };
  };

  if (primary.kind === "sprint") {
    const tier = sprintTierOf(primary.tier);
    const period = sprintPeriod();
    return {
      kind: "sprint",
      name: tier ? `${FINAL_SPRINT.name} · ${tier.name}` : `${FINAL_SPRINT.name} ${year}`,
      metric: FINAL_SPRINT.metric,
      unit: FINAL_SPRINT.metric === "elite" ? "count" : "sgd",
      period,
      ...figures(FINAL_SPRINT.metric, period, tier?.target ?? null),
      blurb: `Finexis's campaign for the last quarter. ${FINAL_SPRINT.basis}${tier?.prize ? ` ${tier.name}: ${tier.prize}.` : ""}${
        FINAL_SPRINT.tiers.length === 0 ? " Finexis sets the targets; they appear here once the campaign sheet is in." : ""
      }`,
      inImport: true,
    };
  }

  if (primary.kind === "elite") {
    const tier = eliteTierOf(advisor, primary.tier);
    const period = elitePeriod();
    return {
      kind: "elite",
      name: `${tier.name} ${year}`,
      metric: "elite",
      unit: "count",
      period,
      ...figures("elite", period, tier.credits),
      blurb: `Finexis ${ELITE.name}: first-year gross revenue times each product's multiplier, for ${ELITE.prize}.${tier.perk ? ` ${tier.name}: ${tier.perk}.` : ""}`,
      inImport: true,
    };
  }

  const def = metricDefinition(primary.metric);
  const goal = goalFor(advisor.id, primary.metric, year, goalSet.targets);
  const period = goal ? goalPeriod(goal.cadence, def.period_type, today) : periodBounds(def.period_type, today);
  const inImport = primary.metric !== "wape" || importHasWape(mine);
  return {
    kind: "custom",
    name: `Your ${def.code === "wape" ? "WAPE" : def.label.toLowerCase()} goal`,
    metric: primary.metric,
    unit: def.unit,
    period,
    ...figures(primary.metric, period, goal ? goal.target_value : null),
    blurb: inImport ? "Your own target." : "Your own target. The monthly import doesn't carry WAPE yet, so nothing counts toward it until it does.",
    inImport,
  };
}
