import { useState, type ReactNode } from "react";
import { MDRT_MEMBERSHIP_YEAR, MDRT_THRESHOLDS_CONFIRMED, metric_definitions, TODAY, type Advisor, type Case, type CaseRecord, type MetricUnit, type Tier } from "../mock/data";
import { ELITE, eliteTiersFor, isNewFc, tiersInView, type EliteTier } from "../lib/elite";
import { elitePeriod, soloAim } from "../lib/aims";
import {
  casesForAdvisor,
  mdrtSnapshot,
  metricSnapshot,
  pace as paceToward,
  parseISODate,
  ROUTE_WORD,
  type GoalSet,
  type MdrtRoute,
  type MdrtRouteMetric,
  type MdrtSnapshot,
  type MetricSnapshot,
  type Pace,
  type Period,
  type PrimaryGoal,
  type RouteCredit,
} from "../lib/calc";
import { count, fmtMetric, paceText, pct, periodLabel, routeGateText, sgd, shortDate } from "../lib/format";
import type { DataSource } from "../lib/api";
import { Card, Label } from "../components/ui";
import DetailSheet, { type DetailTab } from "./Detail";

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };

/** Semicircular progress arc: 350×180 viewBox, 471.2 units long. */
const ARC = 471.2;
const ARC_PATH = "M25 160 A150 150 0 0 1 325 160";

/**
 * The one-line verdict under the arc. Always true to the numbers, never a
 * scolding: when behind, it says what closes the gap rather than "behind".
 */
function verdictFor(pace: Pace, achieved: number, unit: MetricUnit): { tone: "ok" | "warn"; text: string } {
  const fmt = (v: number) => fmtMetric(v, unit);
  if (pace.gap === 0) return { tone: "ok", text: "Goal reached · the rest is above target" };
  if (pace.onTrack) return { tone: "ok", text: `On pace · at this rate you finish at ${fmt(pace.runRateProjection)}` };
  if (pace.requiredPerMonth === null) return { tone: "warn", text: `Period over · short by ${fmt(pace.gap)}` };
  const runRate = pace.elapsedMonths > 0 ? achieved / pace.elapsedMonths : 0;
  const lead = pace.requiredPerMonth <= runRate * 2 ? "Nearly on pace" : "Still in play";
  return { tone: "warn", text: `${lead} · ${fmt(pace.requiredPerMonth)} a month gets you there` };
}
const ARC_TRANSITION = { transition: "stroke-dasharray .55s cubic-bezier(.22,1,.36,1)" } as const;
const arcDash = (frac: number) => `${(ARC * frac).toFixed(1)} ${ARC}`;

/** The "This year" rows, in order. WAPE is a Custom goal only, not a Home row. */
const TRACKED_ORDER: DetailTab[] = ["commission", "gross_revenue", "premium", "elite"];

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

/** Whatever the hero shows, for any aim: MDRT on a route, or a single figure (an Elite tier, a custom goal). */
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
  /** A figure the import doesn't carry (WAPE without its column). */
  missing: boolean;
}

// ───────────────────────── finexis Elite: the tiers, one at a time ─────────────────────────

/** A track to the next tier with a mark at each tier shown, then one line per tier: reached, or what is left and the monthly pace to get there. Higher tiers appear once the one before is reached. */
function EliteLadder({ achieved, tiers: all, period }: { achieved: number; tiers: EliteTier[]; period: Period }) {
  const tiers = tiersInView(all, achieved);
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

// ───────────────────────── MDRT under another aim ─────────────────────────

/** MDRT's two routes toward the tier aimed for, when the goal on top is Elite or custom; each opens its detail tab. */
function MdrtCard({ mdrt, onOpen }: { mdrt: MdrtSnapshot; onOpen: (tab: DetailTab) => void }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-baseline justify-between gap-2 px-4 pb-2.5 pt-3">
        <Label>
          {TIER_LABEL[mdrt.goalTier]} {MDRT_MEMBERSHIP_YEAR}
        </Label>
        <span className="tnum shrink-0 text-[11px] text-muted">{periodLabel(mdrt.period)}</span>
      </div>
      {mdrt.routes.map((r) => {
        const tone: Tone = r.goalReached ? "ok" : r.pace.onTrack ? "accent" : "warn";
        const t = TONE[tone];
        const fill = r.goalProgress;
        const pendingFill = Math.min(Math.max(r.projected - r.achieved, 0) / r.goalThreshold, 1 - fill);
        const gate = routeGateText(r.credit);
        return (
          <button
            key={r.metric}
            type="button"
            onClick={() => onOpen(r.metric === "mdrt_commission" ? "commission" : "premium")}
            className="block w-full border-t border-line px-4 pb-[13px] pt-3 text-left hover:bg-canvas/60"
          >
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-[7px]">
                <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{r.label} route</span>
                {r.metric === mdrt.closer && <span className="rounded bg-accent-soft px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-accent">closest</span>}
              </div>
              <div className="flex shrink-0 items-center gap-[7px]">
                <span className="tnum text-[16px] font-bold text-ink">{sgd(r.achieved)}</span>
                <Chevron className="text-faint" />
              </div>
            </div>
            <div className="mt-[9px] flex h-[5px] overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
              <span className={`${t.fill} transition-[width] duration-[450ms]`} style={{ width: `${fill * 100}%` }} />
              <span className={`${t.soft} transition-[width] duration-[450ms]`} style={{ width: `${pendingFill * 100}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2.5">
              <span className={`tnum flex min-w-0 items-center gap-1.5 text-[12px] font-medium ${t.text}`}>
                <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
                <span className="truncate">{r.goalReached ? `${TIER_LABEL[mdrt.goalTier]} reached` : `${sgd(r.goalThreshold - r.achieved)} to go`}</span>
              </span>
              <span className="tnum shrink-0 text-[12px] text-muted">
                {pct(fill)} of {sgd(r.goalThreshold)}
              </span>
            </div>
            {gate && <p className="tnum mt-1.5 text-pretty text-[11px] leading-[1.45] text-muted">{gate}</p>}
          </button>
        );
      })}
    </Card>
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

// ───────────────────────── Home ─────────────────────────

export default function Home({
  advisor,
  cases,
  goalSet,
  primary = { kind: "tier" },
  onChangeGoal,
  identityExtra,
  source,
  records = [],
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  primary?: PrimaryGoal;
  onChangeGoal?: () => void;
  identityExtra?: ReactNode;
  /** Where the rows came from; absent in the manager's read-only drill-down. */
  source?: DataSource;
  /** Individual cases since the tracker's launch, for the detail sheet's case list. */
  records?: CaseRecord[];
}) {
  const mine = casesForAdvisor(advisor.id, cases);
  const mdrt = mdrtSnapshot(advisor.id, mine, TODAY, goalSet);

  // The route defaults to the closer one; a choice is remembered per advisor so a read-only drill-down starts fresh.
  const [routeChoice, setRouteChoice] = useState<{ advisorId: string; metric: MdrtRouteMetric } | null>(null);
  const route: MdrtRouteMetric = routeChoice?.advisorId === advisor.id ? routeChoice.metric : mdrt.closer;
  const setRoute = (metric: MdrtRouteMetric) => setRouteChoice({ advisorId: advisor.id, metric });
  const [openTab, setOpenTab] = useState<DetailTab | null>(null);

  const views = mdrt.routes.map((r) => routeView(r, mdrt.period));
  const rv = views.find((v) => v.metric === route) ?? views[0]!;

  // The hero: MDRT on the chosen route, or the single figure of an Elite or custom aim.
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
      missing: false,
    };
  } else {
    const aim = soloAim(advisor, mine, goalSet, primary, TODAY);
    const def = metric_definitions.find((m) => m.code === aim.metric)!;
    hero = {
      title: aim.name,
      subline: `${periodLabel(aim.period)} · ${aim.kind === "elite" ? "Elite credits" : def.code === "wape" ? "WAPE" : def.label.toLowerCase()}`,
      unit: aim.unit,
      word: aim.kind === "elite" ? "Elite credits" : def.code === "wape" ? "WAPE" : def.label.toLowerCase(),
      period: aim.period,
      achieved: aim.achieved,
      projected: aim.projected,
      target: aim.target,
      pace: aim.pace,
      gap: aim.gap,
      gate: aim.inImport ? null : aim.blurb,
      missing: !aim.inImport,
    };
  }
  const fmt = (v: number) => fmtMetric(v, hero.unit);
  const toConfirm = primary.kind === "tier" && !MDRT_THRESHOLDS_CONFIRMED;
  const goal = hero.target !== null && hero.target > 0 && hero.pace !== null ? { target: hero.target, pace: hero.pace } : null;
  const achievedFrac = goal ? Math.min(hero.achieved / goal.target, 1) : 0;
  const projectedFrac = goal ? Math.min(hero.projected / goal.target, 1) : 0;
  const verdict = goal ? verdictFor(goal.pace, hero.achieved, hero.unit) : { tone: "warn" as const, text: "" };

  // What it takes from here: the gap spread over what is left of the window, and where the current rate lands.
  const landingWord = `by ${shortDate(hero.period.end)}`;

  // Pending strip: the latest month's figures the insurer has not confirmed yet.
  const pendingValue = Math.max(hero.projected - hero.achieved, 0);
  const pendingLine = goal
    ? `${fmt(pendingValue)} pending would take you to ${pct(hero.projected / goal.target)} once the insurer confirms.`
    : `${fmt(pendingValue)} is waiting on the insurer.`;

  // finexis Elite: the in-house scheme, tracked apart from MDRT, one tier at a time.
  const elite = metricSnapshot(advisor.id, mine, "elite", TODAY, goalSet);
  // Under the goal on top, the other one: Elite under MDRT, MDRT under Elite, both under a custom goal.
  const showElite = primary.kind !== "elite";
  const showMdrt = primary.kind !== "tier";
  const eliteTiers = eliteTiersFor(advisor);
  const newFc = isNewFc(advisor);

  // This year: commission, gross revenue, premium and Elite credits; each opens the detail sheet on its tab.
  const tracked = TRACKED_ORDER.map((code) => (code === "elite" ? elite : metricSnapshot(advisor.id, mine, code, TODAY, goalSet)));

  const note = source ? sourceNote(source) : null;

  return (
    <div>
      {/* Blue hero: identity, the one goal, the route switch (MDRT only), and the arc. */}
      <section className="overflow-hidden bg-brand px-5 pb-6 pt-[max(6px,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-[9px]">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-white/16 text-[12px] font-bold" aria-hidden="true">
              {initials(advisor.name)}
            </span>
            <div className="min-w-0">
              <div className="text-pretty break-words text-[14px] font-semibold leading-[18px]">{advisor.name}</div>
              <div className="text-[11px] leading-4 text-white/72">
                {advisor.fc_code} · Band {advisor.banding_code.slice(1)}
              </div>
            </div>
          </div>
          {identityExtra && <div className="flex shrink-0 items-center gap-2">{identityExtra}</div>}
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
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-[#8fa8ff]" strokeDasharray={arcDash(projectedFrac)} style={ARC_TRANSITION} />
                <path d={ARC_PATH} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-white" strokeDasharray={arcDash(achievedFrac)} style={ARC_TRANSITION} />
              </svg>
              <div className="absolute inset-x-0 top-[56px] text-center">
                <div className="tnum text-[48px] font-extrabold leading-none tracking-[-.03em]">{pct(hero.achieved / goal.target)}</div>
                <div className="tnum mt-[7px] text-[13px] text-white/78">
                  {fmt(hero.achieved)} of {fmt(goal.target)}
                </div>
              </div>
            </div>
            <div className="tnum -mt-1 mb-1 flex items-center justify-center gap-4 text-[11px] text-white/78">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />
                Confirmed {pct(achievedFrac)}
              </span>
              {hero.projected > hero.achieved && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#8fa8ff]" aria-hidden="true" />
                  With pending {pct(Math.min(hero.projected / goal.target, 1))}
                </span>
              )}
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
                <div className="text-[11px] text-muted">at your current rate</div>
                <div className="tnum text-[15px] font-semibold text-ink">{fmt(goal.pace.runRateProjection)}</div>
                <div className="text-[11px] text-muted">{landingWord}</div>
              </div>
            </div>
          </Card>
        )}

        {pendingValue > 0 && (
          <div className="flex items-center gap-[9px] rounded-xl bg-warn/9 px-[13px] py-[11px]">
            <span className="shrink-0 rounded bg-warn/14 px-[5px] py-[3px] text-[9px] font-bold uppercase tracking-[.06em] text-warn">Pending</span>
            <span className="tnum text-[12px] leading-[1.45] text-gold-ink">{pendingLine}</span>
          </div>
        )}

        {showMdrt && <MdrtCard mdrt={mdrt} onOpen={setOpenTab} />}

        {showElite && (
        <Card>
          <div className="flex items-center justify-between gap-2">
            <Label>finexis {ELITE.name}</Label>
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
        </Card>
        )}

        <Card className="overflow-hidden p-0">
          <div className="flex items-baseline justify-between px-4 pb-2.5 pt-3">
            <Label>This year</Label>
          </div>
          {tracked.map((s) => (
            <MetricRow key={s.definition.code} snapshot={s} onOpen={() => setOpenTab(s.definition.code as DetailTab)} />
          ))}
        </Card>
      </div>

      {note && note.tone === "warn" && <p className="tnum px-5 pb-5 text-center text-[11px] leading-[1.5] text-warn">{note.text}</p>}

      <DetailSheet tab={openTab} onTab={setOpenTab} onClose={() => setOpenTab(null)} advisor={advisor} cases={mine} records={records} goalSet={goalSet} />
    </div>
  );
}

