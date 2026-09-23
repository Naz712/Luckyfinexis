import { useState, type ReactNode } from "react";
import { MDRT_MEMBERSHIP_YEAR, MDRT_THRESHOLDS_CONFIRMED, metric_definitions, TODAY, type Advisor, type Case, type MetricCode, type MetricUnit, type Tier } from "../mock/data";
import { ELITE, elitePeriodText, eliteTiersFor, isNewFc, type EliteTier } from "../lib/elite";
import { elitePeriod, soloAim } from "../lib/aims";
import {
  casesForAdvisor,
  mdrtSnapshot,
  metricSnapshot,
  metricsForCase,
  pace as paceToward,
  parseISODate,
  ROUTE_WORD,
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
import BarChart, { type BarPoint } from "../components/BarChart";
import Page from "../components/Page";

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };

/** Semicircular progress arc: 350×180 viewBox, 471.2 units long. */
const ARC = 471.2;
const ARC_PATH = "M25 160 A150 150 0 0 1 325 160";

/**
 * The one-line verdict under the arc. Always true to the numbers, never a
 * scolding: when behind, it says what closes the gap rather than "behind".
 */
function verdictFor(pace: Pace, achieved: number, unit: MetricUnit, notStarted: boolean, startsOn: Date): { tone: "ok" | "warn"; text: string } {
  const fmt = (v: number) => fmtMetric(v, unit);
  if (pace.gap === 0) return { tone: "ok", text: "Goal reached · the rest is above target" };
  if (notStarted && pace.requiredPerMonth !== null) return { tone: "warn", text: `Starts ${shortDate(startsOn)} · ${fmt(pace.requiredPerMonth)} a month gets you there` };
  if (pace.onTrack) return { tone: "ok", text: `On pace · at this rate you finish at ${fmt(pace.runRateProjection)}` };
  if (pace.requiredPerMonth === null) return { tone: "warn", text: `Period over · short by ${fmt(pace.gap)}` };
  const runRate = pace.elapsedMonths > 0 ? achieved / pace.elapsedMonths : 0;
  const lead = pace.requiredPerMonth <= runRate * 2 ? "Nearly on pace" : "Still in play";
  return { tone: "warn", text: `${lead} · ${fmt(pace.requiredPerMonth)} a month gets you there` };
}
const ARC_TRANSITION = { transition: "stroke-dasharray .55s cubic-bezier(.22,1,.36,1)" } as const;
const arcDash = (frac: number) => `${(ARC * frac).toFixed(1)} ${ARC}`;

/** The "This year" rows, in order. WAPE is a Custom goal only, not a Home row. */
const TRACKED_ORDER: MetricCode[] = ["commission", "gross_revenue", "premium", "elite"];

/** What each figure is, in a sentence, at the top of its page. */
const METRIC_ABOUT: Partial<Record<MetricCode, string>> = {
  commission: "Your first-year commission: your share of the gross revenue on your cases, by the firm's payout formula.",
  gross_revenue: "First-year gross revenue: what the insurers paid Finexis on your cases. Your commission is a share of it, and Elite credits are counted on it.",
  premium: "First-year premium on your cases, single premiums in full.",
  elite: "Finexis Elite credits: first-year gross revenue times each product's Elite multiplier. Insurer cash incentives don't count.",
};

type Tone = "ok" | "accent" | "warn";
const TONE: Record<Tone, { text: string; dot: string; fill: string; soft: string }> = {
  ok: { text: "text-ok", dot: "bg-ok", fill: "bg-ok", soft: "bg-ok/35" },
  accent: { text: "text-accent", dot: "bg-accent", fill: "bg-accent", soft: "bg-accent/35" },
  warn: { text: "text-warn", dot: "bg-warn", fill: "bg-warn", soft: "bg-warn/35" },
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

// ───────────────────────── The hero's view of the aim ─────────────────────────

type RouteWord = "commission" | "premium";

/** One MDRT route as the hero shows it: its window, totals and the tier's threshold to pace against. */
interface RouteView {
  metric: MdrtRouteMetric;
  label: string;
  word: RouteWord;
  period: Period;
  achieved: number;
  projected: number;
  target: number;
  pace: Pace;
  /** The route's credit as MDRT splits it (the Risk-Protection floor). */
  credit: RouteCredit;
}

function routeView(r: MdrtRoute, period: Period): RouteView {
  return { metric: r.metric, label: r.label, word: ROUTE_WORD[r.metric], period, achieved: r.achieved, projected: r.projected, target: r.goalThreshold, pace: r.pace, credit: r.credit };
}

/** Whatever the hero shows, for any aim: MDRT on a route, or a single figure (Final Sprint, Elite, a custom goal). */
interface HeroView {
  title: string;
  subline: string;
  unit: MetricUnit;
  /** "commission", "gross revenue", "Elite credits": what the figures are, in a sentence. */
  word: string;
  period: Period;
  achieved: number;
  projected: number;
  target: number | null;
  pace: Pace | null;
  gap: number;
  /** MDRT's minimums inside a route, when one is not met yet. */
  gate: string | null;
  notStarted: boolean;
  /** A figure the import doesn't carry (WAPE without its column). */
  missing: boolean;
}

// ───────────────────────── Finexis Elite: every tier and how far ─────────────────────────

/** A track to the top tier with a mark at each, then one line per tier: reached, or what is left and the monthly pace to get there. */
function EliteLadder({ achieved, tiers, period }: { achieved: number; tiers: EliteTier[]; period: Period }) {
  const top = tiers[tiers.length - 1]?.credits ?? 1;
  const next = tiers.find((t) => t.credits > achieved) ?? null;
  return (
    <div>
      <div className="relative mt-3 h-2.5 rounded-full bg-accent-soft" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-[600ms]" style={{ width: `${Math.min(achieved / top, 1) * 100}%` }} />
        {tiers.map((t) => (
          <span
            key={t.code}
            className={`absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${achieved >= t.credits ? "bg-ok" : "bg-ink/45"}`}
            style={{ left: `${Math.min(t.credits / top, 1) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 divide-y divide-line" aria-label="Elite tiers">
        {tiers.map((t) => {
          const reached = achieved >= t.credits;
          const p = reached ? null : paceToward(achieved, t.credits, period.start, period.end, TODAY);
          const isNext = t === next;
          return (
            <li key={t.code} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${reached ? "bg-ok text-white" : isNext ? "bg-accent text-white" : "bg-well text-muted"}`}
                  aria-hidden="true"
                >
                  {reached ? (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-[13px] font-semibold ${isNext ? "text-ink" : "text-body"}`}>{t.name}</span>
                  <span className="tnum block truncate text-[11px] text-muted">
                    {count(t.credits)} credits{t.perk ? ` · ${t.perk}` : ""}
                  </span>
                </span>
              </span>
              <span className="tnum shrink-0 text-right">
                <span className={`block text-[13px] font-bold ${reached ? "text-ok" : isNext ? "text-accent" : "text-body"}`}>{reached ? "Reached" : `${count(t.credits - achieved)} to go`}</span>
                {p && p.requiredPerMonth !== null && <span className="block text-[11px] text-muted">{count(p.requiredPerMonth)}/month</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────────────────────── This year rows ─────────────────────────

function MetricRow({ snapshot, onOpen }: { snapshot: MetricSnapshot; onOpen: () => void }) {
  const { definition: def, achieved, projected, target, gap, pace, period } = snapshot;
  const unit = def.unit;
  const tgt = target !== null && target > 0 ? target : null;
  const reached = tgt !== null && (gap ?? 0) === 0;
  const tone: Tone = reached ? "ok" : pace && !pace.onTrack ? "warn" : "accent";
  const t = TONE[tone];
  const fill = tgt !== null ? Math.min(achieved / tgt, 1) : 0;
  const pendingFill = tgt !== null ? Math.min(Math.max(projected - achieved, 0) / tgt, 1 - fill) : 0;

  return (
    <button type="button" onClick={onOpen} className="block w-full border-t border-line px-4 pb-[13px] pt-3 text-left hover:bg-canvas/60">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-[7px]">
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{def.label}</span>
          <span className="min-w-0 truncate text-[10px] text-muted">{periodLabel(period)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-[7px]">
          <span className="tnum text-[16px] font-bold text-ink">{fmtMetric(achieved, unit)}</span>
          <Chevron className="text-faint" />
        </div>
      </div>
      {tgt !== null && (
        <>
          <div className="mt-[9px] flex h-[5px] overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
            <span className={`${t.fill} transition-[width] duration-[450ms]`} style={{ width: `${fill * 100}%` }} />
            <span className={`${t.soft} transition-[width] duration-[450ms]`} style={{ width: `${pendingFill * 100}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2.5">
            <span className={`tnum flex min-w-0 items-center gap-1.5 text-[12px] font-medium ${t.text}`}>
              <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
              <span className="truncate">{paceText(pace, unit, reached)}</span>
            </span>
            <span className="tnum shrink-0 text-[12px] text-muted">
              {pct(achieved / tgt)} of {fmtMetric(tgt, unit)}
            </span>
          </div>
        </>
      )}
    </button>
  );
}

// ───────────────────────── A figure's own page ─────────────────────────

interface MonthFigures {
  key: string;
  label: string;
  date: Date;
  pending: boolean;
  values: Record<MetricCode, number>;
}

/** The imported months inside a window (newest first), each with every figure summed over its entries; a pending entry is its own row. */
function monthsIn(cases: Case[], period: Period): MonthFigures[] {
  const byKey = new Map<string, MonthFigures>();
  for (const c of cases) {
    const on = parseISODate(c.confirmed_on ?? c.submitted_on);
    if (on < period.start || on > period.end) continue;
    const pending = c.status === "pending";
    const key = `${c.label ?? c.client_name}${pending ? "·p" : ""}`;
    const m = metricsForCase(c);
    const cur = byKey.get(key) ?? { key, label: c.label ?? c.client_name, date: on, pending, values: { commission: 0, gross_revenue: 0, premium: 0, mdrt_commission: 0, mdrt_premium: 0, elite: 0, wape: 0 } };
    for (const code of Object.keys(cur.values) as MetricCode[]) cur.values[code] += m[code] ?? 0;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => (a.pending !== b.pending ? (a.pending ? -1 : 1) : b.date.getTime() - a.date.getTime()));
}

function Tile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-canvas px-[11px] py-[9px]">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`tnum mt-0.5 text-[15px] font-semibold ${accent ? "text-accent" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

/** Everything about one of the "This year" figures: where it stands, a chart of the months, and each month's full figures. */
function MetricDetail({ snapshot, cases, advisor }: { snapshot: MetricSnapshot; cases: Case[]; advisor: Advisor }) {
  const { definition: def, achieved, projected, target, gap, pace, period } = snapshot;
  const unit = def.unit;
  const fmt = (v: number) => fmtMetric(v, unit);
  // A pending row only when it adds to this figure (pending cases carry no Elite credits, for one).
  const months = monthsIn(cases, period).filter((m) => !m.pending || m.values[def.code] !== 0);
  const confirmedMonths = months.filter((m) => !m.pending).reverse();
  const [selected, setSelected] = useState(Math.max(confirmedMonths.length - 1, 0));
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const pending = Math.max(projected - achieved, 0);
  const reached = target !== null && (gap ?? 0) === 0;
  const tiers = eliteTiersFor(advisor);
  const points: BarPoint[] = confirmedMonths.map((m) => ({
    label: MONTH_SHORT[m.date.getMonth()]!,
    longLabel: `${MONTH_LONG[m.date.getMonth()]} ${m.date.getFullYear()}`,
    value: m.values[def.code],
    detail: m.label,
  }));
  const estimated = def.code === "gross_revenue" && cases.some((c) => c.gr_estimated);

  return (
    <div className="flex flex-col gap-3 px-4 pb-10 pt-3.5">
      <Card>
        <div className="flex items-baseline gap-2">
          <span className="tnum text-[40px] font-bold leading-none tracking-[-.03em] text-accent">{fmt(achieved)}</span>
          <span className="text-[13px] text-muted">confirmed</span>
        </div>
        {pending > 0 && <p className="tnum mt-2 text-[12px] font-medium text-gold-ink">+{fmt(pending)} pending, waiting on the insurer</p>}
        <p className="mt-2.5 text-pretty text-[12px] leading-[1.5] text-muted">
          {METRIC_ABOUT[def.code]}
          {estimated ? " Worked out from your commission at your band until the monthly import carries it." : ""}
        </p>
        {target !== null && target > 0 && def.code !== "elite" && (
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] font-semibold text-ink">Your goal · {periodLabel(period)}</span>
              <span className="tnum text-[12.5px] font-bold text-ink">{fmt(target)}</span>
            </div>
            <div className="mt-2 flex h-[6px] overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
              <span className={reached ? "bg-ok" : "bg-accent"} style={{ width: `${Math.min(achieved / target, 1) * 100}%` }} />
              <span className="bg-accent/35" style={{ width: `${Math.min(pending / target, Math.max(1 - achieved / target, 0)) * 100}%` }} />
            </div>
            <dl className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
              <Tile label="Projected incl. pending" value={fmt(projected)} />
              <Tile label={reached ? "Goal reached" : "Gap to goal"} value={reached ? pct(achieved / target) : fmt(gap ?? 0)} accent={!reached} />
            </dl>
            <p className={`tnum mt-2 text-[12px] font-medium ${reached ? "text-ok" : pace?.onTrack ? "text-accent" : "text-warn"}`}>{paceText(pace, unit, reached)}</p>
          </div>
        )}
      </Card>

      {def.code === "elite" && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <Label>Distance to each tier</Label>
            {isNewFc(advisor) && <span className="rounded bg-accent-soft px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-accent">new FC tiers</span>}
          </div>
          <EliteLadder achieved={achieved} tiers={tiers} period={elitePeriod()} />
          <p className="mt-1 text-[11px] leading-[1.5] text-muted">
            {ELITE.name}, {elitePeriodText()}.{ELITE.tiers_confirmed ? "" : " Sample tiers."}
          </p>
        </Card>
      )}

      {points.length > 0 && (
        <Card>
          <Label>Month by month</Label>
          <div className="mt-2">
            <BarChart points={points} selected={Math.min(selected, points.length - 1)} onSelect={setSelected} formatValue={fmt} formatTick={(v) => (unit === "sgd" ? `${Math.round(v / 1000)}k` : count(v))} title={`${def.label} by month`} />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3">
          <Label>Each month</Label>
          <span className="text-[11px] text-muted">tap for all its figures</span>
        </div>
        {months.length === 0 ? (
          <p className="border-t border-line px-4 py-3 text-[13px] text-muted">Nothing imported for this period yet.</p>
        ) : (
          months.map((m) => {
            const open = openMonth === m.key;
            return (
              <div key={m.key} className={`border-t border-line ${open ? "bg-accent-soft/45" : ""}`}>
                <button type="button" onClick={() => setOpenMonth(open ? null : m.key)} aria-expanded={open} className="flex w-full items-center justify-between gap-2.5 px-4 py-3 text-left">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-ink">{m.label}</span>
                    {m.pending && <span className="shrink-0 rounded bg-warn/12 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-warn">Pending</span>}
                  </span>
                  <span className="tnum flex shrink-0 items-center gap-1.5 text-[14px] font-semibold text-body">
                    {fmt(m.values[def.code])}
                    <span className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                      <Caret />
                    </span>
                  </span>
                </button>
                {open && (
                  <dl className="drop-in mx-4 mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
                    <Tile label="Commission" value={sgd(m.values.commission)} accent={def.code === "commission"} />
                    <Tile label="Gross revenue" value={sgd(m.values.gross_revenue)} accent={def.code === "gross_revenue"} />
                    <Tile label="Premium" value={sgd(m.values.premium)} accent={def.code === "premium"} />
                    <Tile label="Elite credits" value={count(m.values.elite)} accent={def.code === "elite"} />
                    <Tile label="MDRT commission credit" value={sgd(m.values.mdrt_commission)} />
                    <Tile label="MDRT premium credit" value={sgd(m.values.mdrt_premium)} />
                  </dl>
                )}
              </div>
            )
          })
        )}
      </Card>
      <p className="px-1 text-center text-[11px] leading-[1.5] text-muted">From the monthly import: each month is the year-to-date change from the month before.</p>
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
  const mdrt = mdrtSnapshot(advisor.id, mine, TODAY, goalSet);

  // The route defaults to the closer one; a choice is remembered per advisor so a read-only drill-down starts fresh.
  const [routeChoice, setRouteChoice] = useState<{ advisorId: string; metric: MdrtRouteMetric } | null>(null);
  const route: MdrtRouteMetric = routeChoice?.advisorId === advisor.id ? routeChoice.metric : mdrt.closer;
  const setRoute = (metric: MdrtRouteMetric) => setRouteChoice({ advisorId: advisor.id, metric });
  const [openMetric, setOpenMetric] = useState<MetricCode | null>(null);

  const views = mdrt.routes.map((r) => routeView(r, mdrt.period));
  const rv = views.find((v) => v.metric === route) ?? views[0]!;
  const others = views.filter((v) => v.metric !== rv.metric);

  // The hero: MDRT on the chosen route, or the single figure of a Final Sprint, Elite or custom aim.
  let hero: HeroView;
  if (primary.kind === "tier") {
    hero = {
      title: `${TIER_LABEL[mdrt.goalTier]} ${MDRT_MEMBERSHIP_YEAR}`,
      subline: `Membership year ${MDRT_MEMBERSHIP_YEAR} · ${rv.word} route`,
      unit: "sgd",
      word: rv.word,
      period: rv.period,
      achieved: rv.achieved,
      projected: rv.projected,
      target: rv.target,
      pace: rv.pace,
      gap: rv.pace.gap,
      gate: routeGateText(rv.credit),
      notStarted: false,
      missing: false,
    };
  } else {
    const aim = soloAim(advisor, mine, goalSet, primary, TODAY);
    const def = metric_definitions.find((m) => m.code === aim.metric)!;
    hero = {
      title: aim.name,
      subline: `${periodLabel(aim.period)} · ${aim.kind === "elite" ? "Elite credits" : def.code === "wape" ? "WAPE" : def.label.toLowerCase()}${aim.notStarted ? ` · starts ${shortDate(aim.period.start)}` : ""}`,
      unit: aim.unit,
      word: aim.kind === "elite" ? "Elite credits" : def.code === "wape" ? "WAPE" : def.label.toLowerCase(),
      period: aim.period,
      achieved: aim.achieved,
      projected: aim.projected,
      target: aim.target,
      pace: aim.pace,
      gap: aim.gap,
      gate: aim.inImport ? null : aim.blurb,
      notStarted: aim.notStarted,
      missing: !aim.inImport,
    };
  }
  const fmt = (v: number) => fmtMetric(v, hero.unit);
  const toConfirm = primary.kind === "tier" && !MDRT_THRESHOLDS_CONFIRMED;
  const goal = hero.target !== null && hero.target > 0 && hero.pace !== null ? { target: hero.target, pace: hero.pace } : null;
  const achievedFrac = goal ? Math.min(hero.achieved / goal.target, 1) : 0;
  const projectedFrac = goal ? Math.min(hero.projected / goal.target, 1) : 0;
  const verdict = goal ? verdictFor(goal.pace, hero.achieved, hero.unit, hero.notStarted, hero.period.start) : { tone: "warn" as const, text: "" };

  // What it takes from here: the gap spread over what is left of the window, and where the current rate lands.
  const weeksLeft = weeksLeftIn(hero.period, TODAY);
  const landingWord = `by ${shortDate(hero.period.end)}`;

  // Pending strip: the latest month's figures the insurer has not confirmed yet.
  const pendingValue = Math.max(hero.projected - hero.achieved, 0);
  const pendingLine = goal
    ? `${fmt(pendingValue)} pending would take you to ${pct(hero.projected / goal.target)} once the insurer confirms.`
    : `${fmt(pendingValue)} is waiting on the insurer.`;

  // Finexis Elite: the in-house scheme, tracked apart from MDRT, with the distance to every tier.
  const elite = metricSnapshot(advisor.id, mine, "elite", TODAY, goalSet);
  const eliteTiers = eliteTiersFor(advisor);
  const newFc = isNewFc(advisor);

  // This year: commission, gross revenue, premium and Elite credits; each opens its own page.
  const tracked = TRACKED_ORDER.map((code) => (code === "elite" ? elite : metricSnapshot(advisor.id, mine, code, TODAY, goalSet)));
  const opened = tracked.find((s) => s.definition.code === openMetric) ?? null;

  const note = source ? sourceNote(source) : null;

  return (
    <div>
      {/* Blue hero: identity, the one goal, the route switch (MDRT only), and the arc. */}
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
            <div className="mt-[3px] truncate text-[17px] font-bold tracking-[-.01em]">{hero.title}</div>
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

        {primary.kind === "tier" && (
          <div role="radiogroup" aria-label="MDRT route" className="mt-3.5 flex gap-1 rounded-[10px] bg-white/12 p-[3px]">
            {views.map((v) => {
              const on = v.metric === rv.metric;
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
        )}

        {goal ? (
          <>
            <div className="mt-3.5 flex items-baseline justify-between gap-2.5">
              <span className="tnum text-[11px] text-white/72">{hero.subline}</span>
              {toConfirm && <span className="shrink-0 text-[11px] text-white/60">to confirm</span>}
            </div>

            <div className="relative mx-auto mt-3 h-[170px] w-[350px] max-w-full">
              <svg width="350" height="180" viewBox="0 0 350 180" className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2" aria-hidden="true">
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-white/18" />
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-white/45" strokeDasharray={arcDash(projectedFrac)} style={ARC_TRANSITION} />
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-white" strokeDasharray={arcDash(achievedFrac)} style={ARC_TRANSITION} />
              </svg>
              <div className="absolute inset-x-0 top-[56px] text-center">
                <div className="tnum text-[48px] font-extrabold leading-none tracking-[-.03em]">{pct(hero.achieved / goal.target)}</div>
                <div className="tnum mt-[7px] text-[13px] text-white/78">
                  {fmt(hero.achieved)} of {fmt(goal.target)}
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
            {hero.gate && <p className="tnum mt-2.5 text-pretty text-center text-[11px] leading-[1.5] text-white/78">{hero.gate}</p>}
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-white/34 px-[18px] py-5 text-center">
            <div className="tnum text-[22px] font-bold tracking-[-.015em]">{fmt(hero.achieved)}</div>
            <p className="mt-2 text-pretty text-[13px] leading-[1.5] text-white/80">
              {hero.missing ? hero.gate : `No target set for ${hero.title.replace(/^Your /, "your ")}. Your ${hero.word} so far is tracked, but there is nothing to pace it against.`}
            </p>
            {onChangeGoal && (
              <button
                type="button"
                onClick={onChangeGoal}
                className="relative mt-3.5 inline-flex items-center gap-[5px] rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-brand before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] hover:bg-[#e8edf9]"
              >
                Set a target
                <Chevron size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-3 px-4 pb-5 pt-3.5">
        {goal && goal.pace.requiredPerMonth !== null && goal.pace.gap > 0 && (
          <Card>
            <Label>What it takes from here</Label>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="tnum text-[36px] font-bold leading-none tracking-[-.025em] text-accent">{fmt(goal.pace.requiredPerMonth)}</span>
              <span className="text-[15px] font-medium text-muted">/month</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
              <div className="bg-canvas px-[11px] py-[9px]">
                <div className="text-[11px] text-muted">or a week</div>
                <div className="tnum text-[15px] font-semibold text-ink">{fmt(goal.pace.requiredPerWeek ?? 0)}</div>
              </div>
              <div className="bg-canvas px-[11px] py-[9px]">
                <div className="text-[11px] text-muted">{hero.notStarted ? "window" : "at your current rate"}</div>
                <div className="tnum text-[15px] font-semibold text-ink">{hero.notStarted ? periodLabel(hero.period) : fmt(goal.pace.runRateProjection)}</div>
                <div className="text-[11px] text-muted">{hero.notStarted ? `starts ${shortDate(hero.period.start)}` : landingWord}</div>
              </div>
            </div>
            <p className="tnum mt-2.5 text-[12px] leading-[1.5] text-muted">
              Gap of {fmt(hero.gap)} over the {weeksLeft} {weeksLeft === 1 ? "week" : "weeks"} left, to {shortDate(hero.period.end)} {hero.period.end.getFullYear()}.
            </p>
          </Card>
        )}

        {pendingValue > 0 && (
          <div className="flex items-center gap-[9px] rounded-xl bg-warn/9 px-[13px] py-[11px]">
            <span className="shrink-0 rounded bg-warn/14 px-[5px] py-[3px] text-[9px] font-bold uppercase tracking-[.06em] text-warn">Pending</span>
            <span className="tnum text-[12px] leading-[1.45] text-gold-ink">{pendingLine}</span>
          </div>
        )}

        {/* The other MDRT route, one tap to switch the hero to it. */}
        {primary.kind === "tier" &&
          others.map((o) => {
            const ratio = Math.min(o.achieved / o.target, 1);
            return (
              <button key={o.metric} type="button" onClick={() => setRoute(o.metric)} className="btn-lift block w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label>{o.label} route</Label>
                    <div className="tnum mt-1 flex items-baseline gap-1.5">
                      <span className="text-[17px] font-bold text-ink">{sgd(o.achieved)}</span>
                      <span className="truncate text-[12px] text-muted">of {sgd(o.target)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="tnum text-[17px] font-bold text-accent">{pct(ratio)}</span>
                    <span className="flex items-center gap-0.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
                      Show
                      <Chevron size={10} strokeWidth={2.2} />
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 h-[5px] overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
                  <span className="block h-full rounded-full bg-accent/70" style={{ width: `${ratio * 100}%` }} />
                </div>
              </button>
            );
          })}

        <Card>
          <div className="flex items-center justify-between gap-2">
            <Label>Finexis {ELITE.name}</Label>
            {newFc ? (
              <span className="rounded bg-accent-soft px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-accent">new FC tiers</span>
            ) : (
              !ELITE.tiers_confirmed && <span className="rounded bg-canvas px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-muted">sample tiers</span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="tnum text-[36px] font-bold leading-none tracking-[-.025em] text-accent">{count(elite.achieved)}</span>
            <span className="text-[15px] font-medium text-muted">credits this year</span>
          </div>
          <EliteLadder achieved={elite.achieved} tiers={eliteTiers} period={elitePeriod()} />
          <p className="mt-1 text-pretty text-[11px] leading-[1.5] text-muted">
            First-year gross revenue times each product's Elite multiplier, {elitePeriodText()}; insurer cash incentives don't count. Tracked apart from MDRT.
            {newFc ? ` You qualify at the ${ELITE.new_fc_label.replace(/^New FCs/, "new-FC")} tiers.` : ""}
            {ELITE.tiers_confirmed ? "" : " The tiers shown are samples."}
          </p>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3">
            <Label>This year</Label>
            <span className="text-[11px] text-muted">tap for the details</span>
          </div>
          {tracked.map((s) => (
            <MetricRow key={s.definition.code} snapshot={s} onOpen={() => setOpenMetric(s.definition.code)} />
          ))}
        </Card>
      </div>

      {note && <p className={`tnum px-5 pb-5 text-center text-[11px] leading-[1.5] ${note.tone === "warn" ? "text-warn" : "text-muted"}`}>{note.text}</p>}

      <Page open={opened !== null} onClose={() => setOpenMetric(null)} title={opened?.definition.label ?? ""} eyebrow={opened ? `${advisor.name} · ${periodLabel(opened.period)}` : undefined}>
        {opened && <MetricDetail key={opened.definition.code} snapshot={opened} cases={mine} advisor={advisor} />}
      </Page>
    </div>
  );
}

