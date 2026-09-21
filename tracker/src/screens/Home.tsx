import { useCallback, useState, type ReactNode } from "react";
import {
  ELITE_RULES_CONFIRMED,
  elite_tiers,
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
  goalFor,
  mdrtSnapshot,
  metricSnapshot,
  metricsForCase,
  pace as paceToward,
  parseISODate,
  productById,
  ROUTE_WORD,
  UNTRACKED_METRICS,
  weeksLeftIn,
  type GoalSet,
  type MdrtRoute,
  type MdrtRouteMetric,
  type MetricSnapshot,
  type Pace,
  type Period,
  type PrimaryGoal,
  type RouteCredit,
} from "../lib/calc";
import { count, fmtMetric, paceText, pct, periodLabel, routeGateText, sgd, shortDate } from "../lib/format";
import type { DataSource } from "../lib/api";
import { Card, Label } from "../components/ui";
import Sheet from "../components/Sheet";

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };

/** Semicircular progress arc: 350×180 viewBox, 471.2 units long. */
const ARC = 471.2;
const ARC_PATH = "M25 160 A150 150 0 0 1 325 160";

/**
 * The one-line verdict under the arc. Always true to the numbers, never a
 * scolding: when behind, it says what closes the gap rather than "behind".
 */
function verdictFor(pace: Pace, achieved: number): { tone: "ok" | "warn"; text: string } {
  if (pace.gap === 0) return { tone: "ok", text: "Goal reached · the rest is above target" };
  if (pace.onTrack) return { tone: "ok", text: `On pace · at this rate you finish at ${sgd(pace.runRateProjection)}` };
  if (pace.requiredPerMonth === null) return { tone: "warn", text: `Period over · short by ${sgd(pace.gap)}` };
  const runRate = pace.elapsedMonths > 0 ? achieved / pace.elapsedMonths : 0;
  const lead = pace.requiredPerMonth <= runRate * 2 ? "Nearly on pace" : "Still in play";
  return { tone: "warn", text: `${lead} · ${sgd(pace.requiredPerMonth)} a month gets you there` };
}
const ARC_TRANSITION = { transition: "stroke-dasharray .55s cubic-bezier(.22,1,.36,1)" } as const;
const arcDash = (frac: number) => `${(ARC * frac).toFixed(1)} ${ARC}`;

/** The order the "This year" rows appear in. */
const TRACKED_ORDER: MetricCode[] = ["commission", "premium", "elite"];

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

function isCalendarYear(p: Period): boolean {
  return p.start.getMonth() === 0 && p.start.getDate() === 1 && p.end.getMonth() === 11 && p.end.getDate() === 31 && p.start.getFullYear() === p.end.getFullYear();
}

/** "2026" for a calendar year, otherwise the window ("Q3 2026"). */
function windowWord(p: Period): string {
  return isCalendarYear(p) ? String(p.end.getFullYear()) : periodLabel(p);
}

/** "31 Aug 2026" from an ISO date. */
function longDay(iso: string): string {
  const d = parseISODate(iso);
  return `${shortDate(d)} ${d.getFullYear()}`;
}

/** The line at the foot of the page saying where the figures came from. */
function sourceNote(source: DataSource): { text: string; tone: "muted" | "warn" } {
  switch (source.kind) {
    case "sample":
      return { text: "Sample import, January to August 2026. Nothing here is real.", tone: "muted" };
    case "server":
      return { text: source.as_of ? `Your production as of ${longDay(source.as_of)}.` : "Your production, from the server.", tone: "muted" };
    case "error":
      return { text: `${source.message} Showing the sample instead.`, tone: "warn" };
  }
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
  /** The route's credit as MDRT splits it (the Risk-Protection floor); null when the FC's own commission goal is shown, which has no such rule. */
  credit: RouteCredit | null;
}

function routeView(r: MdrtRoute, primary: PrimaryGoal, mdrtPeriod: Period, commission: MetricSnapshot): RouteView {
  const word: RouteWord = ROUTE_WORD[r.metric];
  const base = { metric: r.metric, label: r.label, word };
  if (primary.kind === "tier") {
    return { ...base, period: mdrtPeriod, achieved: r.achieved, projected: r.projected, target: r.goalThreshold, gap: r.pace.gap, pace: r.pace, credit: r.credit };
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
      credit: null,
    };
  }
  // No custom premium target exists: the credit is tracked but there is nothing to pace it against.
  return { ...base, period: mdrtPeriod, achieved: r.achieved, projected: r.projected, target: null, gap: 0, pace: null, credit: r.credit };
}

// ───────────────────────── This year rows ─────────────────────────

function MetricRow({
  snapshot,
  entries,
  expanded,
  onToggle,
  onOpenEntry,
}: {
  snapshot: MetricSnapshot;
  /** The imported months listed when expanded. */
  entries: Case[];
  expanded: boolean;
  onToggle: () => void;
  onOpenEntry: (c: Case) => void;
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
            <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${tgt !== null ? t.dot : "bg-hairline"}`} aria-hidden="true" />
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
            <div className="rounded-xl bg-surface px-[11px] py-[9px]">
              <dt className="text-[11px] text-muted">Projected incl. pending</dt>
              <dd className="tnum mt-0.5 text-[16px] font-semibold text-ink">{fmtMetric(projected, unit)}</dd>
            </div>
            <div className="rounded-xl bg-surface px-[11px] py-[9px]">
              <dt className="text-[11px] text-muted">Gap to goal</dt>
              <dd className="tnum mt-0.5 text-[16px] font-semibold text-ink">{tgt !== null ? fmtMetric(gap ?? 0, unit) : "No target"}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <Label>Month by month</Label>
          </div>
          <div className="mt-0.5">
            {entries.length === 0 ? (
              <p className="border-t border-line py-2.5 text-[13px] text-muted">Nothing imported for this period yet.</p>
            ) : (
              entries.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenEntry(c)}
                  className="flex w-full items-center justify-between gap-2.5 border-t border-line py-2.5 text-left"
                >
                  <span className="block min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-medium text-ink">{c.label ?? c.client_name}</span>
                      {c.status === "pending" && (
                        <span className="shrink-0 rounded bg-warn/12 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-warn">Pending</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">{productById(c.product_id)?.name}</span>
                  </span>
                  <span className="tnum flex shrink-0 items-center gap-1.5 text-[14px] font-semibold text-body">
                    {fmtMetric(metricsForCase(c)[def.code], unit)}
                    <Chevron className="text-hairline" />
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

// ───────────────────────── Month detail sheet ─────────────────────────

function SheetTile({ label, value, accent = false, wide = false }: { label: string; value: string; accent?: boolean; wide?: boolean }) {
  return (
    <div className={`bg-canvas px-[13px] py-[11px] ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`tnum mt-0.5 text-[16px] font-semibold ${accent ? "text-accent" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

/** One imported month (or the pending entry): its figures as the import gave them. */
function CaseSheet({ c, onDone }: { c: Case; onDone: () => void }) {
  const m = metricsForCase(c);
  const pending = c.status === "pending";
  return (
    <div className="px-5 pb-[max(30px,env(safe-area-inset-bottom))] pt-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[20px] font-bold tracking-[-.015em] text-ink">{c.label ?? c.client_name}</div>
          <div className="mt-[3px] text-[12px] text-muted">
            {c.client_name} · {productById(c.product_id)?.name}
          </div>
        </div>
        <span className={`shrink-0 rounded-[5px] px-1.5 py-1 text-[9px] font-bold uppercase tracking-[.05em] ${pending ? "bg-warn/12 text-warn" : "bg-ok/12 text-ok"}`}>
          {pending ? "Pending" : "Confirmed"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[14px] bg-line">
        <SheetTile label="Commission" value={sgd(m.commission)} accent />
        <SheetTile label="Premium" value={sgd(m.premium)} />
        <SheetTile label="MDRT premium credit" value={sgd(m.mdrt_premium)} />
        <SheetTile label="MDRT commission credit" value={sgd(m.mdrt_commission)} />
        <SheetTile label="Elite credits" value={count(m.elite)} wide />
      </dl>

      <p className="tnum mt-3.5 text-pretty text-[12px] leading-[1.55] text-muted">From the monthly import. Figures are year-to-date differences month on month.</p>

      <button type="button" onClick={onDone} className="btn-primary mt-[18px] block w-full rounded-xl py-3.5 text-center text-[15px] font-semibold text-white">
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
  source,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  primary?: PrimaryGoal;
  onChangeGoal?: () => void;
  identityExtra?: ReactNode;
  /** Where the rows came from; absent in the manager's read-only drill-down. */
  source?: DataSource;
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
  const others = views.filter((v) => v.metric !== view.metric);

  // Hero goal: the tier's threshold on this route, or the FC's own commission goal.
  const goalName = primary.kind === "tier" ? `${TIER_LABEL[mdrt.goalTier]} ${MDRT_MEMBERSHIP_YEAR}` : "Your commission goal";
  const subline =
    primary.kind === "tier" ? `Membership year ${MDRT_MEMBERSHIP_YEAR} · ${view.word} route` : `Your own target, ${periodLabel(view.period)} · ${view.word} route`;
  const toConfirm = primary.kind === "tier" && !MDRT_THRESHOLDS_CONFIRMED;
  const goal = view.target !== null && view.target > 0 && view.pace !== null ? { target: view.target, pace: view.pace } : null;
  const achievedFrac = goal ? Math.min(view.achieved / goal.target, 1) : 0;
  const projectedFrac = goal ? Math.min(view.projected / goal.target, 1) : 0;
  const verdict = goal ? verdictFor(goal.pace, view.achieved) : { tone: "warn" as const, text: "" };
  // MDRT's minimums inside the route, when one is not met yet.
  const gate = view.credit ? routeGateText(view.credit) : null;

  // What it takes from here: the gap spread over what is left of the window, and where the current rate lands.
  const weeksLeft = weeksLeftIn(view.period, TODAY);
  const landingWord = isCalendarYear(view.period) ? "by year end" : `by end of ${periodLabel(view.period)}`;

  // Pending strip: the latest month's figures the insurer has not confirmed yet, on this route.
  const pendingValue = Math.max(view.projected - view.achieved, 0);
  const pendingLine = goal
    ? `${sgd(pendingValue)} pending would take you to ${pct(view.projected / goal.target)} once the insurer confirms.`
    : `${sgd(pendingValue)} is waiting on the insurer.`;

  // Finexis Elite: the in-house scheme, tracked apart from MDRT. The next rung is the first the credits have not reached.
  const elite = metricSnapshot(advisor.id, mine, "elite", TODAY, goalSet);
  const eliteGoal = goalFor(advisor.id, "elite", year, goalSet.targets);
  const rung = elite_tiers.find((t) => t.credits > elite.achieved) ?? null;
  const rungReached = [...elite_tiers].reverse().find((t) => elite.achieved >= t.credits) ?? null;
  const rungPace = rung ? paceToward(elite.achieved, rung.credits, elite.period.start, elite.period.end, TODAY) : null;
  const rungFill = rung ? Math.min(elite.achieved / rung.credits, 1) : 1;
  const rungTone: Tone = !rung ? "ok" : rungPace && !rungPace.onTrack ? "warn" : "accent";

  const routeLine = (v: RouteView) =>
    v.target !== null && v.target > 0 ? `${sgd(v.achieved)} · ${pct(v.achieved / v.target)} of ${sgd(v.target)}` : `${sgd(v.achieved)} credit · no goal set`;

  // This year: every tracked metric except the MDRT routes, in the handoff's order.
  const order = (m: MetricDefinition) => {
    const i = TRACKED_ORDER.indexOf(m.code);
    return i === -1 ? TRACKED_ORDER.length : i;
  };
  const tracked = metric_definitions
    .filter((m) => !UNTRACKED_METRICS.has(m.code) && m.code !== "mdrt_commission" && m.code !== "mdrt_premium")
    .sort((a, b) => order(a) - order(b))
    .map((m) => (m.code === "commission" ? commissionSnap : m.code === "elite" ? elite : metricSnapshot(advisor.id, mine, m.code, TODAY, goalSet)));
  // The months a row lists: every headline (Risk-Protection) entry, plus an Other Products entry only when it adds to the metric.
  const rowEntries = (s: MetricSnapshot) =>
    s.contributing.filter((c) => productById(c.product_id)?.mdrt_category !== "other" || metricsForCase(c)[s.definition.code] !== 0);

  const untracked = metric_definitions
    .filter((m) => UNTRACKED_METRICS.has(m.code))
    .map((m) => ({ def: m, goal: goalFor(advisor.id, m.code, year, goalSet.targets) }));

  const note = source ? sourceNote(source) : null;

  return (
    <div>
      {/* Blue hero: identity, the one goal, the route switch, and the arc. */}
      <section className="overflow-hidden bg-brand px-5 pb-6 pt-[max(6px,env(safe-area-inset-top))] text-white">
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
              className="relative flex shrink-0 items-center gap-1 rounded-full bg-white/14 px-2.5 py-1.5 text-[11px] font-semibold text-white/85 hover:bg-white/24 hover:text-white before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']"
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
                  on ? "bg-white font-bold text-brand" : "font-medium text-white/80"
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

            <div className="relative mx-auto mt-3 h-[170px] w-[350px] max-w-full">
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
              className={`relative mt-2 flex items-center justify-center gap-[7px] rounded-full border px-3.5 py-[7px] ${
                verdict.tone === "ok" ? "border-[rgba(84,212,160,.5)] bg-ok/30" : "border-gold/50 bg-warn/28"
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${verdict.tone === "ok" ? "bg-[#54d4a0]" : "bg-gold"}`} aria-hidden="true" />
              <span className="tnum text-[12px] font-semibold text-white">{verdict.text}</span>
            </div>
            {gate && <p className="tnum mt-2.5 text-pretty text-center text-[11px] leading-[1.5] text-white/78">{gate}</p>}
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
                className="relative mt-3.5 inline-flex items-center gap-[5px] rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-brand before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:bg-[#e8edf9]"
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
                <div className="text-[11px] text-muted">at your current rate</div>
                <div className="tnum text-[15px] font-semibold text-ink">{sgd(goal.pace.runRateProjection)}</div>
                <div className="text-[11px] text-muted">{landingWord}</div>
              </div>
            </div>
            <p className="tnum mt-2.5 text-[12px] leading-[1.5] text-muted">
              Gap of {sgd(view.gap)} over the {weeksLeft} {weeksLeft === 1 ? "week" : "weeks"} left in {windowWord(view.period)}.
            </p>
          </Card>
        )}

        {pendingValue > 0 && (
          <div className="flex items-center gap-[9px] rounded-xl bg-warn/9 px-[13px] py-[11px]">
            <span className="shrink-0 rounded bg-warn/14 px-[5px] py-[3px] text-[9px] font-bold uppercase tracking-[.06em] text-warn">Pending</span>
            <span className="tnum text-[12px] leading-[1.45] text-gold-ink">{pendingLine}</span>
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between gap-2">
            <Label>Finexis Elite</Label>
            {!ELITE_RULES_CONFIRMED && (
              <span className="rounded bg-canvas px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-muted">placeholder rules</span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tnum text-[36px] font-bold leading-none tracking-[-.025em] text-accent">{count(elite.achieved)}</span>
            <span className="text-[15px] font-medium text-muted">credits this year</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2.5">
            <span className="flex min-w-0 items-center gap-[7px]">
              <span className="truncate text-[13px] font-semibold text-ink">{rung ? `Next rung · ${rung.name}` : "Every rung reached"}</span>
              {rungReached && <span className="shrink-0 rounded bg-brand px-1 py-px text-[9px] font-semibold text-white">{rungReached.name}</span>}
            </span>
            {rung && (
              <span className="tnum shrink-0 text-[12px] text-muted">
                {count(elite.achieved)} of {count(rung.credits)}
              </span>
            )}
          </div>
          <div className="mt-[9px] flex h-[5px] overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
            <span className={`${TONE[rungTone].fill} transition-[width] duration-[450ms]`} style={{ width: `${rungFill * 100}%` }} />
          </div>
          {rung && (
            <div className={`tnum mt-2 flex items-center gap-1.5 text-[12px] font-medium ${TONE[rungTone].text}`}>
              <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${TONE[rungTone].dot}`} aria-hidden="true" />
              <span className="truncate">{paceText(rungPace, "count", false)}</span>
            </div>
          )}
          {eliteGoal && eliteGoal.target_value > 0 && (
            <p className="tnum mt-2 text-[12px] text-muted">
              Your own target: {count(eliteGoal.target_value)} credits · {pct(elite.achieved / eliteGoal.target_value)} there
            </p>
          )}
          <p className="mt-2.5 text-pretty text-[11px] leading-[1.5] text-muted">
            Tracked apart from MDRT. Credits come from the monthly import; the rungs are placeholders until the scheme's rules arrive.
          </p>
        </Card>

        <Card className="divide-y divide-line overflow-hidden p-0">
          {others.map((o) => (
            <button
              key={o.metric}
              type="button"
              onClick={() => setRoute(o.metric)}
              className="flex w-full items-center justify-between gap-2.5 px-4 py-[13px] text-left hover:bg-canvas"
            >
              <span className="block min-w-0">
                <Label>{o.label} route</Label>
                <span className="tnum mt-1 block text-[13px] text-body">{routeLine(o)}</span>
              </span>
              <Chevron size={15} className="shrink-0 text-hairline" />
            </button>
          ))}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3">
            <Label>This year</Label>
            <span className="text-[11px] text-muted">tap for the months</span>
          </div>
          {tracked.map((s) => (
            <MetricRow
              key={s.definition.code}
              snapshot={s}
              entries={rowEntries(s)}
              expanded={expanded === s.definition.code}
              onToggle={() => setExpanded((k) => (k === s.definition.code ? null : s.definition.code))}
              onOpenEntry={setSheetCase}
            />
          ))}
        </Card>

        {untracked.length > 0 && (
          <Card className="px-4 py-[13px]">
            <div className="flex items-baseline justify-between">
              <Label>Not tracked yet</Label>
              <span className="text-[11px] text-muted">not in the monthly import yet</span>
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

      {note && <p className={`tnum px-5 pb-5 text-center text-[11px] leading-[1.5] ${note.tone === "warn" ? "text-warn" : "text-muted"}`}>{note.text}</p>}

      <Sheet open={sheetCase !== null} onClose={closeSheet} label="Month details" height="auto">
        {sheetCase && <CaseSheet c={sheetCase} onDone={closeSheet} />}
      </Sheet>
    </div>
  );
}
