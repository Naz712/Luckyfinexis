import { useEffect, useState } from "react";
import { MDRT_MEMBERSHIP_YEAR, MDRT_PRODUCTION_YEAR, MDRT_THRESHOLDS_CONFIRMED, metric_definitions, TODAY, type Advisor, type Case, type MetricCode, type Tier } from "../mock/data";
import { UNTRACKED_METRICS, mdrtSnapshot, metricSnapshot, weeksLeftInYear, type GoalSet, type MdrtRoute, type Pace } from "../lib/calc";
import { CADENCE_LABEL, fmtMetric as fmt, paceText, periodLabel, sgd } from "../lib/format";
import { Card, Segmented, Select } from "../components/ui";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;

export type PrimaryGoal = { kind: "tier" } | { kind: "custom"; metric: MetricCode };

/** Thick bar on the accent card: white = achieved, translucent = projected, tick = where today falls. */
function DistanceBar({ achieved, projected, elapsed }: { achieved: number; projected: number; elapsed: number | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const a = mounted ? achieved : 0;
  const p = mounted ? projected : 0;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/20" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full bg-white/45 transition-[width] duration-700 ease-out" style={{ width: `${p * 100}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-700 ease-out" style={{ width: `${a * 100}%` }} />
      {elapsed !== null && elapsed > 0 && elapsed < 1 && <div className="absolute inset-y-0 w-0.5 bg-ink/60" style={{ left: `calc(${elapsed * 100}% - 1px)` }} title="Today" />}
    </div>
  );
}

function elapsedOf(pace: Pace | null): number | null {
  return pace ? pace.elapsedMonths / (pace.elapsedMonths + pace.remainingMonths) : null;
}

function RouteBlock({ route, tier, closer }: { route: MdrtRoute; tier: Tier; closer: boolean }) {
  const toGo = Math.max(route.goalThreshold - route.achieved, 0);
  return (
    <div className={`rounded-xl p-3 ${closer ? "bg-white/15" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-white/90">{route.label} route</div>
        {closer && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">closest</span>}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className={`tnum font-semibold leading-none ${closer ? "text-[34px]" : "text-[24px]"}`}>{sgd(route.achieved)}</div>
        <div className="tnum text-[12px] text-white/75">of {sgd(route.goalThreshold)}</div>
      </div>
      <div className="mt-3">
        <DistanceBar achieved={route.goalProgress} projected={Math.min(route.projected / route.goalThreshold, 1)} elapsed={elapsedOf(route.pace)} />
      </div>
      <div className="tnum mt-2 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="font-medium text-white">{route.goalReached ? `${TIER_LABEL[tier]} reached` : `${sgd(toGo)} to go`}</span>
        <span className="text-white/85">{paceText(route.pace, "sgd", route.goalReached)}</span>
      </div>
    </div>
  );
}

export default function Goals({
  advisor,
  cases,
  goalSet,
  primary,
  onPrimaryChange,
  onTierChange,
  onEdit,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  primary: PrimaryGoal;
  onPrimaryChange: (p: PrimaryGoal) => void;
  onTierChange: (t: Tier) => void;
  onEdit: () => void;
}) {
  const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
  const weeksLeft = weeksLeftInYear(TODAY);
  const mode: Tier | "custom" = primary.kind === "tier" ? mdrt.goalTier : "custom";
  const customMetric = primary.kind === "custom" ? primary.metric : "commission";
  const customMetrics = metric_definitions.filter((m) => !UNTRACKED_METRICS.has(m.code));
  const custom = metricSnapshot(advisor.id, cases, customMetric, TODAY, goalSet);
  const closerRoute = mdrt.routes.find((r) => r.metric === mdrt.closer)!;
  const otherRoute = mdrt.routes.find((r) => r.metric !== mdrt.closer)!;

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <Segmented
        ariaLabel="Goal type"
        value={mode}
        onChange={(v) => {
          if (v === "custom") onPrimaryChange({ kind: "custom", metric: customMetric });
          else {
            onTierChange(v);
            onPrimaryChange({ kind: "tier" });
          }
        }}
        options={[
          { value: "mdrt", label: "MDRT" },
          { value: "cot", label: "COT" },
          { value: "tot", label: "TOT" },
          { value: "custom", label: "Custom" },
        ]}
      />

      {mode !== "custom" ? (
        <>
          <Card tone="accent">
            <div className="flex items-baseline justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">
              Distance to {TIER_LABEL[mdrt.goalTier]} {MDRT_MEMBERSHIP_YEAR}
            </div>
              <div className="tnum text-[11px] text-white/70">
                {periodLabel(mdrt.period)} · {weeksLeft} weeks left
              </div>
            </div>
            <p className="mt-1 text-[12px] text-white/80">Either route qualifies. You are closest on the {closerRoute.label.toLowerCase()} route.</p>
            <div className="mt-3 space-y-2">
              <RouteBlock route={closerRoute} tier={mdrt.goalTier} closer />
              <RouteBlock route={otherRoute} tier={mdrt.goalTier} closer={false} />
            </div>
          </Card>
          <Card>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">How you get there</div>
            <ul className="mt-2 space-y-2 text-[13px] text-body">
              <li className="tnum">
                At your current rate you finish {periodLabel(mdrt.period)} at <span className="font-semibold text-ink">{sgd(closerRoute.pace.runRateProjection)}</span> on the{" "}
                {closerRoute.label.toLowerCase()} route.
              </li>
              {closerRoute.projected > closerRoute.achieved && (
                <li className="tnum">
                  Pending cases add <span className="font-semibold text-ink">{sgd(closerRoute.projected - closerRoute.achieved)}</span> once Merlin confirms them.
                </li>
              )}
              {!closerRoute.goalReached && closerRoute.pace.requiredPerWeek !== null && (
                <li className="tnum">
                  That is <span className="font-semibold text-ink">{sgd(closerRoute.pace.requiredPerWeek)}</span> a week for the remaining {weeksLeft} weeks.
                </li>
              )}
            </ul>
          </Card>
        </>
      ) : (
        <>
          <Select
            aria-label="Custom goal metric"
            placeholder="Metric"
            value={customMetric}
            onChange={(e) => onPrimaryChange({ kind: "custom", metric: e.target.value as MetricCode })}
            options={customMetrics.map((m) => ({ value: m.code, label: m.label }))}
          />
          {custom.target === null ? (
            <Card>
              <div className="text-[15px] font-semibold text-ink">No goal set for {custom.definition.label.toLowerCase()} yet.</div>
              <p className="mt-1 text-[13px] text-muted">Set an amount and how often it resets, and this card will show your distance and pace.</p>
            </Card>
          ) : (
            <>
              <Card tone="accent">
                <div className="flex items-baseline justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Distance to {fmt(custom.target, custom.definition.unit)}</div>
                  <div className="tnum text-[11px] text-white/70">
                    {custom.cadence ? `${CADENCE_LABEL[custom.cadence]} · ` : ""}
                    {periodLabel(custom.period)}
                  </div>
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div className="tnum text-[34px] font-semibold leading-none">{fmt(custom.achieved, custom.definition.unit)}</div>
                  <div className="tnum text-[12px] text-white/75">{custom.definition.label.toLowerCase()} so far</div>
                </div>
                <div className="mt-3">
                  <DistanceBar
                    achieved={Math.min(custom.achieved / custom.target, 1)}
                    projected={Math.min(custom.projected / custom.target, 1)}
                    elapsed={elapsedOf(custom.pace)}
                  />
                </div>
                <div className="tnum mt-2 flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="font-medium text-white">{(custom.gap ?? 0) === 0 ? "Goal reached" : `${fmt(custom.gap ?? 0, custom.definition.unit)} to go`}</span>
                  <span className="text-white/85">{paceText(custom.pace, custom.definition.unit, (custom.gap ?? 0) === 0)}</span>
                </div>
              </Card>
              <Card>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">How you get there</div>
                <ul className="mt-2 space-y-2 text-[13px] text-body">
                  {custom.pace && (
                    <li className="tnum">
                      At your current rate you finish {periodLabel(custom.period)} at <span className="font-semibold text-ink">{fmt(custom.pace.runRateProjection, custom.definition.unit)}</span>.
                    </li>
                  )}
                  {custom.projected > custom.achieved && (
                    <li className="tnum">
                      Pending cases add <span className="font-semibold text-ink">{fmt(custom.projected - custom.achieved, custom.definition.unit)}</span> once confirmed.
                    </li>
                  )}
                </ul>
              </Card>
            </>
          )}
        </>
      )}

      <button type="button" onClick={onEdit} className="w-full rounded-2xl border border-line bg-white py-3 text-[14px] font-semibold text-accent hover:bg-accent-soft">
        Edit goals ›
      </button>
      <p className="px-1 text-center text-[11px] text-muted">
        MDRT, COT and TOT use the {MDRT_MEMBERSHIP_YEAR} thresholds: your {MDRT_PRODUCTION_YEAR} production counts toward {MDRT_MEMBERSHIP_YEAR} membership.
        {!MDRT_THRESHOLDS_CONFIRMED && ` Singapore figures still to be confirmed against the ${MDRT_MEMBERSHIP_YEAR} chart.`} Custom goals are yours and reset each
        period.
      </p>
    </div>
  );
}
