import { useEffect, useState } from "react";
import {
  MDRT_MEMBERSHIP_YEAR,
  MDRT_PRODUCTION_YEAR,
  MDRT_THRESHOLDS_CONFIRMED,
  metric_definitions,
  TODAY,
  type Advisor,
  type Case,
  type Goal,
  type GoalCadence,
  type MetricCode,
  type MetricDefinition,
  type MetricUnit,
  type Tier,
} from "../mock/data";
import {
  UNTRACKED_METRICS,
  aggregate,
  cumulativeSeries,
  floorsFor,
  goalFor,
  goalPeriod,
  mdrtSnapshot,
  mdrtTierGoalFor,
  metricDefinition,
  metricSnapshot,
  pace as paceFor,
  routeSeries,
  thresholdFor,
  weeksLeftIn,
  withAdvisorGoals,
  type GoalSet,
  type MdrtRoute,
  type Pace,
  type Period,
  type PrimaryGoal,
  type SeriesPoint,
} from "../lib/calc";
import { CADENCE_LABEL, CADENCE_PER, dateRange, fmtMetric, paceText, pct, periodLabel, routeGateText, sgd, shortDate } from "../lib/format";
import { Card, Label } from "../components/ui";

export type { PrimaryGoal } from "../lib/calc";

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };
const TIERS: Tier[] = ["mdrt", "cot", "tot"];
const CADENCES: GoalCadence[] = ["year", "half", "quarter", "month"];
const CADENCE_SHORT: Record<GoalCadence, string> = { year: "Year", half: "Half", quarter: "Quarter", month: "Month" };
/** The seven metrics an FC sets their own targets on: everything except the MDRT routes, which the tier aims cover. */
const OWN_METRICS = metric_definitions.filter((m) => m.code !== "mdrt_commission" && m.code !== "mdrt_premium");
const DAY = 86_400_000;

/** "commission", "new clients" — but "WAPE" stays as it is. */
const metricWord = (label: string) => (label === label.toUpperCase() ? label : label.toLowerCase());

/** Share of the window that has elapsed, for the "today" tick. */
function elapsedFraction(p: Pace): number {
  const total = p.elapsedMonths + p.remainingMonths;
  return total > 0 ? p.elapsedMonths / total : 0;
}

/** Everything one of the FC's own goals needs on this screen, over the window its cadence gives it. */
interface GoalView {
  definition: MetricDefinition;
  cadence: GoalCadence;
  period: Period;
  achieved: number;
  projected: number;
  target: number | null;
  tracked: boolean;
  /** Pace toward the target whenever one is set — the design paces untracked metrics too, so nothing accrues but the maths still shows. */
  pace: Pace | null;
  reached: boolean;
}

type Tone = "none" | "ok" | "accent" | "warn";
const TONE = {
  none: { bar: "bg-faint", soft: "bg-accent/35", text: "text-muted" },
  ok: { bar: "bg-ok", soft: "bg-ok/35", text: "text-ok" },
  accent: { bar: "bg-accent", soft: "bg-accent/35", text: "text-accent" },
  warn: { bar: "bg-warn", soft: "bg-warn/35", text: "text-warn" },
} satisfies Record<Tone, { bar: string; soft: string; text: string }>;

/** 12px bar on the blue card: white = achieved, translucent = projected incl. pending, dark tick = today. Grows in on mount. */
function DistanceBar({ achieved, projected, elapsed }: { achieved: number; projected: number; elapsed: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const grow = "absolute inset-y-0 left-0 rounded-full transition-[width] duration-[600ms] ease-[cubic-bezier(.22,1,.36,1)]";
  return (
    <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
      <span className={`${grow} bg-white/45`} style={{ width: `${(mounted ? projected : 0) * 100}%` }} />
      <span className={`${grow} bg-white`} style={{ width: `${(mounted ? achieved : 0) * 100}%` }} />
      <span className="absolute inset-y-0 w-0.5 bg-[rgba(13,23,56,.6)]" style={{ left: `calc(${elapsed * 100}% - 1px)` }} title="Today" />
    </div>
  );
}

/** One route (tier aim) or the single custom target inside the blue card. */
function DistanceBlock({
  title,
  closest,
  highlight,
  achieved,
  ofTarget,
  fill,
  projFill,
  elapsed,
  toGo,
  pace,
  note,
}: {
  title: string;
  closest: boolean;
  highlight: boolean;
  achieved: string;
  ofTarget: string;
  fill: number;
  projFill: number;
  elapsed: number;
  toGo: string;
  pace: string;
  /** An MDRT minimum inside the route that is not met yet. */
  note?: string | null;
}) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-white/15" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-white/92">{title}</span>
        {closest && <span className="shrink-0 rounded bg-white px-[5px] py-[2px] text-[10px] font-bold uppercase tracking-[.05em] text-brand">Closest</span>}
      </div>
      <div className="tnum mt-[5px] flex items-baseline justify-between gap-2">
        <span className={`font-bold leading-none tracking-[-.025em] ${highlight ? "text-[34px]" : "text-[24px]"}`}>{achieved}</span>
        <span className="shrink-0 text-[12px] text-white/75">{ofTarget}</span>
      </div>
      <DistanceBar achieved={fill} projected={projFill} elapsed={elapsed} />
      <div className="tnum mt-[9px] flex items-baseline justify-between gap-2 text-[12px]">
        <span className="font-semibold">{toGo}</span>
        <span className="shrink-0 text-white/85">{pace}</span>
      </div>
      {note && <p className="tnum mt-2 text-pretty text-[11px] leading-[1.45] text-white/75">{note}</p>}
    </div>
  );
}

/** "How you get there": cumulative confirmed line, run-rate continuation and the pace that reaches the goal. */
function ProjectionCard({
  series,
  subject,
  unit,
  period,
  target,
  achieved,
  projected,
  pace,
  caption,
}: {
  /** Cumulative confirmed value at each bucket end (routeSeries / cumulativeSeries). */
  series: SeriesPoint[];
  /** What the line measures, for the chart's accessible name: "commission credit", "new clients". */
  subject: string;
  unit: MetricUnit;
  period: Period;
  target: number;
  achieved: number;
  projected: number;
  pace: Pace;
  caption: string;
}) {
  const fmt = (v: number) => fmtMetric(v, unit);
  const start = period.start.getTime();
  const endEx = period.end.getTime() + DAY;
  const now = TODAY.getTime();
  const max = Math.max(target, pace.runRateProjection, achieved) * 1.08 || 1;
  const x = (t: number) => 4 + ((Math.min(Math.max(t, start), endEx) - start) / (endEx - start)) * 312;
  const y = (v: number) => 112 - (Math.max(v, 0) / max) * 94;
  const pt = (t: number, v: number) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`;

  const cum = series.filter((p) => p.at.getTime() <= now).map((p) => pt(p.at.getTime(), p.value));
  const actual = [pt(start, 0), ...cum, pt(now, achieved)];
  const area = [...actual, pt(now, 0), pt(start, 0)].join(" ");
  const proj = `${pt(now, achieved)} ${pt(endEx, pace.runRateProjection)}`;
  const required = `${pt(now, achieved)} ${pt(endEx, target)}`;
  const goalY = y(target).toFixed(1);
  const projY = y(pace.runRateProjection).toFixed(1);
  const todayX = x(now).toFixed(1);
  const todayY = y(achieved).toFixed(1);

  const weeksLeft = weeksLeftIn(period, TODAY);
  const tiles = [
    { label: "Run rate finishes at", value: fmt(pace.runRateProjection), ink: pace.onTrack ? "text-ok" : "text-ink" },
    { label: "Pending would add", value: `+${fmt(projected - achieved)}`, ink: "text-warn" },
    pace.requiredPerWeek === null
      ? { label: "Short by", value: fmt(pace.gap), ink: "text-accent" }
      : { label: "Needed each week", value: fmt(pace.requiredPerWeek), ink: "text-accent" },
  ];
  const note =
    pace.gap === 0
      ? `Goal reached with ${weeksLeft} weeks still to run.`
      : pace.onTrack
        ? `Hold this rate and you clear the goal before ${shortDate(period.end)}.`
        : pace.requiredPerWeek === null
          ? `${paceText(pace, unit, false)}.`
          : `The amber line is the pace that reaches the goal: ${fmt(pace.requiredPerWeek)} a week for the ${weeksLeft} weeks left.`;

  const legendItem = "flex items-center gap-[5px] text-[11px] text-muted";
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2.5">
        <Label>How you get there</Label>
        <span className="tnum shrink-0 text-[11px] text-muted">{caption}</span>
      </div>

      <div className="mt-3">
        <svg
          viewBox="0 0 320 132"
          width="100%"
          height="132"
          className="block overflow-visible"
          role="img"
          aria-label={`Confirmed ${subject} so far against a goal of ${fmt(target)}, with the run rate and the pace needed.`}
        >
          <line x1="4" y1={goalY} x2="316" y2={goalY} className="stroke-grid" strokeWidth="1" strokeDasharray="3 3" />
          <text x="4" y={(y(target) - 6).toFixed(1)} fontSize="9.5" fontWeight="600" letterSpacing=".02em" className="tnum fill-muted">
            Goal {fmt(target)}
          </text>
          <polygon points={area} className="fill-accent/9" />
          <polyline points={required} fill="none" className="stroke-warn" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
          <polyline points={proj} fill="none" className="stroke-accent/45" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
          <polyline points={actual.join(" ")} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={todayX} y1="14" x2={todayX} y2="112" className="stroke-line" strokeWidth="1" />
          <circle cx="316" cy={projY} r="3.5" className="fill-surface stroke-accent/55" strokeWidth="2" />
          <circle cx="316" cy={goalY} r="3.5" className="fill-warn" />
          <circle cx={todayX} cy={todayY} r="4.5" className="fill-accent stroke-surface" strokeWidth="2" />
        </svg>
        <div className="tnum mt-1.5 flex items-baseline justify-between text-[10px] text-muted">
          <span>{shortDate(period.start)}</span>
          <span className="font-semibold text-accent">{shortDate(TODAY)}</span>
          <span>{shortDate(period.end)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5">
        <span className={legendItem}>
          <span className="h-[2.5px] w-3.5 rounded-sm bg-accent" />
          Confirmed
        </span>
        <span className={legendItem}>
          <span className="h-[2.5px] w-3.5 rounded-sm bg-[repeating-linear-gradient(to_right,color-mix(in_oklab,var(--color-accent)_45%,transparent)_0_4px,transparent_4px_7px)]" />
          Your run rate
        </span>
        <span className={legendItem}>
          <span className="h-[2.5px] w-3.5 rounded-sm bg-[repeating-linear-gradient(to_right,var(--color-warn)_0_4px,transparent_4px_7px)]" />
          Pace to reach it
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-line">
        {tiles.map((t) => (
          <div key={t.label} className="bg-canvas p-2.5">
            <div className="text-[10px] leading-[1.35] text-muted">{t.label}</div>
            <div className={`tnum mt-[3px] text-[15px] font-bold ${t.ink}`}>{t.value}</div>
          </div>
        ))}
      </div>

      <p className="tnum mt-[11px] text-pretty text-[12px] leading-[1.5] text-muted">{note}</p>
    </Card>
  );
}

export default function Goals({
  advisor,
  cases,
  goalSet,
  onGoalSetChange,
  primary,
  onPrimaryChange,
  onTierChange,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  onGoalSetChange: (g: GoalSet) => void;
  primary: PrimaryGoal;
  onPrimaryChange: (p: PrimaryGoal) => void;
  onTierChange: (t: Tier) => void;
}) {
  const year = TODAY.getFullYear();
  const tier = mdrtTierGoalFor(advisor.id, year, goalSet.mdrtTiers);
  const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
  const mine = cases.filter((c) => c.advisor_id === advisor.id && c.status !== "superseded");
  const confirmed = mine.filter((c) => c.status === "confirmed");
  const isCustom = primary.kind === "custom";

  // The metric the Custom aim focuses; remembered so picking Custom again returns to the last one.
  const [lastCustom, setLastCustom] = useState<MetricCode>(primary.kind === "custom" ? primary.metric : "commission");
  const customMetric: MetricCode = primary.kind === "custom" ? primary.metric : lastCustom;

  // Editor state per metric: the text in the amount field, and the cadence chosen while no target exists yet.
  // The GoalSet itself is the source of truth for every figure; these only carry what it cannot.
  const [drafts, setDrafts] = useState<Partial<Record<MetricCode, string>>>(() => {
    const init: Partial<Record<MetricCode, string>> = {};
    for (const m of OWN_METRICS) {
      const g = goalFor(advisor.id, m.code, year, goalSet.targets);
      init[m.code] = g ? String(g.target_value) : "";
    }
    return init;
  });
  const [cadences, setCadences] = useState<Partial<Record<MetricCode, GoalCadence>>>(() => {
    const init: Partial<Record<MetricCode, GoalCadence>> = {};
    for (const m of OWN_METRICS) init[m.code] = goalFor(advisor.id, m.code, year, goalSet.targets)?.cadence ?? "year";
    return init;
  });

  const cadenceOf = (metric: MetricCode): GoalCadence => goalFor(advisor.id, metric, year, goalSet.targets)?.cadence ?? cadences[metric] ?? "year";

  const view = (metric: MetricCode): GoalView => {
    const goal = goalFor(advisor.id, metric, year, goalSet.targets);
    if (goal) {
      const s = metricSnapshot(advisor.id, cases, metric, TODAY, goalSet);
      return {
        definition: s.definition,
        cadence: goal.cadence,
        period: s.period,
        achieved: s.achieved,
        projected: s.projected,
        target: goal.target_value,
        tracked: s.tracked,
        pace: s.pace ?? paceFor(s.achieved, goal.target_value, s.period.start, s.period.end, TODAY),
        reached: s.achieved >= goal.target_value,
      };
    }
    // No target yet: show the window the chosen cadence would use, so the editor and card agree before anything is typed.
    const definition = metricDefinition(metric);
    const cadence = cadences[metric] ?? "year";
    const period = goalPeriod(cadence, definition.period_type, TODAY);
    return {
      definition,
      cadence,
      period,
      achieved: aggregate(confirmed, metric, period.start, period.end),
      projected: aggregate(mine, metric, period.start, period.end),
      target: null,
      tracked: !UNTRACKED_METRICS.has(metric),
      pace: null,
      reached: false,
    };
  };

  // Every edit applies immediately: the advisor's goals for the year with this metric's row replaced (or dropped when cleared).
  const writeGoal = (metric: MetricCode, value: string, cadence: GoalCadence) => {
    const n = Number(value);
    const rest = goalSet.targets.filter((g) => g.advisor_id === advisor.id && g.year === year && g.metric !== metric);
    const targets: Goal[] = Number.isFinite(n) && n > 0 ? [...rest, { advisor_id: advisor.id, metric, year, cadence, target_value: n }] : rest;
    onGoalSetChange(withAdvisorGoals(goalSet, advisor.id, year, targets, tier));
  };
  const setAmount = (metric: MetricCode, value: string) => {
    setDrafts((d) => ({ ...d, [metric]: value }));
    writeGoal(metric, value, cadenceOf(metric));
  };
  const setCadence = (metric: MetricCode, cadence: GoalCadence) => {
    setCadences((c) => ({ ...c, [metric]: cadence }));
    writeGoal(metric, drafts[metric] ?? "", cadence);
  };

  const pickTier = (t: Tier) => {
    onTierChange(t);
    onPrimaryChange({ kind: "tier" });
  };
  const focusCustom = (metric: MetricCode) => {
    setLastCustom(metric);
    onPrimaryChange({ kind: "custom", metric });
  };

  // ── Blue card + chart: the one aim in force ──
  const closest = mdrt.routes.find((r) => r.metric === mdrt.closer)!;
  const others = mdrt.routes.filter((r) => r.metric !== mdrt.closer);
  /** How far a route is toward a tier, held back by any minimum inside the route that is not met (income route). */
  const routeRatio = (r: MdrtRoute, t: Tier) => {
    const gate = r.credit.newBusiness ? Math.min(r.credit.risk / r.credit.riskFloor, r.credit.newBusiness.value / r.credit.newBusiness.floor) : 1;
    return Math.min(r.achieved / thresholdFor(r.metric, t), gate, 1);
  };
  const cv = view(customMetric);
  const cvFmt = (v: number) => fmtMetric(v, cv.definition.unit);
  const cvWord = metricWord(cv.definition.label);
  const hasGoal = !isCustom || cv.target !== null;

  let heroLabel: string;
  let heroPeriod: string;
  let heroBlurb: string;
  if (!isCustom) {
    heroLabel = `Distance to ${TIER_LABEL[tier]} ${MDRT_MEMBERSHIP_YEAR}`;
    heroPeriod = `${periodLabel(mdrt.period)} · ${weeksLeftIn(mdrt.period, TODAY)} weeks left`;
    heroBlurb = `Any of the three routes qualifies. You are closest on the ${closest.label.toLowerCase()} route.`;
  } else {
    heroPeriod = `${CADENCE_LABEL[cv.cadence]} · ${periodLabel(cv.period)}`;
    if (cv.target === null) {
      heroLabel = `Your own ${cvWord} goal`;
      heroBlurb = cv.tracked ? `Nothing set yet for ${cvWord}.` : "This metric has no data source in the mockup yet, so nothing accrues against it.";
    } else {
      heroLabel = `Distance to ${cvFmt(cv.target)} ${cvWord}`;
      heroBlurb = cv.tracked
        ? `Your own target. It resets at the end of each ${CADENCE_LABEL[cv.cadence].toLowerCase()} period.`
        : "Your own target. This metric has no data source in the mockup yet, so nothing accrues against it.";
    }
  }

  const setCount = OWN_METRICS.filter((m) => goalFor(advisor.id, m.code, year, goalSet.targets)).length;
  const amountId = "custom-goal-amount";
  const cvEmpty = (drafts[customMetric] ?? "") === "";
  const cvMoney = cv.definition.unit === "sgd";

  return (
    <div className="flex flex-col gap-3 px-4 pb-[22px] pt-3.5">
      {/* 1 · Distance to the aim */}
      <Card tone="accent">
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[.08em] text-white/72">{heroLabel}</span>
          <span className="tnum shrink-0 text-[11px] text-white/72">{heroPeriod}</span>
        </div>
        <p className="mt-[7px] text-pretty text-[12px] leading-[1.5] text-white/82">{heroBlurb}</p>

        {!isCustom ? (
          <div className="mt-3 flex flex-col gap-2">
            {[closest, ...others].map((r, i) => (
              <DistanceBlock
                key={r.metric}
                title={`${r.label} route`}
                closest={i === 0}
                highlight={i === 0}
                achieved={sgd(r.achieved)}
                ofTarget={`of ${sgd(r.goalThreshold)}`}
                fill={r.goalProgress}
                projFill={Math.min(r.projected / r.goalThreshold, 1)}
                elapsed={elapsedFraction(r.pace)}
                toGo={r.goalReached ? `${TIER_LABEL[tier]} reached` : `${sgd(Math.max(r.goalThreshold - r.achieved, 0))} to go`}
                pace={paceText(r.pace, "sgd", r.goalReached)}
                note={routeGateText(r.credit)}
              />
            ))}
          </div>
        ) : cv.target !== null && cv.pace ? (
          <div className="mt-3 flex flex-col gap-2">
            <DistanceBlock
              key={customMetric}
              title={`${cv.definition.label} so far`}
              closest={false}
              highlight
              achieved={cvFmt(cv.achieved)}
              ofTarget={`of ${cvFmt(cv.target)}`}
              fill={Math.min(cv.achieved / cv.target, 1)}
              projFill={Math.min(cv.projected / cv.target, 1)}
              elapsed={elapsedFraction(cv.pace)}
              toGo={cv.reached ? "Goal reached" : `${cvFmt(cv.target - cv.achieved)} to go`}
              pace={paceText(cv.pace, cv.definition.unit, cv.reached)}
            />
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-white/36 p-4 text-center">
            <div className="tnum text-[22px] font-bold tracking-[-.02em]">{cvFmt(cv.achieved)} so far</div>
            <p className="mt-1.5 text-pretty text-[12px] leading-[1.5] text-white/80">Enter an amount below and this card shows your distance, pace and projection.</p>
          </div>
        )}
      </Card>

      {/* 2 · How you get there */}
      {hasGoal &&
        (!isCustom ? (
          <ProjectionCard
            series={routeSeries(advisor.id, cases, closest.metric, mdrt.period, TODAY)}
            subject={`${closest.label.toLowerCase()} credit`}
            unit="sgd"
            period={mdrt.period}
            target={closest.goalThreshold}
            achieved={closest.achieved}
            projected={closest.projected}
            pace={closest.pace}
            caption={`${closest.label} route`}
          />
        ) : (
          cv.target !== null &&
          cv.pace && (
            <ProjectionCard
              series={cumulativeSeries(advisor.id, cases, customMetric, cv.period, TODAY)}
              subject={metricWord(cv.definition.label)}
              unit={cv.definition.unit}
              period={cv.period}
              target={cv.target}
              achieved={cv.achieved}
              projected={cv.projected}
              pace={cv.pace}
              caption={periodLabel(cv.period)}
            />
          )
        ))}

      {/* 3 · What you are aiming at (+ 4 · the custom editor) */}
      <Card>
        <div className="flex items-baseline justify-between gap-2.5">
          <Label>What you are aiming at</Label>
          <span className="shrink-0 text-[11px] text-muted">one at a time</span>
        </div>
        <div role="radiogroup" aria-label="What you are aiming at" className="mt-[11px] grid grid-cols-2 gap-2">
          {TIERS.map((t) => {
            const selected = !isCustom && tier === t;
            const progress = Math.max(...mdrt.routes.map((r) => routeRatio(r, t)));
            return (
              <AimCard
                key={t}
                name={TIER_LABEL[t]}
                hint={`${sgd(thresholdFor("mdrt_commission", t))} commission`}
                progress={`${pct(progress)} there`}
                selected={selected}
                onPick={() => pickTier(t)}
              />
            );
          })}
          <AimCard
            name="Custom"
            hint="Your own targets"
            progress={cv.target !== null ? `${pct(Math.min(cv.achieved / cv.target, 1))} there` : "none set"}
            selected={isCustom}
            onPick={() => focusCustom(customMetric)}
          />
        </div>

        {isCustom && (
          <div className="mt-3.5 border-t border-line pt-[13px]">
            <div className="flex items-baseline justify-between gap-2.5">
              <Label>Which metric, and how much</Label>
              <span className="tnum shrink-0 text-[11px] text-muted">
                {setCount} of {OWN_METRICS.length} set
              </span>
            </div>
            <div role="radiogroup" aria-label="Metric" className="mt-[9px] flex flex-wrap gap-[7px]">
              {OWN_METRICS.map((m) => {
                const on = m.code === customMetric;
                const tracked = !UNTRACKED_METRICS.has(m.code);
                const isSet = goalFor(advisor.id, m.code, year, goalSet.targets) !== null;
                return (
                  <button
                    key={m.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => focusCustom(m.code)}
                    className={`flex items-center gap-[5px] rounded-full border px-3 py-[7px] text-[12px] font-semibold transition-colors duration-200 ${
                      on ? "border-brand bg-brand text-white" : `border-line bg-surface ${tracked ? "text-body" : "text-muted"}`
                    }`}
                  >
                    {isSet && <span className={`h-[5px] w-[5px] rounded-full ${on ? "bg-white" : tracked ? "bg-accent" : "bg-faint"}`} aria-hidden="true" />}
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-[11px] flex items-center gap-[9px]">
              <div className="relative flex min-w-0 flex-1 items-center">
                {cvMoney && (
                  <span className={`tnum pointer-events-none absolute left-[13px] text-[16px] font-semibold ${cvEmpty ? "text-faint" : "text-ink"}`} aria-hidden="true">
                    S$
                  </span>
                )}
                <input
                  id={amountId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={cvMoney ? 100 : 1}
                  value={drafts[customMetric] ?? ""}
                  placeholder="No goal"
                  aria-label={`${cv.definition.label} goal ${CADENCE_PER[cv.cadence]}`}
                  onChange={(e) => setAmount(customMetric, e.target.value)}
                  className={`tnum w-full rounded-xl border border-line bg-surface py-3 pr-3.5 text-[17px] font-semibold text-ink transition-[border-color,box-shadow] duration-150 placeholder:font-normal placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16 ${
                    cvMoney ? "pl-11" : "pl-3.5"
                  }`}
                />
              </div>
              <label htmlFor={amountId} className="w-[76px] shrink-0 text-[12px] text-muted">
                {CADENCE_PER[cv.cadence]}
              </label>
            </div>

            <div role="radiogroup" aria-label="How often the goal resets" className="mt-[9px] flex gap-[3px] rounded-[10px] bg-canvas p-[3px]">
              {CADENCES.map((c) => {
                const on = cv.cadence === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setCadence(customMetric, c)}
                    className={`flex-1 rounded-lg py-[7px] text-center text-[12px] ${on ? "bg-surface font-bold text-accent shadow-[0_1px_2px_rgba(20,35,94,.14)]" : "font-medium text-muted"}`}
                  >
                    {CADENCE_SHORT[c]}
                  </button>
                );
              })}
            </div>

            <p className="tnum mt-[9px] text-pretty text-[11px] leading-[1.5] text-muted">
              {cv.tracked
                ? `${cv.definition.label} counts over ${periodLabel(cv.period)} (${dateRange(cv.period)}). Achieved so far ${cvFmt(cv.achieved)}.`
                : `${cv.definition.label} counts over ${periodLabel(cv.period)}, but has no data source in the mockup yet.`}
            </p>
          </div>
        )}
      </Card>

      {/* 5 · All your goals */}
      <Card className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-2.5">
          <Label>All your goals</Label>
          <span className="shrink-0 text-[11px] text-muted">tap to focus above</span>
        </div>
        <div className="-mx-4 -mb-4 mt-[11px]">
          {OWN_METRICS.map((m) => {
            const v = view(m.code);
            const fmt = (n: number) => fmtMetric(n, v.definition.unit);
            const target = v.target;
            const set = target !== null;
            const focused = isCustom && customMetric === m.code;
            const tone: Tone = !set || !v.tracked ? "none" : v.reached ? "ok" : v.pace?.onTrack ? "accent" : "warn";
            const fill = target !== null ? Math.min(v.achieved / target, 1) : 0;
            const pendingFill = target !== null ? Math.min((v.projected - v.achieved) / target, Math.max(1 - v.achieved / target, 0)) : 0;
            const paceLine = !set ? "No target set" : !v.tracked ? "No data source yet" : paceText(v.pace, v.definition.unit, v.reached);
            return (
              <button
                key={m.code}
                type="button"
                aria-pressed={focused}
                onClick={() => focusCustom(m.code)}
                className={`block w-full border-t border-line px-4 pb-3 pt-[11px] text-left ${focused ? "bg-accent-soft/55" : "bg-surface"}`}
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{m.label}</span>
                    <span className="min-w-0 truncate text-[10px] text-muted">
                      {CADENCE_LABEL[v.cadence]} · {periodLabel(v.period)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                    {fmt(v.achieved)} / {target !== null ? fmt(target) : "—"}
                  </span>
                </div>
                <div className="mt-2 flex h-[5px] overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
                  <span className={`transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${TONE[tone].bar}`} style={{ width: `${fill * 100}%` }} />
                  <span className={TONE[tone].soft} style={{ width: `${pendingFill * 100}%` }} />
                </div>
                <div className="tnum mt-[7px] flex items-baseline justify-between gap-2.5 text-[11px]">
                  <span className={`min-w-0 font-medium ${TONE[tone].text}`}>{paceLine}</span>
                  <span className="shrink-0 text-muted">{set ? pct(fill) : "—"}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 6 · Footnote */}
      <p className="tnum px-1 text-pretty text-center text-[11px] leading-[1.55] text-muted">
        {`MDRT, COT and TOT use the ${MDRT_MEMBERSHIP_YEAR} thresholds: your ${MDRT_PRODUCTION_YEAR} production counts toward ${MDRT_MEMBERSHIP_YEAR} membership.${
          MDRT_THRESHOLDS_CONFIRMED ? "" : ` Singapore figures still to be confirmed against the ${MDRT_MEMBERSHIP_YEAR} chart.`
        } Other Products credit (hospital plans, funds, portfolios) counts only once Risk-Protection credit reaches ${sgd(floorsFor("mdrt_commission").risk)} of commission or ${sgd(
          floorsFor("mdrt_premium").risk,
        )} of premium. The income route adds renewals and other production income but needs ${sgd(floorsFor("mdrt_income").newBusiness ?? 0)} of new business and ${sgd(
          floorsFor("mdrt_income").risk,
        )} from Risk-Protection products. Custom goals are yours and reset each period.`}
      </p>
    </div>
  );
}

/** One of the four selectable aims: MDRT, COT, TOT or Custom. */
function AimCard({ name, hint, progress, selected, onPick }: { name: string; hint: string; progress: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`btn-lift block rounded-xl border-[1.5px] px-3 py-[11px] text-left ${selected ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/50"}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className={`text-[14px] font-bold ${selected ? "text-accent" : "text-ink"}`}>{name}</span>
        {selected && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      <div className="tnum mt-1 text-[11px] leading-[1.45] text-muted">{hint}</div>
      <div className={`tnum mt-0.5 text-[11px] font-semibold ${selected ? "text-accent" : "text-muted"}`}>{progress}</div>
    </button>
  );
}
