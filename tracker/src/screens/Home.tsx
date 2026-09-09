import { useState, type ReactNode } from "react";
import { metric_definitions, TODAY, type Advisor, type Case } from "../mock/data";
import {
  effectiveDate,
  metricSnapshot,
  metricsForCase,
  periodComparison,
  periodSeries,
  productById,
  weeksLeftInYear,
  type GoalSet,
  type Grain,
  type MetricSnapshot,
} from "../lib/calc";
import { CADENCE_LABEL, fmtMetric as fmt, longDate, paceText, pct, periodLabel, sgd, sgdCompact, shortDate } from "../lib/format";
import { Card, Label, Segmented } from "../components/ui";
import BarChart from "../components/BarChart";

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

/** One period's output against the previous one, with the last 8 weeks or 12 months as bars. */
function ProgressCard({ advisorId, cases }: { advisorId: string; cases: Case[] }) {
  const [grain, setGrain] = useState<Grain>("week");
  const [selected, setSelected] = useState<number | null>(null);
  const series = periodSeries(advisorId, cases, grain, grain === "week" ? 8 : 12, TODAY);
  const cmp = periodComparison(advisorId, cases, grain, TODAY);
  const sel = selected ?? series.length - 1;
  const point = series[sel];
  const prevWord = grain === "week" ? "last week" : "last month";
  const unitWord = grain === "week" ? "week" : "month";
  const ahead = cmp.onPaceToBeatPrevious;
  const nothingYet = cmp.current.commission === 0 && cmp.previous.commission === 0;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>Progress</Label>
          <div className="mt-0.5 text-[11px] text-muted">Commission by the date each case was closed</div>
        </div>
        <div className="w-[128px] shrink-0">
          <Segmented
            ariaLabel="Chart grain"
            value={grain}
            onChange={(g) => {
              setGrain(g);
              setSelected(null);
            }}
            options={[
              { value: "week", label: "Weeks" },
              { value: "month", label: "Months" },
            ]}
          />
        </div>
      </div>
      <div className="mt-3">
        <BarChart
          title={`Commission per ${unitWord}, last ${series.length} ${unitWord}s`}
          points={series.map((p) => ({ label: p.label, longLabel: p.longLabel, value: p.commission, detail: `${p.cases} ${p.cases === 1 ? "case" : "cases"}` }))}
          selected={sel}
          onSelect={setSelected}
          formatValue={sgd}
          formatTick={sgdCompact}
        />
      </div>
      <div className="tnum mt-1 flex items-baseline justify-between text-[12px]">
        <span className="font-medium text-body">{point.longLabel}</span>
        <span className="text-muted">
          {sgd(point.commission)} · {point.cases} {point.cases === 1 ? "case" : "cases"}
        </span>
      </div>
      <div className={`mt-3 flex items-center gap-1.5 text-[13px] font-medium ${ahead ? "text-ok" : "text-warn"}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ahead ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
        {nothingYet
          ? `Nothing closed yet. One case puts you ahead of ${prevWord}.`
          : ahead
            ? cmp.current.commission > cmp.previous.commission
              ? `Ahead of ${prevWord} already (${sgd(cmp.previous.commission)}).`
              : `On pace to beat ${prevWord}: projected ${sgd(cmp.projection)} vs ${sgd(cmp.previous.commission)}.`
            : `${sgd(cmp.toBeatPrevious)} more to beat ${prevWord}.`}
      </div>
      <div className="mt-1 text-[12px] text-muted">
        {cmp.streak >= 2
          ? `${cmp.streak} ${unitWord}s in a row with a case closed.`
          : cmp.current.cases > 0
            ? `First ${unitWord} of a new streak.`
            : `No case closed yet this ${unitWord}.`}
      </div>
    </Card>
  );
}

type Tone = "accent" | "ok" | "warn";

const METER: Record<Tone, { track: string; fill: string; soft: string; dot: string; text: string }> = {
  accent: { track: "bg-accent-soft", fill: "bg-accent", soft: "bg-accent/35", dot: "bg-accent", text: "text-accent" },
  ok: { track: "bg-ok/10", fill: "bg-ok", soft: "bg-ok/35", dot: "bg-ok", text: "text-ok" },
  warn: { track: "bg-warn/10", fill: "bg-warn", soft: "bg-warn/35", dot: "bg-warn", text: "text-warn" },
};

/** Thin meter toward the goal: solid = confirmed, translucent = pending, tick = where today falls in the window. */
function Meter({ achieved, projected, target, elapsed, tone }: { achieved: number; projected: number; target: number; elapsed: number | null; tone: Tone }) {
  const a = Math.min(achieved / target, 1);
  const p = Math.min(projected / target, 1);
  const c = METER[tone];
  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full ${c.track}`} aria-hidden="true">
      <div className={`absolute inset-y-0 left-0 rounded-full ${c.soft}`} style={{ width: `${p * 100}%` }} />
      <div className={`absolute inset-y-0 left-0 rounded-full ${c.fill}`} style={{ width: `${a * 100}%` }} />
      {elapsed !== null && elapsed > 0 && elapsed < 1 && <div className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `calc(${elapsed * 100}% - 1px)` }} />}
    </div>
  );
}

/** One metric in the list. Tap to expand in place with projected, gap and the cases behind it. */
function MetricRow({ snapshot, expanded, onToggle }: { snapshot: MetricSnapshot; expanded: boolean; onToggle: () => void }) {
  const { definition: def, achieved, projected, target, gap, pace, period, cadence } = snapshot;
  const unit = def.unit;
  const pending = projected - achieved;
  const reached = target !== null && (gap ?? 0) === 0;
  const tone: Tone = reached ? "ok" : pace && !pace.onTrack ? "warn" : "accent";
  const elapsed = pace && pace.elapsedMonths + pace.remainingMonths > 0 ? pace.elapsedMonths / (pace.elapsedMonths + pace.remainingMonths) : null;
  const metricValue = (c: Case) => {
    if (def.code === "new_clients") return "1 client";
    if (def.code === "elite" || def.code === "referrals" || def.code === "testimonials") return "";
    return sgd(metricsForCase(c)[def.code]);
  };
  return (
    <li className={expanded ? "bg-accent-soft/30" : ""}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="block w-full px-4 py-3.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Label>{def.label}</Label>
            {cadence && cadence !== "year" && <span className="rounded bg-accent-soft px-1 py-px text-[9px] font-semibold uppercase text-accent">{CADENCE_LABEL[cadence]}</span>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
            {periodLabel(period)}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[26px] font-semibold leading-none text-ink">{fmt(achieved, unit)}</span>
          <span className="tnum shrink-0 text-[11px] text-muted">{pending > 0 ? `+${fmt(pending, unit)} pending` : "all confirmed"}</span>
        </div>
        {target !== null ? (
          <>
            <div className="mt-2.5">
              <Meter achieved={achieved} projected={projected} target={target} elapsed={elapsed} tone={tone} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px]">
              <span className={`flex min-w-0 items-center gap-1.5 font-medium ${METER[tone].text}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${METER[tone].dot}`} aria-hidden="true" />
                <span className="truncate">{paceText(pace, unit, reached)}</span>
              </span>
              <span className="tnum shrink-0 text-muted">
                {pct(achieved / target)} of {fmt(target, unit)}
              </span>
            </div>
          </>
        ) : (
          <div className="mt-2 text-[12px] text-muted">No goal set for this metric.</div>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <dl className="tnum grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white px-3 py-2">
              <dt className="text-[11px] text-muted">Projected (incl. pending)</dt>
              <dd className="text-[16px] font-semibold text-ink">{fmt(projected, unit)}</dd>
            </div>
            <div className="rounded-xl bg-white px-3 py-2">
              <dt className="text-[11px] text-muted">{target === null ? "Goal" : "Gap to goal"}</dt>
              <dd className="text-[16px] font-semibold text-ink">{target === null ? "not set" : fmt(gap ?? 0, unit)}</dd>
            </div>
          </dl>
          <CaseList cases={snapshot.contributing} value={metricValue} empty="No cases in this period yet." />
        </div>
      )}
    </li>
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
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Home({ advisor, cases, goalSet }: { advisor: Advisor; cases: Case[]; goalSet: GoalSet }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((k) => (k === key ? null : key));

  const snapshots = metric_definitions
    .filter((m) => m.code !== "mdrt_commission") // identical to commission while every credit rate is 1.0
    .map((m) => metricSnapshot(advisor.id, cases, m.code, TODAY, goalSet));
  const tracked = snapshots.filter((s) => s.tracked);
  const untracked = snapshots.filter((s) => !s.tracked);
  const weeksLeft = weeksLeftInYear(TODAY);

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <Card tone="accent">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[20px] font-semibold leading-tight">{advisor.name}</div>
            <div className="mt-1 text-[12px] text-white/75">
              {advisor.fc_code} · Band {advisor.banding_code.slice(1)} · {longDate(TODAY)}
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-[28px] font-semibold leading-none">{weeksLeft}</div>
            <div className="text-[11px] text-white/75">weeks left in {TODAY.getFullYear()}</div>
          </div>
        </div>
      </Card>

      <ProgressCard advisorId={advisor.id} cases={cases} />

      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-line">
          {tracked.map((s) => (
            <MetricRow key={s.definition.code} snapshot={s} expanded={expanded === s.definition.code} onToggle={() => toggle(s.definition.code)} />
          ))}
        </ul>
      </Card>

      <UntrackedCard snapshots={untracked} />

      <p className="px-1 text-center text-[11px] text-muted">Tap a metric to see the cases behind it. Confirmed cases count; pending ones show as projected. Goals and pace live in the Goals tab.</p>
    </div>
  );
}
