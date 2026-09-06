import { useEffect, useState, type ReactNode } from "react";
import { metric_definitions, TODAY, type Advisor, type Case, type MetricUnit, type Tier } from "../mock/data";
import {
  mdrtSnapshot,
  metricSnapshot,
  metricsForCase,
  productById,
  effectiveDate,
  weeksLeftInYear,
  weekSnapshot,
  type GoalSet,
  type MetricSnapshot,
  type MdrtRoute,
  type Pace,
} from "../lib/calc";
import { CADENCE_LABEL, count, dateRange, longDate, periodLabel, sgd, shortDate, signed, signedPct } from "../lib/format";
import { Card, Label } from "../components/ui";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;

function fmt(value: number, unit: MetricUnit): string {
  return unit === "sgd" ? sgd(value) : count(value);
}

function ratio(value: number, target: number | null): number {
  if (!target || target <= 0) return 0;
  return Math.min(value / target, 1);
}

/** Two-tone bar: confirmed in accent, pending as a lighter extension, plus a "today" tick at the elapsed fraction. */
function ProgressBar({ achieved, projected, elapsed }: { achieved: number; projected: number; elapsed: number | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const a = mounted ? achieved : 0;
  const p = mounted ? projected : 0;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-canvas" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full bg-accent/30 transition-[width] duration-700 ease-out" style={{ width: `${p * 100}%` }} />
      <div className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${a * 100}%` }} />
      {elapsed !== null && elapsed > 0 && elapsed < 1 && (
        <div className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `calc(${elapsed * 100}% - 1px)` }} title="Today" />
      )}
    </div>
  );
}

function PaceLine({ pace, unit, tracked, hasTarget, compact = false }: { pace: Pace | null; unit: MetricUnit; tracked: boolean; hasTarget: boolean; compact?: boolean }) {
  const mo = compact ? "/mo" : "/month";
  const wk = compact ? "/wk" : "/week";
  if (!tracked) return <div className="text-[12px] text-muted">Not tracked yet · no data source</div>;
  if (!hasTarget || !pace) return <div className="text-[12px] text-muted">No goal set</div>;
  if (pace.onTrack) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
        On track{compact ? "" : ` · projected ${fmt(pace.runRateProjection, unit)}`}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
      {pace.requiredPerMonth === null
        ? `Period ended · short by ${fmt(pace.gap, unit)}`
        : pace.remainingMonths < 1.5 && pace.requiredPerWeek !== null
          ? `Need ${fmt(pace.requiredPerWeek, unit)}${wk}`
          : `Need ${fmt(pace.requiredPerMonth, unit)}${mo}`}
    </div>
  );
}

function CompareLine({ snapshot }: { snapshot: MetricSnapshot }) {
  const { unit } = snapshot.definition;
  const { delta, deltaRatio, achieved, period } = snapshot.lastYear;
  const up = delta >= 0;
  return (
    <div className="tnum mt-1.5 border-t border-line pt-1.5 text-[12px]">
      <div className={`font-medium ${up ? "text-ok" : "text-warn"}`}>
        {signed(delta, unit)}
        {deltaRatio !== null && ` (${signedPct(deltaRatio)})`} vs last year
      </div>
      <div className="text-muted">
        {dateRange(period)}: {fmt(achieved, unit)}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Case["status"] }) {
  if (status !== "pending") return null;
  return <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">Pending</span>;
}

function CaseList({ cases, value, empty }: { cases: Case[]; value: (c: Case) => ReactNode; empty: string }) {
  if (cases.length === 0) return <p className="pt-3 text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="mt-3 divide-y divide-line border-t border-line">
      {cases.map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium text-ink">{c.client_name}</span>
              <StatusBadge status={c.status} />
            </div>
            <div className="truncate text-[12px] text-muted">
              {shortDate(effectiveDate(c))} · {productById(c.product_id)?.name}
            </div>
          </div>
          <div className="tnum shrink-0 text-right text-[14px] font-semibold text-body">{value(c)}</div>
        </li>
      ))}
    </ul>
  );
}

function ExpandableCard({
  expanded,
  onToggle,
  summary,
  detail,
  tone,
}: {
  expanded: boolean;
  onToggle: () => void;
  summary: ReactNode;
  detail: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <Card tone={tone} className="p-0">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="w-full rounded-2xl p-4 text-left">
        {summary}
      </button>
      {expanded && <div className="px-4 pb-4">{detail}</div>}
    </Card>
  );
}

function MetricTile({ snapshot, compare, selected, onSelect }: { snapshot: MetricSnapshot; compare: boolean; selected: boolean; onSelect: () => void }) {
  const { definition: def, achieved, projected, target, pace, period, cadence } = snapshot;
  const unit = def.unit;
  const { delta, deltaRatio } = snapshot.lastYear;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-2xl border bg-white p-3 text-left transition-shadow ${selected ? "border-accent ring-2 ring-accent/20" : "border-line"}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <Label>{def.label}</Label>
        {cadence && cadence !== "year" && <span className="rounded bg-accent-soft px-1 py-px text-[9px] font-semibold uppercase text-accent">{CADENCE_LABEL[cadence]}</span>}
      </div>
      <div className="mt-0.5 text-[10px] text-muted">{periodLabel(period)}</div>
      <div className="tnum mt-1.5 text-[22px] font-semibold leading-none text-ink">{fmt(achieved, unit)}</div>
      <div className="tnum mt-0.5 text-[11px] text-muted">{target === null ? "no goal" : `of ${fmt(target, unit)}`}</div>
      <div className="mt-2">
        <ProgressBar achieved={ratio(achieved, target)} projected={ratio(projected, target)} elapsed={pace ? pace.elapsedMonths / (pace.elapsedMonths + pace.remainingMonths) : null} />
      </div>
      <div className="mt-2">
        <PaceLine pace={pace} unit={unit} tracked hasTarget={target !== null} compact />
      </div>
      {compare && (
        <div className={`tnum mt-1 text-[11px] font-medium ${delta >= 0 ? "text-ok" : "text-warn"}`}>
          {signed(delta, unit)}
          {deltaRatio !== null && ` (${signedPct(deltaRatio)})`} vs last yr
        </div>
      )}
    </button>
  );
}

function MetricDetail({ snapshot, compare }: { snapshot: MetricSnapshot; compare: boolean }) {
  const { definition: def, projected, gap, period } = snapshot;
  const unit = def.unit;
  const metricValue = (c: Case) => {
    if (def.code === "new_clients") return "1 client";
    if (def.code === "commission" || def.code === "gross_revenue" || def.code === "wape") return sgd(metricsForCase(c)[def.code]);
    return "";
  };
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>{def.label} · detail</Label>
        <span className="text-[11px] text-muted">{periodLabel(period)}</span>
      </div>
      <dl className="tnum mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-canvas px-3 py-2">
          <dt className="text-[11px] text-muted">Projected (incl. pending)</dt>
          <dd className="text-[16px] font-semibold text-ink">{fmt(projected, unit)}</dd>
        </div>
        <div className="rounded-xl bg-canvas px-3 py-2">
          <dt className="text-[11px] text-muted">Gap to goal</dt>
          <dd className="text-[16px] font-semibold text-ink">{gap === null ? "—" : fmt(gap, unit)}</dd>
        </div>
      </dl>
      {compare && <CompareLine snapshot={snapshot} />}
      <CaseList cases={snapshot.contributing} value={metricValue} empty="No cases in this period yet." />
    </Card>
  );
}

function UntrackedCard({ snapshots }: { snapshots: MetricSnapshot[] }) {
  if (snapshots.length === 0) return null;
  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between">
        <Label>Not tracked yet</Label>
        <span className="text-[11px] text-muted">no data source in the mockup</span>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {snapshots.map((s) => (
          <li key={s.definition.code} className="tnum text-muted">
            <span className="font-medium text-body">{s.definition.label}</span>
            {s.target !== null && ` · goal ${fmt(s.target, s.definition.unit)}`}
            {s.cadence && s.cadence !== "year" && ` ${CADENCE_LABEL[s.cadence].toLowerCase()}`}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MdrtRouteBlock({ route, goalTier, highlight }: { route: MdrtRoute; goalTier: Tier; highlight: boolean }) {
  const target = route.goalThreshold;
  const elapsed = route.pace.elapsedMonths / (route.pace.elapsedMonths + route.pace.remainingMonths);
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-accent-soft/70 ring-1 ring-accent/30" : "bg-canvas"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[12px] font-semibold ${highlight ? "text-accent" : "text-body"}`}>{route.label} route</div>
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
            route.goalReached ? "bg-accent text-white" : "border border-accent text-accent"
          }`}
        >
          {TIER_LABEL[goalTier]}
          {route.goalReached ? " ✓" : ""}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <div className="tnum text-[22px] font-semibold leading-none text-ink">{sgd(route.achieved)}</div>
        <div className={`tnum text-[12px] ${route.goalReached ? "font-medium text-ok" : "text-muted"}`}>
          {route.goalReached ? `${TIER_LABEL[goalTier]} reached` : `${TIER_LABEL[goalTier]} at ${sgd(target)}`}
        </div>
      </div>
      <div className="mt-2">
        <ProgressBar achieved={ratio(route.achieved, target)} projected={ratio(route.projected, target)} elapsed={elapsed} />
      </div>
      <div className="tnum mt-1.5 flex justify-between text-[12px] text-muted">
        <span>
          Projected <span className="font-medium text-body">{sgd(route.projected)}</span>
        </span>
        <span>
          Gap <span className="font-medium text-body">{sgd(Math.max(target - route.achieved, 0))}</span>
        </span>
      </div>
      <div className="mt-1.5">
        <PaceLine pace={route.pace} unit="sgd" tracked hasTarget />
      </div>
    </div>
  );
}

function WeekCard({ advisorId, cases }: { advisorId: string; cases: Case[] }) {
  const w = weekSnapshot(advisorId, cases, TODAY);
  const ahead = w.onPaceToBeatLastWeek;
  const max = Math.max(w.thisWeek.commission, w.lastWeek.commission, 1);
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <Label>This week</Label>
        <span className="text-[11px] text-muted">
          {dateRange(w.thisWeek.period)} · day {w.dayOfWeek} of 7
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="tnum text-[28px] font-semibold leading-none text-ink">{sgd(w.thisWeek.commission)}</div>
        <div className="tnum text-[12px] text-muted">
          {w.thisWeek.cases} {w.thisWeek.cases === 1 ? "case" : "cases"} closed
        </div>
      </div>
      <dl className="mt-3 space-y-1.5">
        {[
          { label: "This week", value: w.thisWeek.commission, strong: true },
          { label: "Last week", value: w.lastWeek.commission, strong: false },
        ].map((r) => (
          <div key={r.label} className="grid grid-cols-[64px_1fr_72px] items-center gap-2 text-[12px]">
            <dt className="text-muted">{r.label}</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
              <div className={`h-full rounded-full ${r.strong ? "bg-accent" : "bg-accent/30"}`} style={{ width: `${(r.value / max) * 100}%` }} />
            </dd>
            <dd className={`tnum text-right ${r.strong ? "font-semibold text-ink" : "text-muted"}`}>{sgd(r.value)}</dd>
          </div>
        ))}
      </dl>
      <div className={`mt-3 flex items-center gap-1.5 text-[12px] font-medium ${ahead ? "text-ok" : "text-warn"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${ahead ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
        {w.lastWeek.commission === 0 && w.thisWeek.commission === 0
          ? "Nothing closed yet. One case puts you ahead of last week."
          : ahead
            ? w.thisWeek.commission > w.lastWeek.commission
              ? "Ahead of last week already."
              : `On pace to beat last week (projected ${sgd(w.projection)}).`
            : `${sgd(w.toBeatLastWeek)} more to beat last week.`}
      </div>
    </Card>
  );
}

export default function Home({
  advisor,
  cases,
  goalSet,
  onEditGoals,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  /** Omit for a read-only view (e.g. a manager looking at an FC). */
  onEditGoals?: () => void;
}) {
  const [compare, setCompare] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((k) => (k === key ? null : key));

  const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
  const snapshots = metric_definitions
    .filter((m) => m.code !== "mdrt_commission" && m.code !== "mdrt_premium") // both routes live in the MDRT card
    .map((m) => metricSnapshot(advisor.id, cases, m.code, TODAY, goalSet));
  const tracked = snapshots.filter((s) => s.tracked);
  const untracked = snapshots.filter((s) => !s.tracked);
  const selectedDetail = tracked.find((s) => s.definition.code === expanded) ?? null;
  const weeksLeft = weeksLeftInYear(TODAY);

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <Card tone="accent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[20px] font-semibold leading-tight">{advisor.name}</div>
            <div className="mt-1 text-[12px] text-white/75">
              {advisor.fc_code} · Band {advisor.banding_code.slice(1)}
            </div>
          </div>
          <div className="rounded-lg bg-white/15 px-2 py-1 text-[12px] font-semibold">{advisor.banding_code}</div>
        </div>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="text-[12px] text-white/75">{longDate(TODAY)}</div>
            {onEditGoals && (
              <button type="button" onClick={onEditGoals} className="mt-2 rounded-lg bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-white/25">
                Edit goals ›
              </button>
            )}
          </div>
          <div className="text-right">
            <div className="tnum text-[28px] font-semibold leading-none">{weeksLeft}</div>
            <div className="text-[11px] text-white/75">weeks left in {TODAY.getFullYear()}</div>
          </div>
        </div>
      </Card>

      <label className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3">
        <span className="text-[13px] font-medium text-body">Compare vs same period last year</span>
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input type="checkbox" className="peer sr-only" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          <span className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
          <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
        </span>
      </label>

      <WeekCard advisorId={advisor.id} cases={cases} />

      <ExpandableCard
        expanded={expanded === "mdrt"}
        onToggle={() => toggle("mdrt")}
        summary={
          <>
            <div className="flex items-baseline justify-between">
              <Label>MDRT</Label>
              <span className="text-[11px] text-muted">{periodLabel(mdrt.period)}</span>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              Aiming for <span className="font-medium text-accent">{TIER_LABEL[mdrt.goalTier]}</span>. Either route qualifies; you are closest on the{" "}
              <span className="font-medium text-accent">{mdrt.routes.find((r) => r.metric === mdrt.closer)?.label.toLowerCase()} route</span>.
            </p>
            <div className="mt-3 space-y-2">
              {mdrt.routes.map((r) => (
                <MdrtRouteBlock key={r.metric} route={r} goalTier={mdrt.goalTier} highlight={r.metric === mdrt.closer} />
              ))}
            </div>
          </>
        }
        detail={
          <CaseList
            cases={mdrt.contributing}
            value={(c) => {
              const m = metricsForCase(c);
              return (
                <>
                  <div>{sgd(m.mdrt_commission)}</div>
                  <div className="text-[11px] font-normal text-muted">prem {sgd(m.mdrt_premium)}</div>
                </>
              );
            }}
            empty="No cases in this period yet."
          />
        }
      />

      <div className="grid grid-cols-2 gap-3">
        {tracked.map((s) => (
          <MetricTile key={s.definition.code} snapshot={s} compare={compare} selected={expanded === s.definition.code} onSelect={() => toggle(s.definition.code)} />
        ))}
      </div>
      {selectedDetail && <MetricDetail snapshot={selectedDetail} compare={compare} />}

      <UntrackedCard snapshots={untracked} />

      <p className="px-1 text-center text-[11px] text-muted">Tap a metric to see the cases behind it. Confirmed cases count as achieved; pending ones only as projected.</p>
    </div>
  );
}
