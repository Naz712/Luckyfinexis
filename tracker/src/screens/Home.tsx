import { useEffect, useState, type ReactNode } from "react";
import { metric_definitions, TODAY, type Advisor, type Case, type MetricUnit } from "../mock/data";
import {
  mdrtSnapshot,
  metricSnapshot,
  metricsForCase,
  productById,
  effectiveDate,
  weeksLeftInYear,
  type MetricSnapshot,
  type MdrtRoute,
  type Pace,
} from "../lib/calc";
import { count, dateRange, longDate, periodLabel, sgd, shortDate, signed, signedPct } from "../lib/format";
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

function PaceLine({ pace, unit, tracked, hasTarget }: { pace: Pace | null; unit: MetricUnit; tracked: boolean; hasTarget: boolean }) {
  if (!tracked) return <div className="text-[12px] text-muted">Not tracked yet · no data source</div>;
  if (!hasTarget || !pace) return <div className="text-[12px] text-muted">No goal set</div>;
  if (pace.onTrack) {
    return (
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ok">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
        On track · projected {fmt(pace.runRateProjection, unit)}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
      {pace.requiredPerMonth === null ? `Period ended · short by ${fmt(pace.gap, unit)}` : `Need ${fmt(pace.requiredPerMonth, unit)}/month`}
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

function MetricCard({ snapshot, compare, expanded, onToggle }: { snapshot: MetricSnapshot; compare: boolean; expanded: boolean; onToggle: () => void }) {
  const { definition: def, achieved, projected, target, gap, pace, tracked, period } = snapshot;
  const unit = def.unit;
  const metricValue = (c: Case) => {
    if (def.code === "new_clients") return "1 client";
    if (def.code === "commission" || def.code === "gross_revenue" || def.code === "wape") return sgd(metricsForCase(c)[def.code]);
    return "";
  };
  return (
    <ExpandableCard
      expanded={expanded}
      onToggle={onToggle}
      summary={
        <>
          <div className="flex items-baseline justify-between">
            <Label>{def.label}</Label>
            <span className="text-[11px] text-muted">{periodLabel(period)}</span>
          </div>
          {tracked ? (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <div className="tnum text-[28px] font-semibold leading-none text-ink">{fmt(achieved, unit)}</div>
                <div className="tnum text-[12px] text-muted">{target === null ? "no goal" : `of ${fmt(target, unit)}`}</div>
              </div>
              <div className="mt-3">
                <ProgressBar achieved={ratio(achieved, target)} projected={ratio(projected, target)} elapsed={pace ? pace.elapsedMonths / (pace.elapsedMonths + pace.remainingMonths) : null} />
              </div>
              <div className="tnum mt-2 flex flex-wrap justify-between gap-x-3 text-[12px] text-muted">
                <span>
                  Projected <span className="font-medium text-body">{fmt(projected, unit)}</span>
                </span>
                <span>
                  Gap <span className="font-medium text-body">{gap === null ? "—" : fmt(gap, unit)}</span>
                </span>
              </div>
              <div className="mt-2">
                <PaceLine pace={pace} unit={unit} tracked hasTarget={target !== null} />
              </div>
              {compare && <CompareLine snapshot={snapshot} />}
            </>
          ) : (
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <div className="text-[13px] text-muted">Not tracked yet · no data source</div>
              <div className="tnum text-[12px] text-muted">{target === null ? "no goal" : `goal ${fmt(target, unit)}`}</div>
            </div>
          )}
        </>
      }
      detail={
        tracked ? (
          <CaseList cases={snapshot.contributing} value={metricValue} empty="No cases in this period yet." />
        ) : (
          <p className="text-[13px] text-muted">Nothing to list: this metric has no data source in the mockup.</p>
        )
      }
    />
  );
}

function TierChips({ route }: { route: MdrtRoute }) {
  const reachedIdx = route.tiers.reached ? ["mdrt", "cot", "tot"].indexOf(route.tiers.reached) : -1;
  return (
    <div className="flex gap-1">
      {(["mdrt", "cot", "tot"] as const).map((t, i) => {
        const reached = i <= reachedIdx;
        const next = t === route.tiers.next;
        return (
          <span
            key={t}
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
              reached ? "bg-accent text-white" : next ? "border border-accent/40 text-accent" : "border border-line text-muted"
            }`}
          >
            {TIER_LABEL[t]}
          </span>
        );
      })}
    </div>
  );
}

function MdrtRouteBlock({ route, highlight }: { route: MdrtRoute; highlight: boolean }) {
  const target = route.nextThreshold;
  const elapsed = route.pace ? route.pace.elapsedMonths / (route.pace.elapsedMonths + route.pace.remainingMonths) : null;
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-accent-soft/70 ring-1 ring-accent/30" : "bg-canvas"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[12px] font-semibold ${highlight ? "text-accent" : "text-body"}`}>{route.label} route</div>
        <div className="shrink-0">
          <TierChips route={route} />
        </div>
      </div>
      <div className="mt-1.5 flex items-baseline justify-between">
        <div className="tnum text-[22px] font-semibold leading-none text-ink">{sgd(route.achieved)}</div>
        <div className="tnum text-[12px] text-muted">{target === null ? "TOT reached" : `${TIER_LABEL[route.tiers.next!]} at ${sgd(target)}`}</div>
      </div>
      <div className="mt-2">
        <ProgressBar achieved={ratio(route.achieved, target)} projected={ratio(route.projected, target)} elapsed={elapsed} />
      </div>
      <div className="tnum mt-1.5 flex justify-between text-[12px] text-muted">
        <span>
          Projected <span className="font-medium text-body">{sgd(route.projected)}</span>
        </span>
        <span>
          Gap <span className="font-medium text-body">{target === null ? "—" : sgd(Math.max(target - route.achieved, 0))}</span>
        </span>
      </div>
      <div className="mt-1.5">
        <PaceLine pace={route.pace} unit="sgd" tracked hasTarget={target !== null} />
      </div>
    </div>
  );
}

export default function Home({ advisor, cases }: { advisor: Advisor; cases: Case[] }) {
  const [compare, setCompare] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((k) => (k === key ? null : key));

  const mdrt = mdrtSnapshot(advisor.id, cases, TODAY);
  const snapshots = metric_definitions
    .filter((m) => m.code !== "mdrt_commission" && m.code !== "mdrt_premium") // both routes live in the MDRT card
    .map((m) => metricSnapshot(advisor.id, cases, m.code, TODAY));
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
          <div className="text-[12px] text-white/75">{longDate(TODAY)}</div>
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
              Two routes qualify. You are closest on the{" "}
              <span className="font-medium text-accent">{mdrt.routes.find((r) => r.metric === mdrt.closer)?.label.toLowerCase()} route</span>.
            </p>
            <div className="mt-3 space-y-2">
              {mdrt.routes.map((r) => (
                <MdrtRouteBlock key={r.metric} route={r} highlight={r.metric === mdrt.closer} />
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

      {snapshots.map((s) => (
        <MetricCard key={s.definition.code} snapshot={s} compare={compare} expanded={expanded === s.definition.code} onToggle={() => toggle(s.definition.code)} />
      ))}

      <p className="px-1 text-center text-[11px] text-muted">Tap a card to see the cases behind it. Confirmed cases count as achieved; pending ones only as projected.</p>
    </div>
  );
}
