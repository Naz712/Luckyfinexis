import { useCallback, useState, type ReactNode } from "react";
import {
  insurers,
  MDRT_MEMBERSHIP_YEAR,
  MDRT_THRESHOLDS_CONFIRMED,
  metric_definitions,
  TODAY,
  type Advisor,
  type Case,
  type MetricCode,
  type MetricDefinition,
  type Tier,
} from "../mock/data";
import {
  casesForAdvisor,
  clientsNeeded,
  contributingCases,
  effectiveDate,
  goalFor,
  mdrtSnapshot,
  metricSnapshot,
  metricsForCase,
  productById,
  UNTRACKED_METRICS,
  weeksLeftIn,
  type CaseMetrics,
  type GoalSet,
  type MdrtRoute,
  type MdrtRouteMetric,
  type MetricSnapshot,
  type Pace,
  type Period,
  type PrimaryGoal,
} from "../lib/calc";
import { fmtMetric, paceText, pct, periodLabel, sgd, shortDate } from "../lib/format";
import { Card, Label } from "../components/ui";
import Sheet from "../components/Sheet";

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };

/** Semicircular progress arc: 350×180 viewBox, 471.2 units long. */
const ARC = 471.2;
const ARC_PATH = "M25 160 A150 150 0 0 1 325 160";
const ARC_TRANSITION = { transition: "stroke-dasharray .55s cubic-bezier(.22,1,.36,1)" } as const;
const arcDash = (frac: number) => `${(ARC * frac).toFixed(1)} ${ARC}`;

/** The order the "This year" rows appear in. */
const TRACKED_ORDER: MetricCode[] = ["commission", "gross_revenue", "wape", "new_clients"];

type Tone = "ok" | "accent" | "warn";
const TONE: Record<Tone, { text: string; dot: string; fill: string; soft: string }> = {
  ok: { text: "text-ok", dot: "bg-ok", fill: "bg-ok", soft: "bg-ok/35" },
  accent: { text: "text-accent", dot: "bg-accent", fill: "bg-accent", soft: "bg-accent/35" },
  warn: { text: "text-warn", dot: "bg-warn", fill: "bg-warn", soft: "bg-warn/35" },
};

// ───────────────────────── Small helpers ─────────────────────────

function Chevron({ size = 13, strokeWidth = 1.9, className = "" }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Caret() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function insurerName(productId: string): string {
  const product = productById(productId);
  return insurers.find((i) => i.id === product?.insurer_id)?.name ?? "";
}

function isCaseMetric(code: MetricCode): code is keyof CaseMetrics {
  return code === "commission" || code === "gross_revenue" || code === "mdrt_premium" || code === "mdrt_commission" || code === "wape";
}

/** The value one case contributes to a metric row: money for the S$ metrics, "1 client" for new clients. */
function caseValue(c: Case, code: MetricCode): string {
  if (code === "new_clients") return "1 client";
  return isCaseMetric(code) ? sgd(metricsForCase(c)[code]) : "";
}

function isCalendarYear(p: Period): boolean {
  return p.start.getMonth() === 0 && p.start.getDate() === 1 && p.end.getMonth() === 11 && p.end.getDate() === 31 && p.start.getFullYear() === p.end.getFullYear();
}

/** "2026" for a calendar year, otherwise the window ("Q3 2026"). */
function windowWord(p: Period): string {
  return isCalendarYear(p) ? String(p.end.getFullYear()) : periodLabel(p);
}

/** Ids of each client's earliest live case — the ones that count for `new_clients` (mirrors aggregate()). */
function firstCaseIds(cases: Case[]): Set<string> {
  const first = new Map<string, Case>();
  for (const c of cases) {
    if (c.status === "superseded") continue;
    const prev = first.get(c.client_name);
    if (!prev || effectiveDate(c) < effectiveDate(prev)) first.set(c.client_name, c);
  }
  return new Set([...first.values()].map((c) => c.id));
}

// ───────────────────────── Route view ─────────────────────────

type RouteWord = "commission" | "premium";

/** One MDRT route as the hero shows it: its window, totals and — when the aim gives it one — a target to pace against. */
interface RouteView {
  metric: MdrtRouteMetric;
  label: string;
  word: RouteWord;
  period: Period;
  achieved: number;
  projected: number;
  target: number | null;
  gap: number;
  pace: Pace | null;
  /** Which per-case figure this route sums. */
  valueKey: keyof CaseMetrics;
}

function routeView(r: MdrtRoute, primary: PrimaryGoal, mdrtPeriod: Period, commission: MetricSnapshot): RouteView {
  const word: RouteWord = r.metric === "mdrt_commission" ? "commission" : "premium";
  const base = { metric: r.metric, label: r.label, word };
  if (primary.kind === "tier") {
    return { ...base, period: mdrtPeriod, achieved: r.achieved, projected: r.projected, target: r.goalThreshold, gap: r.pace.gap, pace: r.pace, valueKey: r.metric };
  }
  if (word === "commission") {
    // The custom aim is the FC's own commission goal, measured over that goal's cadence window.
    return {
      ...base,
      period: commission.period,
      achieved: commission.achieved,
      projected: commission.projected,
      target: commission.target,
      gap: commission.gap ?? 0,
      pace: commission.pace,
      valueKey: "commission",
    };
  }
  // No custom premium target exists: the credit is tracked but there is nothing to pace it against.
  return { ...base, period: mdrtPeriod, achieved: r.achieved, projected: r.projected, target: null, gap: 0, pace: null, valueKey: "mdrt_premium" };
}

// ───────────────────────── This year rows ─────────────────────────

function MetricRow({
  snapshot,
  cases,
  expanded,
  onToggle,
  onOpenCase,
}: {
  snapshot: MetricSnapshot;
  /** The cases listed when expanded (already narrowed for count metrics). */
  cases: Case[];
  expanded: boolean;
  onToggle: () => void;
  onOpenCase: (c: Case) => void;
}) {
  const { definition: def, achieved, projected, target, gap, pace, period } = snapshot;
  const unit = def.unit;
  const tgt = target !== null && target > 0 ? target : null;
  const reached = tgt !== null && (gap ?? 0) === 0;
  const tone: Tone = reached ? "ok" : pace && !pace.onTrack ? "warn" : "accent";
  const t = TONE[tone];
  const fill = tgt !== null ? Math.min(achieved / tgt, 1) : 0;
  const pendingFill = tgt !== null ? Math.min(Math.max(projected - achieved, 0) / tgt, 1 - fill) : 0;

  return (
    <div className={`border-t border-line ${expanded ? "bg-accent-soft/55" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="block w-full px-4 pb-[13px] pt-3 text-left">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-[7px]">
            <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{def.label}</span>
            <span className="min-w-0 truncate text-[10px] text-muted">{periodLabel(period)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-[7px]">
            <span className="tnum text-[16px] font-bold text-ink">{fmtMetric(achieved, unit)}</span>
            <span className={`block text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
              <Caret />
            </span>
          </div>
        </div>
        <div className="mt-[9px] flex h-[5px] overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
          <span className={`${t.fill} transition-[width] duration-[450ms]`} style={{ width: `${fill * 100}%` }} />
          <span className={`${t.soft} transition-[width] duration-[450ms]`} style={{ width: `${pendingFill * 100}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2.5">
          <span className={`tnum flex min-w-0 items-center gap-1.5 text-[12px] font-medium ${tgt !== null ? t.text : "text-muted"}`}>
            <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${tgt !== null ? t.dot : "bg-[#c3c8d4]"}`} aria-hidden="true" />
            <span className="truncate">{tgt !== null ? paceText(pace, unit, reached) : "No target set"}</span>
          </span>
          {tgt !== null && (
            <span className="tnum shrink-0 text-[12px] text-muted">
              {pct(achieved / tgt)} of {fmtMetric(tgt, unit)}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3.5">
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white px-[11px] py-[9px]">
              <dt className="text-[11px] text-muted">Projected incl. pending</dt>
              <dd className="tnum mt-0.5 text-[16px] font-semibold text-ink">{fmtMetric(projected, unit)}</dd>
            </div>
            <div className="rounded-xl bg-white px-[11px] py-[9px]">
              <dt className="text-[11px] text-muted">Gap to goal</dt>
              <dd className="tnum mt-0.5 text-[16px] font-semibold text-ink">{tgt !== null ? fmtMetric(gap ?? 0, unit) : "No target"}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <Label>{def.code === "new_clients" ? "First case this year" : "Cases in this period"}</Label>
          </div>
          <div className="mt-0.5">
            {cases.length === 0 ? (
              <p className="border-t border-line py-2.5 text-[13px] text-muted">No cases in this period yet.</p>
            ) : (
              cases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenCase(c)}
                  className="flex w-full items-center justify-between gap-2.5 border-t border-line py-2.5 text-left"
                >
                  <span className="block min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium text-ink">{c.client_name}</span>
                      {c.status === "pending" && (
                        <span className="shrink-0 rounded bg-warn/12 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-warn">Pending</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">
                      {shortDate(effectiveDate(c))} · {productById(c.product_id)?.name}
                    </span>
                  </span>
                  <span className="tnum flex shrink-0 items-center gap-1.5 text-[14px] font-semibold text-body">
                    {caseValue(c, def.code)}
                    <Chevron className="text-[#c3c8d4]" />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Case detail sheet ─────────────────────────

function SheetTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-canvas px-[13px] py-[11px]">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`tnum mt-0.5 text-[16px] font-semibold ${accent ? "text-accent" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function CaseSheet({ c, onDone }: { c: Case; onDone: () => void }) {
  const product = productById(c.product_id);
  const m = metricsForCase(c);
  const pending = c.status === "pending";
  const when = shortDate(effectiveDate(c));
  const footnote = pending
    ? `Submitted ${when}, awaiting Merlin. Counts toward projected, not confirmed. WAPE credit ${sgd(m.wape)}.`
    : `Confirmed ${when}. Counts on its confirmation date. WAPE credit ${sgd(m.wape)}.`;
  return (
    <div className="px-5 pb-[max(30px,env(safe-area-inset-bottom))] pt-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[20px] font-bold tracking-[-.015em] text-ink">{c.client_name}</div>
          <div className="mt-[3px] text-[12px] text-muted">
            {product?.name} · {insurerName(c.product_id)}
          </div>
        </div>
        <span className={`shrink-0 rounded-[5px] px-1.5 py-1 text-[9px] font-bold uppercase tracking-[.05em] ${pending ? "bg-warn/12 text-warn" : "bg-ok/12 text-ok"}`}>
          {pending ? "Pending" : "Confirmed"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] bg-line">
        <SheetTile label="Premium" value={sgd(c.premium_amount)} />
        <SheetTile label="Gross revenue" value={sgd(c.gross_revenue)} />
        <SheetTile label={`Commission at Band ${c.banding_code_at_time.slice(1)}`} value={sgd(m.commission)} accent />
        <SheetTile label="MDRT premium credit" value={sgd(m.mdrt_premium)} />
      </dl>

      <p className="tnum mt-3.5 text-pretty text-[12px] leading-[1.55] text-muted">{footnote}</p>

      <button type="button" onClick={onDone} className="mt-[18px] block w-full rounded-xl bg-accent py-3.5 text-center text-[15px] font-semibold text-white">
        Done
      </button>
    </div>
  );
}

// ───────────────────────── Home ─────────────────────────

export default function Home({
  advisor,
  cases,
  goalSet,
  primary = { kind: "tier" },
  onChangeGoal,
  identityExtra,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  primary?: PrimaryGoal;
  onChangeGoal?: () => void;
  identityExtra?: ReactNode;
}) {
  const mine = casesForAdvisor(advisor.id, cases);
  const year = TODAY.getFullYear();
  const mdrt = mdrtSnapshot(advisor.id, mine, TODAY, goalSet);
  const commissionSnap = metricSnapshot(advisor.id, mine, "commission", TODAY, goalSet);

  // The route defaults to the closer one; a choice is remembered per advisor so a read-only drill-down starts fresh.
  const [routeChoice, setRouteChoice] = useState<{ advisorId: string; metric: MdrtRouteMetric } | null>(null);
  const route: MdrtRouteMetric = routeChoice?.advisorId === advisor.id ? routeChoice.metric : mdrt.closer;
  const setRoute = (metric: MdrtRouteMetric) => setRouteChoice({ advisorId: advisor.id, metric });
  const [expanded, setExpanded] = useState<MetricCode | null>(null);
  const [sheetCase, setSheetCase] = useState<Case | null>(null);
  const closeSheet = useCallback(() => setSheetCase(null), []);

  const views = mdrt.routes.map((r) => routeView(r, primary, mdrt.period, commissionSnap));
  const view = views.find((v) => v.metric === route) ?? views[0];
  const other = views.find((v) => v.metric !== view.metric) ?? views[0];

  // Hero goal: the tier's threshold on this route, or the FC's own commission goal.
  const goalName = primary.kind === "tier" ? `${TIER_LABEL[mdrt.goalTier]} ${MDRT_MEMBERSHIP_YEAR}` : "Your commission goal";
  const subline =
    primary.kind === "tier" ? `Membership year ${MDRT_MEMBERSHIP_YEAR} · ${view.word} route` : `Your own target, ${periodLabel(view.period)} · ${view.word} route`;
  const toConfirm = primary.kind === "tier" && !MDRT_THRESHOLDS_CONFIRMED;
  const goal = view.target !== null && view.target > 0 && view.pace !== null ? { target: view.target, pace: view.pace } : null;
  const achievedFrac = goal ? Math.min(view.achieved / goal.target, 1) : 0;
  const projectedFrac = goal ? Math.min(view.projected / goal.target, 1) : 0;
  const onTrack = goal?.pace.onTrack ?? false;

  // What it takes from here: the average confirmed case on this route this window sets the case count.
  const confirmedInWindow = contributingCases(
    mine.filter((c) => c.status === "confirmed"),
    view.period.start,
    view.period.end,
  );
  const caseValues = confirmedInWindow.map((c) => metricsForCase(c)[view.valueKey]).filter((v) => v > 0);
  const avgCase = caseValues.length > 0 ? caseValues.reduce((a, b) => a + b, 0) / caseValues.length : 0;
  const casesNeeded = goal ? clientsNeeded(view.gap, avgCase) : null;
  const weeksLeft = weeksLeftIn(view.period, TODAY);

  // Pending strip: the pending cases in this window on this route.
  const pendingCases = contributingCases(
    mine.filter((c) => c.status === "pending"),
    view.period.start,
    view.period.end,
  ).filter((c) => metricsForCase(c)[view.valueKey] > 0);
  const pendingValue = Math.max(view.projected - view.achieved, 0);
  const pendingWord = `${pendingCases.length} ${pendingCases.length === 1 ? "case" : "cases"} worth ${sgd(pendingValue)}`;
  const pendingLine = goal
    ? `${pendingWord} would take you to ${pct(view.projected / goal.target)} once Merlin confirms.`
    : `${pendingWord} are waiting on Merlin.`;

  const otherLine =
    other.target !== null && other.target > 0
      ? `${sgd(other.achieved)} · ${pct(other.achieved / other.target)} of ${sgd(other.target)}`
      : `${sgd(other.achieved)} credit · no goal set`;

  // This year: every tracked metric except the two MDRT routes, in the handoff's order.
  const order = (m: MetricDefinition) => {
    const i = TRACKED_ORDER.indexOf(m.code);
    return i === -1 ? TRACKED_ORDER.length : i;
  };
  const tracked = metric_definitions
    .filter((m) => !UNTRACKED_METRICS.has(m.code) && m.code !== "mdrt_commission" && m.code !== "mdrt_premium")
    .sort((a, b) => order(a) - order(b))
    .map((m) => (m.code === "commission" ? commissionSnap : metricSnapshot(advisor.id, mine, m.code, TODAY, goalSet)));
  const firstIds = firstCaseIds(mine);
  const rowCases = (s: MetricSnapshot) => (s.definition.code === "new_clients" ? s.contributing.filter((c) => firstIds.has(c.id)) : s.contributing);

  const untracked = metric_definitions
    .filter((m) => UNTRACKED_METRICS.has(m.code))
    .map((m) => ({ def: m, goal: goalFor(advisor.id, m.code, year, goalSet.targets) }));

  return (
    <div>
      {/* Blue hero: identity, the one goal, the route switch, and the arc. */}
      <section className="overflow-hidden bg-accent px-5 pb-6 pt-[max(6px,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-[9px]">
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-white/16 text-[12px] font-bold" aria-hidden="true">
              {initials(advisor.name)}
            </span>
            <span className="truncate text-[13px] font-semibold">{advisor.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {identityExtra}
            <span className="text-[11px] text-white/72">
              {advisor.fc_code} · Band {advisor.banding_code.slice(1)}
            </span>
          </div>
        </div>

        <div className="mt-[18px] flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[.09em] text-white/72">Your goal</div>
            <div className="mt-[3px] truncate text-[17px] font-bold tracking-[-.01em]">{goalName}</div>
          </div>
          {onChangeGoal && (
            <button
              type="button"
              onClick={onChangeGoal}
              className="relative flex shrink-0 items-center gap-1 rounded-full bg-white/14 px-2.5 py-1.5 text-[11px] font-semibold text-white/85 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
            >
              Change
              <Chevron size={11} strokeWidth={2} />
            </button>
          )}
        </div>

        <div role="radiogroup" aria-label="MDRT route" className="mt-3.5 flex gap-1 rounded-[10px] bg-white/12 p-[3px]">
          {views.map((v) => {
            const on = v.metric === view.metric;
            return (
              <button
                key={v.metric}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRoute(v.metric)}
                className={`relative flex-1 rounded-lg py-[7px] text-center text-[13px] transition-colors before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] ${
                  on ? "bg-white font-bold text-accent" : "font-medium text-white/80"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {goal ? (
          <>
            <div className="mt-3.5 flex items-baseline justify-between gap-2.5">
              <span className="tnum text-[11px] text-white/72">{subline}</span>
              {toConfirm && <span className="shrink-0 text-[11px] text-white/60">to confirm</span>}
            </div>

            <div className="relative mx-auto h-[146px] w-[350px] max-w-full">
              <svg width="350" height="180" viewBox="0 0 350 180" className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2" aria-hidden="true">
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-white/18" />
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-white/45" strokeDasharray={arcDash(projectedFrac)} style={ARC_TRANSITION} />
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-white" strokeDasharray={arcDash(achievedFrac)} style={ARC_TRANSITION} />
              </svg>
              <div className="absolute inset-x-0 top-[56px] text-center">
                <div className="tnum text-[48px] font-extrabold leading-none tracking-[-.03em]">{pct(view.achieved / goal.target)}</div>
                <div className="tnum mt-[7px] text-[13px] text-white/78">
                  {sgd(view.achieved)} of {sgd(goal.target)}
                </div>
              </div>
            </div>

            <div
              className={`relative mt-0.5 flex items-center justify-center gap-[7px] rounded-full border px-3.5 py-[7px] ${
                onTrack ? "border-[rgba(84,212,160,.5)] bg-ok/30" : "border-gold/50 bg-warn/28"
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${onTrack ? "bg-[#54d4a0]" : "bg-gold"}`} aria-hidden="true" />
              <span className="tnum text-[12px] font-semibold text-white">
                {onTrack ? "On pace" : "Behind pace"} · on run rate you finish {sgd(goal.pace.runRateProjection)}
              </span>
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-white/34 px-[18px] py-5 text-center">
            <div className="tnum text-[22px] font-bold tracking-[-.015em]">{sgd(view.achieved)}</div>
            <p className="mt-2 text-pretty text-[13px] leading-[1.5] text-white/80">
              No {view.word} goal set for {year}. Your {view.word} credit so far is tracked, but there is nothing to pace it against.
            </p>
            {onChangeGoal && (
              <button
                type="button"
                onClick={onChangeGoal}
                className="relative mt-3.5 inline-flex items-center gap-[5px] rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-accent before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
              >
                Set a {view.word} goal
                <Chevron size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-3 px-4 pb-5 pt-3.5">
        {goal && goal.pace.requiredPerMonth !== null && (
          <Card>
            <Label>What it takes from here</Label>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="tnum text-[36px] font-bold leading-none tracking-[-.025em] text-accent">{sgd(goal.pace.requiredPerMonth)}</span>
              <span className="text-[15px] font-medium text-muted">/month</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
              <div className="bg-canvas px-[11px] py-[9px]">
                <div className="text-[11px] text-muted">or a week</div>
                <div className="tnum text-[15px] font-semibold text-ink">{sgd(goal.pace.requiredPerWeek ?? 0)}</div>
              </div>
              <div className="bg-canvas px-[11px] py-[9px]">
                <div className="text-[11px] text-muted">at your average case</div>
                <div className="tnum text-[15px] font-semibold text-ink">
                  {casesNeeded === null ? "—" : `${casesNeeded} ${casesNeeded === 1 ? "case" : "cases"}`}
                </div>
              </div>
            </div>
            <p className="tnum mt-2.5 text-[12px] leading-[1.5] text-muted">
              Gap of {sgd(view.gap)} over the {weeksLeft} {weeksLeft === 1 ? "week" : "weeks"} left in {windowWord(view.period)}.
            </p>
          </Card>
        )}

        {pendingCases.length > 0 && pendingValue > 0 && (
          <div className="flex items-center gap-[9px] rounded-xl bg-warn/9 px-[13px] py-[11px]">
            <span className="shrink-0 rounded bg-warn/14 px-[5px] py-[3px] text-[9px] font-bold uppercase tracking-[.06em] text-warn">Pending</span>
            <span className="tnum text-[12px] leading-[1.45] text-gold-ink">{pendingLine}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setRoute(other.metric)}
          className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-line bg-white px-4 py-[13px] text-left"
        >
          <span className="block min-w-0">
            <Label>{other.label} route</Label>
            <span className="tnum mt-1 block text-[13px] text-body">{otherLine}</span>
          </span>
          <Chevron size={15} className="shrink-0 text-[#c3c8d4]" />
        </button>

        <Card className="overflow-hidden p-0">
          <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3">
            <Label>This year</Label>
            <span className="text-[11px] text-muted">tap for the cases</span>
          </div>
          {tracked.map((s) => (
            <MetricRow
              key={s.definition.code}
              snapshot={s}
              cases={rowCases(s)}
              expanded={expanded === s.definition.code}
              onToggle={() => setExpanded((k) => (k === s.definition.code ? null : s.definition.code))}
              onOpenCase={setSheetCase}
            />
          ))}
        </Card>

        {untracked.length > 0 && (
          <Card className="px-4 py-[13px]">
            <div className="flex items-baseline justify-between">
              <Label>Not tracked yet</Label>
              <span className="text-[11px] text-muted">no data source</span>
            </div>
            <div className="tnum mt-[7px] flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
              {untracked.map(({ def, goal: g }) => (
                <span key={def.code}>
                  <span className="font-medium text-body">{def.label}</span>
                  {g && ` · goal ${fmtMetric(g.target_value, def.unit)}`}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Sheet open={sheetCase !== null} onClose={closeSheet} label="Case details" height="auto">
        {sheetCase && <CaseSheet c={sheetCase} onDone={closeSheet} />}
      </Sheet>
    </div>
  );
}
