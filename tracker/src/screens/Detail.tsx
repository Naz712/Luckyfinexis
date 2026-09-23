import { useState, type CSSProperties } from "react";
import { MDRT_MEMBERSHIP_YEAR, TODAY, TRACKER_LAUNCH, type Advisor, type Case, type CaseRecord, type Tier } from "../mock/data";
import { ELITE, elitePeriodText, eliteTiersFor, isNewFc } from "../lib/elite";
import { elitePeriod } from "../lib/aims";
import { effectiveDate, mdrtSnapshot, metricSnapshot, metricsForCase, pace as paceToward, parseISODate, periodBounds, type GoalSet, type MdrtRoute, type Period } from "../lib/calc";
import { grFromCommission } from "../lib/importer";
import { count, periodLabel, sgd, shortDate } from "../lib/format";
import Page from "../components/Page";

// The sheet that opens from a "This year" row on Home: one component, four
// tabs, every section below the tabs following the tab. Laid out from the
// design handoff (Commission, Revenue, Premium and Elite detail screens).

export type DetailTab = "commission" | "gross_revenue" | "premium" | "elite";

const TABS: { code: DetailTab; tab: string; name: string; money: boolean }[] = [
  { code: "commission", tab: "Commission", name: "Commission", money: true },
  { code: "gross_revenue", tab: "Revenue", name: "Gross revenue", money: true },
  { code: "premium", tab: "Premium", name: "Premium", money: true },
  { code: "elite", tab: "Elite", name: "Elite credits", money: false },
];

/** What each figure is, in a sentence, at the top of its tab. */
const ABOUT: Record<DetailTab, string> = {
  commission: "Your first-year commission: your share of the gross revenue on your cases, by the firm's payout formula.",
  gross_revenue: "First-year gross revenue: what the insurers paid Finexis on your cases. Your commission is a share of it, and Elite credits are counted on it.",
  premium: "First-year premium on your cases, single premiums in full.",
  elite: "Finexis Elite credits: first-year gross revenue times each product's Elite multiplier. Insurer cash incentives don't count.",
};

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PAGE_SIZE = 5;

const HATCH_GOLD: CSSProperties = { background: "repeating-linear-gradient(to top, var(--color-gold) 0 3px, var(--color-gold-soft) 3px 6px)" };
const HATCH_PEND: CSSProperties = { background: "repeating-linear-gradient(to right, var(--color-pend) 0 4px, transparent 4px 7px)" };
const HATCH_PEND_KEY: CSSProperties = { background: "repeating-linear-gradient(to right, var(--color-pend) 0 3px, var(--color-surface) 3px 5px)" };

/** Money or credits, whole numbers. */
function fm(v: number, money: boolean): string {
  return money ? sgd(v) : count(v);
}

/** Axis and bar labels: "S$9k", "S$800", "12k". */
function kfmt(v: number, money: boolean): string {
  const n = Math.round(v);
  return (money ? "S$" : "") + (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
}

/** A round axis top at or above x: 1, 2, 2.5, 5 or 10 times a power of ten. */
function nice(x: number): number {
  if (!(x > 0)) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const s = x / p;
  return (s <= 1 ? 1 : s <= 2 ? 2 : s <= 2.5 ? 2.5 : s <= 5 ? 5 : 10) * p;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "29 Aug 2026" */
function dayText(iso: string): string {
  const d = parseISODate(iso);
  return `${shortDate(d)} ${d.getFullYear()}`;
}

const plural = (n: number) => `${n} ${n === 1 ? "case" : "cases"}`;

/** The year month by month for every tab: confirmed figures per month, what is pending, and the latest month with figures. */
function yearFigures(cases: Case[], year: Period) {
  const months: Record<DetailTab, number[]> = { commission: [], gross_revenue: [], premium: [], elite: [] };
  const pending: Record<DetailTab, number> = { commission: 0, gross_revenue: 0, premium: 0, elite: 0 };
  let last = -1;
  let pendMonth = -1;
  for (const c of cases) {
    if (c.status === "superseded") continue;
    const on = effectiveDate(c);
    if (on < year.start || on > year.end) continue;
    const i = on.getMonth();
    const m = metricsForCase(c);
    if (c.status === "pending") {
      pendMonth = Math.max(pendMonth, i);
      for (const t of TABS) pending[t.code] += m[t.code];
    } else {
      last = Math.max(last, i);
      for (const t of TABS) months[t.code][i] = (months[t.code][i] ?? 0) + m[t.code];
    }
  }
  last = Math.max(last, pendMonth);
  for (const t of TABS) months[t.code] = Array.from({ length: last + 1 }, (_, i) => months[t.code][i] ?? 0);
  return { months, pending, last, pendMonth: pendMonth < 0 ? last : pendMonth };
}

// ───────────────────────── Small pieces ─────────────────────────

function SectionTitle({ children }: { children: string }) {
  return <h3 className="m-0 flex-1 text-[11px] font-bold uppercase tracking-[.06em] text-muted">{children}</h3>;
}

function Stat({ label, value, tone = "ink", pending = false, dot }: { label: string; value: string; tone?: "ink" | "warn" | "gold" | "ok"; pending?: boolean; dot?: "ok" | "gold" }) {
  const fg = tone === "warn" ? "text-warn" : tone === "gold" ? "text-gold-ink" : tone === "ok" ? "text-ok-ink" : "text-ink";
  return (
    <div className={`flex flex-col gap-0.5 px-3 py-2.5 ${pending ? "bg-pend-bg" : "bg-canvas"}`}>
      <span className={`flex items-center gap-1.5 text-[12px] ${pending ? "text-gold-ink" : "text-muted"}`}>
        {dot && <span className={`h-2 w-2 rounded-full ${dot === "ok" ? "bg-ok" : "bg-gold"}`} aria-hidden="true" />}
        {label}
      </span>
      <span className={`tnum text-[17px] font-extrabold ${fg}`}>{value}</span>
    </div>
  );
}

function Chip({ on, onClick, children, role = "radio" }: { on: boolean; onClick: () => void; children: string; role?: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={`tnum h-8 shrink-0 rounded-full px-3 text-[12px] font-bold ${on ? "border-[1.5px] border-accent bg-accent-soft text-accent" : "border border-hairline bg-surface text-muted"}`}
    >
      {children}
    </button>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// ───────────────────────── The sheet ─────────────────────────

export default function DetailSheet({
  tab,
  onTab,
  onClose,
  advisor,
  cases,
  records,
  goalSet,
  showClients,
}: {
  /** The open tab, or null when the sheet is closed. */
  tab: DetailTab | null;
  onTab: (t: DetailTab) => void;
  onClose: () => void;
  advisor: Advisor;
  /** The FC's own entries from the import. */
  cases: Case[];
  /** The FC's individual cases since the tracker's launch. */
  records: CaseRecord[];
  goalSet: GoalSet;
  /** Clients' initials on each case: the FC's own view only, not a manager's drill-down. */
  showClients: boolean;
}) {
  const year = periodBounds("jan_dec", TODAY);
  const code: DetailTab = tab ?? "commission";
  const meta = TABS.find((t) => t.code === code)!;
  return (
    <Page
      open={tab !== null}
      onClose={onClose}
      title={meta.name}
      eyebrow={`${advisor.name} · ${periodLabel(year)}`}
      tabs={
        <div role="tablist" aria-label="Figure" className="grid grid-cols-4 gap-1 rounded-xl bg-well p-1">
          {TABS.map((t) => {
            const on = t.code === code;
            return (
              <button
                key={t.code}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onTab(t.code)}
                className={`h-9 rounded-[9px] text-[13px] font-bold ${on ? "bg-surface text-accent shadow-[0_1px_2px_rgba(20,35,94,.18)]" : "text-muted"}`}
              >
                {t.tab}
              </button>
            );
          })}
        </div>
      }
    >
      {tab !== null && <DetailBody code={code} onTab={onTab} advisor={advisor} cases={cases} records={records} goalSet={goalSet} showClients={showClients} year={year} />}
    </Page>
  );
}

function DetailBody({
  code,
  onTab,
  advisor,
  cases,
  records,
  goalSet,
  showClients,
  year,
}: {
  code: DetailTab;
  onTab: (t: DetailTab) => void;
  advisor: Advisor;
  cases: Case[];
  records: CaseRecord[];
  goalSet: GoalSet;
  showClients: boolean;
  year: Period;
}) {
  // Chart view, selected month and the case list's state all survive a tab switch.
  const [view, setView] = useState<"monthly" | "cum">("monthly");
  const [selState, setSel] = useState<number | null>(null);
  const [caseMonthState, setCaseMonth] = useState<number | null>(null);
  const [caseFilter, setCaseFilter] = useState<"all" | "secured" | "pending">("all");
  const [pageState, setPage] = useState(0);
  const [casesOpen, setCasesOpen] = useState(false);

  const meta = TABS.find((t) => t.code === code)!;
  const money = meta.money;
  const f = (v: number) => fm(v, money);

  const fig = yearFigures(cases, year);
  const last = fig.last;
  const v = fig.months[code];
  const pending = fig.pending[code];
  const total = v.reduce((a, b) => a + b, 0);
  const elapsed = last + 1;
  const avg = elapsed > 0 ? total / elapsed : 0;
  const sel = last < 0 ? -1 : Math.min(selState ?? last, last);

  // Goal: the FC's own target on this figure (Elite is paced against its tiers instead).
  const snap = metricSnapshot(advisor.id, cases, code, TODAY, goalSet);
  const goal = code !== "elite" && snap.target !== null && snap.target > 0 && snap.pace ? { target: snap.target, pace: snap.pace, period: snap.period } : null;
  const goalIsYear = goal !== null && sameDay(goal.period.start, year.start) && sameDay(goal.period.end, year.end);
  const need = goal?.pace.requiredPerMonth ?? 0;

  // Without a goal: where this figure counts toward MDRT, if it does, and where this year's average lands.
  const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
  const route: MdrtRoute | null = goal ? null : code === "premium" ? (mdrt.routes.find((r) => r.metric === "mdrt_premium") ?? null) : code === "commission" ? (mdrt.routes.find((r) => r.metric === "mdrt_commission") ?? null) : null;
  const topTwo = v
    .map((x, i) => ({ x, i }))
    .sort((a, b) => b.x - a.x)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i);
  const topShare = total > 0 && elapsed >= 4 ? (topTwo[0]!.x + topTwo[1]!.x) / total : 0;

  // Elite: every tier and how far.
  const tiers = eliteTiersFor(advisor);
  const nextTier = tiers.find((t) => t.credits > total) ?? null;
  const ep = elitePeriod();

  // ── Monthly bars ──
  const inGoal = (i: number) => goal !== null && new Date(year.start.getFullYear(), i, 1) <= goal.period.end && new Date(year.start.getFullYear(), i + 1, 0) >= goal.period.start;
  const H = 140;
  const barTop = nice(Math.max(...v, (v[fig.pendMonth] ?? 0) + pending, goal ? need : 0, 1));

  // ── Running total ──
  const cum: number[] = [];
  v.reduce((run, x) => (cum.push(run + x), run + x), 0);
  const startProj = total + pending;
  const projEnd = goalIsYear ? Math.max(goal!.target, startProj) : Math.max(startProj, total + avg * (11 - last));
  const scaleRef = goalIsYear ? goal!.target : code === "elite" ? (nextTier?.credits ?? total) : total + avg * (11 - last);
  const ctop = nice(Math.max(scaleRef, startProj, 1) * 1.05);
  const X = (i: number) => 44 + i * (270 / 11);
  const Y = (x: number) => 160 - (Math.max(x, 0) / ctop) * 150;
  const linePath = cum.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(x).toFixed(1)}`).join(" ");
  const areaPath = last >= 0 ? `${linePath} L${X(last).toFixed(1)} 160 L${X(0).toFixed(1)} 160 Z` : "";
  const projPath = last >= 0 && last < 11 ? `M${X(last).toFixed(1)} ${Y(startProj).toFixed(1)} L${X(11).toFixed(1)} ${Y(projEnd).toFixed(1)}` : "";

  // ── Selected month ──
  const diff = sel >= 0 && avg > 0 ? Math.round(((v[sel]! - avg) / avg) * 100) : 0;
  const cmp = diff === 0 ? "Level with your monthly average" : `${diff > 0 ? `↑ ${diff}% above` : `↓ ${Math.abs(diff)}% below`} your average of ${f(avg)}`;

  // ── Cases since launch ──
  const launch = parseISODate(TRACKER_LAUNCH);
  const yr = year.start.getFullYear();
  const mine = records.filter((r) => r.advisor_id === advisor.id && parseISODate(r.date).getFullYear() === yr);
  const lastCaseMonth = mine.reduce((m, r) => Math.max(m, parseISODate(r.date).getMonth()), last);
  const firstCaseMonth = launch.getFullYear() < yr ? 0 : launch.getFullYear() > yr ? 12 : launch.getMonth();
  const caseMonths: number[] = [];
  for (let i = lastCaseMonth; i >= firstCaseMonth; i--) caseMonths.push(i);
  const caseMonth = caseMonthState !== null && caseMonths.includes(caseMonthState) ? caseMonthState : (caseMonths[0] ?? -1);
  const grOf = (r: CaseRecord) => r.gross_revenue ?? grFromCommission(r.commission, advisor.banding_code);
  // A case's Elite credits are shown as its gross revenue.
  const cval = (r: CaseRecord) => (code === "commission" ? r.commission : code === "premium" ? r.premium : grOf(r));
  const inMonth = mine.filter((r) => parseISODate(r.date).getMonth() === caseMonth).sort((a, b) => (a.status !== b.status ? (a.status === "pending" ? -1 : 1) : b.date.localeCompare(a.date)));
  const secured = inMonth.filter((r) => r.status === "secured");
  const pendingCases = inMonth.filter((r) => r.status === "pending");
  const sum = (list: CaseRecord[]) => list.reduce((a, r) => a + cval(r), 0);
  const shown = inMonth.filter((r) => caseFilter === "all" || (caseFilter === "pending" ? r.status === "pending" : r.status === "secured"));
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(pageState, pageCount - 1);
  const pageItems = shown.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const confPct = goal ? Math.round((snap.achieved / goal.target) * 100) : 0;
  const pendPct = goal ? Math.min(100, Math.round((snap.projected / goal.target) * 100)) : 0;
  const estimated = code === "gross_revenue" && cases.some((c) => c.gr_estimated);

  return (
    <div className="tnum flex flex-col gap-3 p-4 pb-10">
      {/* Summary */}
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[40px] font-extrabold leading-[44px] tracking-[-.02em] text-accent">{f(total)}</span>
          <span className="text-[14px] text-muted">{money ? "confirmed" : "credits confirmed"}</span>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-2">
            <span className="rounded bg-pend-tag px-1.5 py-0.5 text-[10px] font-extrabold tracking-[.06em] text-gold-ink">PENDING</span>
            <span className="text-[13px] leading-[18px] text-gold-ink">+{f(pending)} waiting on the insurer</span>
          </div>
        )}
        <p className="m-0 text-pretty text-[13px] leading-[19px] text-muted">
          {ABOUT[code]}
          {estimated ? " Worked out from your commission at your band until the monthly import carries it." : ""}
        </p>

        {goal && (
          <div className="flex flex-col gap-2.5 border-t border-line pt-3">
            <div className="flex items-baseline">
              <span className="flex-1 text-[13px] font-bold text-ink">Your goal · {periodLabel(goal.period)}</span>
              <span className="text-[13px] font-extrabold text-ink">{f(goal.target)}</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-well" role="img" aria-label={`${confPct}% confirmed, ${pendPct}% with pending`}>
              <span className="absolute inset-y-0 left-0" style={{ ...HATCH_PEND, width: `${pendPct}%` }} />
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.min(confPct, 100)}%` }} />
            </div>
            <div className="flex gap-4 text-[12px] leading-4 text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden="true" />
                Confirmed {confPct}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="box-border h-2.5 w-2.5 rounded-[3px] border border-pend" style={HATCH_PEND_KEY} aria-hidden="true" />
                With pending {pendPct}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
              {goal.pace.gap > 0 ? (
                <>
                  <Stat label="Gap to goal" value={f(goal.pace.gap)} />
                  <Stat label="Needed each month" value={goal.pace.requiredPerMonth === null ? "Period over" : f(need)} tone="warn" />
                </>
              ) : (
                <>
                  <Stat label="Goal reached" value={`${confPct}%`} tone="ok" />
                  <Stat label="Above your goal by" value={f(snap.achieved - goal.target)} tone="ok" />
                </>
              )}
            </div>
            {goal.pace.gap > 0 && (
              <p className="m-0 text-[12px] leading-[17px] text-muted">
                Projected with pending: {f(snap.projected)}.{" "}
                {snap.projected >= goal.target ? "That reaches your goal once the insurer confirms." : `That still leaves ${f(goal.target - snap.projected)} to find by ${shortDate(goal.period.end)}.`}
              </p>
            )}
          </div>
        )}

        {!goal && code !== "elite" && last >= 0 && (
          <div className="flex flex-col gap-2.5 border-t border-line pt-3">
            {route && (
              <>
                <div className="flex items-baseline">
                  <span className="flex-1 text-[13px] font-bold text-ink">
                    Counts toward {TIER_LABEL[mdrt.goalTier]} {MDRT_MEMBERSHIP_YEAR} · {route.label.toLowerCase()} route
                  </span>
                  <span className="text-[13px] font-extrabold text-ink">{Math.round((route.achieved / route.goalThreshold) * 100)}%</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-well" aria-hidden="true">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(route.achieved / route.goalThreshold, 1) * 100}%` }} />
                </div>
                <div className="text-[12px] leading-4 text-muted">
                  {sgd(route.achieved)} credited of {sgd(route.goalThreshold)}
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
              <Stat label="Monthly average" value={f(avg)} />
              <Stat label={`At that pace, by ${shortDate(year.end)}`} value={f(avg * 12)} />
            </div>
            {topShare >= 0.5 && (
              <p className="m-0 text-[12px] leading-[17px] text-muted">
                {MONTH_LONG[topTwo[0]!.i]} and {MONTH_LONG[topTwo[1]!.i]} make up {Math.round(topShare * 100)}% of the year so far, so the monthly bars below are best read with the running total.
              </p>
            )}
          </div>
        )}

        {code === "elite" && (
          <div className="flex flex-col border-t border-line pt-1">
            <ul className="m-0 list-none p-0" aria-label="Elite tiers">
              {tiers.map((t) => {
                const reached = total >= t.credits;
                const isNext = t === nextTier;
                const p = reached ? null : paceToward(total, t.credits, ep.start, ep.end, TODAY);
                return (
                  <li key={t.code} className="flex items-center gap-3 border-b border-well py-3">
                    <span
                      className={`box-border h-3.5 w-3.5 shrink-0 rounded-full ${reached ? "bg-ok" : isNext ? "border-4 border-accent" : "border-[1.5px] border-hairline"}`}
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-bold text-ink">{t.name}</span>
                      <span className="text-[12px] text-muted">
                        {count(t.credits)} credits{t.perk ? ` · ${t.perk}` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      {reached ? (
                        <span className="text-[14px] font-extrabold text-ok-ink">Reached</span>
                      ) : (
                        <>
                          <span className="text-[14px] font-extrabold text-accent">{count(t.credits - total)} to go</span>
                          {p && p.requiredPerMonth !== null && <span className="text-[12px] text-muted">{count(p.requiredPerMonth)} a month</span>}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 pt-2 text-[11px] leading-[1.5] text-faint">
              {ELITE.name}, {elitePeriodText()}.{isNewFc(advisor) ? " New-FC tiers." : ""}
              {ELITE.tiers_confirmed ? "" : " Sample tiers."}
            </p>
          </div>
        )}
      </section>

      {/* Month by month */}
      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <SectionTitle>Month by month</SectionTitle>
          <div role="radiogroup" aria-label="Chart view" className="flex rounded-full bg-well p-[3px]">
            {(
              [
                ["monthly", "Monthly"],
                ["cum", "Running total"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={view === k}
                onClick={() => setView(k)}
                className={`h-[30px] rounded-full px-3 text-[12px] font-bold ${view === k ? "bg-surface text-accent shadow-[0_1px_2px_rgba(20,35,94,.18)]" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {last < 0 ? (
          <p className="m-0 text-[13px] text-muted">Nothing imported for {yr} yet.</p>
        ) : view === "monthly" ? (
          <>
            <div className="flex gap-1.5">
              <div className="flex h-40 w-[30px] shrink-0 flex-col justify-between text-right text-[10px] text-faint" aria-hidden="true">
                <span>{kfmt(barTop, money)}</span>
                <span>{kfmt(barTop / 2, money)}</span>
                <span>0</span>
              </div>
              <div className="relative flex min-w-0 flex-1 flex-col">
                <div className="absolute inset-x-0 top-1.5 h-px bg-well" />
                <div className="absolute inset-x-0 top-20 h-px bg-well" />
                <div className="relative mt-1.5 flex h-[154px] items-end border-b border-hairline">
                  {MONTH_SHORT.map((lab, i) => {
                    const future = i > last;
                    const showNeed = future && goal !== null && need > 0 && inGoal(i);
                    const val = future ? need : v[i]!;
                    const h = future ? (showNeed ? Math.max(2, (val / barTop) * H) : 0) : Math.max(val > 0 ? 3 : 1, (val / barTop) * H);
                    const isSel = !future && i === sel;
                    const hasPend = !future && i === fig.pendMonth && pending > 0;
                    return (
                      <button
                        key={lab}
                        type="button"
                        onClick={() => setSel(i)}
                        disabled={future}
                        aria-label={future ? (showNeed ? `${MONTH_LONG[i]}: ${f(need)} needed` : MONTH_LONG[i]) : `${MONTH_LONG[i]} ${f(val)}${hasPend ? `, plus ${f(pending)} pending` : ""}`}
                        aria-pressed={future ? undefined : isSel}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end p-0 disabled:cursor-default"
                      >
                        {isSel && <span className="mb-[3px] whitespace-nowrap text-[10px] font-extrabold text-ink">{kfmt(val, money)}</span>}
                        {hasPend && <span className="w-4 shrink-0 rounded-t" style={{ ...HATCH_GOLD, height: Math.round((pending / barTop) * H) }} />}
                        <span
                          className={`box-border w-4 shrink-0 ${hasPend ? "" : "rounded-t"} ${future ? (showNeed ? "border-[1.5px] border-dashed border-warn" : "") : isSel ? "bg-accent" : "bg-bar"}`}
                          style={{ height: Math.round(h) }}
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex" aria-hidden="true">
                  {MONTH_SHORT.map((lab, i) => (
                    <span key={lab} className={`min-w-0 flex-1 text-center text-[10px] ${i === sel ? "font-extrabold text-ink" : i > last ? "font-medium text-hairline" : "font-medium text-muted"}`}>
                      {lab}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-[5px]">
                <span className="h-[9px] w-[9px] rounded-sm bg-bar" aria-hidden="true" />
                Confirmed
              </span>
              {pending > 0 && (
                <span className="flex items-center gap-[5px]">
                  <span className="h-[9px] w-[9px] rounded-sm bg-gold" aria-hidden="true" />
                  Pending
                </span>
              )}
              {goal && need > 0 && last < 11 && (
                <span className="flex items-center gap-[5px]">
                  <span className="box-border h-[9px] w-[9px] rounded-sm border-[1.5px] border-dashed border-warn" aria-hidden="true" />
                  Needed a month to reach your goal
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <svg viewBox="0 0 326 190" className="block h-auto w-full" role="img" aria-label={`${meta.name} running total by month, ${f(total)} by ${MONTH_LONG[last]}`}>
              <line x1="36" y1="10" x2="322" y2="10" className="stroke-well" />
              <line x1="36" y1="85" x2="322" y2="85" className="stroke-well" />
              <line x1="36" y1="160" x2="322" y2="160" className="stroke-hairline" />
              <text x="30" y="14" textAnchor="end" className="fill-faint text-[10px]">
                {kfmt(ctop, money)}
              </text>
              <text x="30" y="89" textAnchor="end" className="fill-faint text-[10px]">
                {kfmt(ctop / 2, money)}
              </text>
              <text x="30" y="164" textAnchor="end" className="fill-faint text-[10px]">
                0
              </text>
              <path d={areaPath} className="fill-accent" fillOpacity={0.08} />
              {goalIsYear && (
                <>
                  <line x1="36" y1={Y(goal!.target).toFixed(1)} x2="322" y2={Y(goal!.target).toFixed(1)} className="stroke-warn" strokeWidth={1.5} strokeDasharray="5 4" />
                  <text x="40" y={(Y(goal!.target) - 5).toFixed(1)} className="fill-gold-ink text-[10px] font-bold">
                    Goal {f(goal!.target)}
                  </text>
                </>
              )}
              {projPath && <path d={projPath} fill="none" className="stroke-pend" strokeWidth={2} strokeDasharray="4 4" />}
              <path d={linePath} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {pending > 0 && (
                <>
                  <line x1={X(fig.pendMonth).toFixed(1)} y1={Y(total).toFixed(1)} x2={X(fig.pendMonth).toFixed(1)} y2={Y(startProj).toFixed(1)} className="stroke-gold" strokeWidth={2} />
                  <circle cx={X(fig.pendMonth).toFixed(1)} cy={Y(startProj).toFixed(1)} r="4" className="fill-surface stroke-gold" strokeWidth={2} />
                </>
              )}
              {sel >= 0 && <circle cx={X(sel).toFixed(1)} cy={Y(cum[sel]!).toFixed(1)} r="5" className="fill-accent stroke-surface" strokeWidth={2} />}
              {MONTH_SHORT.map((t, i) => (
                <text key={t} x={X(i).toFixed(1)} y="180" textAnchor="middle" className={`text-[10px] ${i === sel ? "fill-ink font-extrabold" : i > last ? "fill-hairline" : "fill-muted"}`}>
                  {t}
                </text>
              ))}
              {/* Tap a month on the line to select it, as on the bars. */}
              {cum.map((x, i) => (
                <rect key={i} x={X(i) - 11} y="0" width="22" height="186" fill="transparent" className="cursor-pointer" onClick={() => setSel(i)}>
                  <title>{`${MONTH_LONG[i]}: ${f(x)} so far`}</title>
                </rect>
              ))}
            </svg>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-[5px]">
                <span className="h-[3px] w-3 rounded-sm bg-accent" aria-hidden="true" />
                Year to date
              </span>
              {pending > 0 && (
                <span className="flex items-center gap-[5px]">
                  <span className="box-border h-2 w-2 rounded-full border-2 border-gold" aria-hidden="true" />
                  With pending
                </span>
              )}
              {projPath && (
                <span className="flex items-center gap-[5px]">
                  <span className="h-0 w-3 border-t-2 border-dashed border-pend" aria-hidden="true" />
                  {goalIsYear ? "Pace needed to reach your goal" : "At this year's average so far"}
                </span>
              )}
            </div>
          </>
        )}

        {sel >= 0 && (
          <div className="flex flex-col gap-2.5 rounded-xl bg-canvas p-3">
            <div className="flex items-baseline gap-2">
              <span className="flex-1 whitespace-nowrap text-[15px] font-extrabold text-ink">
                {MONTH_LONG[sel]} {yr}
              </span>
              <span className={`min-w-0 text-right text-[12px] ${diff >= 0 ? "text-ok-ink" : "text-muted"}`}>{cmp}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TABS.map((t) => {
                const on = t.code === code;
                return (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => onTab(t.code)}
                    aria-pressed={on}
                    className={`flex min-h-[52px] flex-col gap-0.5 rounded-[10px] px-2.5 py-2 text-left ${on ? "border-[1.5px] border-accent bg-accent-soft" : "border border-line bg-surface"}`}
                  >
                    <span className="text-[11px] text-muted">{t.name}</span>
                    <span className={`text-[15px] font-extrabold ${on ? "text-accent" : "text-ink"}`}>{fm(fig.months[t.code][sel] ?? 0, t.money)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* All months */}
      {last >= 0 && (
        <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-baseline px-4 pb-1.5 pt-3.5">
            <SectionTitle>All months</SectionTitle>
            <span className="text-[11px] text-faint">Tap a month to see it above</span>
          </div>
          {(() => {
            const maxV = Math.max(...v, pending, 1);
            const rows = [];
            if (pending > 0) {
              rows.push(
                <div key="pending" className="flex min-h-11 items-center gap-2.5 border-t border-well bg-pend-bg px-4">
                  <span className="w-[74px] text-[13px] font-bold text-ink">Pending</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-well">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${Math.round((pending / maxV) * 100)}%` }} />
                  </span>
                  <span className="w-[84px] text-right text-[13px] font-extrabold text-gold-ink">{f(pending)}</span>
                </div>,
              );
            }
            for (let r = last; r >= 0; r--) {
              const on = r === sel;
              const x = v[r]!;
              rows.push(
                <button key={r} type="button" onClick={() => setSel(r)} aria-pressed={on} className={`flex min-h-11 items-center gap-2.5 border-t border-well px-4 text-left ${on ? "bg-accent-soft/60" : "bg-surface"}`}>
                  <span className={`w-[74px] text-[13px] text-ink ${on ? "font-extrabold" : "font-medium"}`}>
                    {MONTH_SHORT[r]} {yr}
                  </span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-well">
                    <span className={`absolute inset-y-0 left-0 rounded-full ${on ? "bg-accent" : "bg-bar"}`} style={{ width: `${Math.max(x > 0 ? 2 : 0, Math.round((Math.max(x, 0) / maxV) * 100))}%` }} />
                  </span>
                  <span className="w-[84px] text-right text-[13px] font-extrabold text-ink">{f(x)}</span>
                </button>,
              );
            }
            return rows;
          })()}
        </section>
      )}

      {/* Your cases */}
      <section className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-col gap-2.5 px-4 py-3.5">
          <div className="flex items-baseline gap-2">
            <SectionTitle>Your cases</SectionTitle>
            <span className="text-[11px] text-faint">Tracked since {dayText(TRACKER_LAUNCH)}</span>
          </div>
          {caseMonths.length === 0 || mine.length === 0 ? (
            <p className="m-0 text-pretty text-[13px] leading-[19px] text-muted">No cases have come through yet. Cases from {dayText(TRACKER_LAUNCH)} show here month by month once the tracker receives them, pending until the insurer confirms each one.</p>
          ) : (
            <>
              <div role="radiogroup" aria-label="Month" className="flex gap-1.5 overflow-x-auto">
                {caseMonths.map((i) => (
                  <Chip
                    key={i}
                    on={i === caseMonth}
                    onClick={() => {
                      setCaseMonth(i);
                      setPage(0);
                    }}
                  >
                    {`${MONTH_SHORT[i]} ${yr}`}
                  </Chip>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
                <Stat label={`Secured · ${plural(secured.length)}`} value={f(sum(secured))} dot="ok" />
                <Stat label={`Pending · ${plural(pendingCases.length)}`} value={f(sum(pendingCases))} tone="gold" pending dot="gold" />
              </div>
              <button
                type="button"
                aria-expanded={casesOpen}
                onClick={() => setCasesOpen((o) => !o)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent-soft text-[14px] font-extrabold text-accent hover:bg-accent/15"
              >
                {casesOpen ? "Hide cases" : `View ${plural(inMonth.length)}`}
                <ChevronDown open={casesOpen} />
              </button>
            </>
          )}
        </div>

        {casesOpen && caseMonths.length > 0 && mine.length > 0 && (
          <div className="drop-in">
            <div role="radiogroup" aria-label="Filter cases" className="flex gap-1.5 px-4 pb-3">
              {(
                [
                  ["all", `All ${inMonth.length}`],
                  ["secured", `Secured ${secured.length}`],
                  ["pending", `Pending ${pendingCases.length}`],
                ] as const
              ).map(([k, label]) => (
                <Chip
                  key={k}
                  on={caseFilter === k}
                  onClick={() => {
                    setCaseFilter(k);
                    setPage(0);
                  }}
                >
                  {label}
                </Chip>
              ))}
            </div>
            <ul className="m-0 list-none p-0" aria-label="Cases">
              {pageItems.map((r) => {
                const isPending = r.status === "pending";
                return (
                  <li key={r.policy} className={`flex min-h-16 items-center gap-3 border-t border-well px-4 py-2.5 ${isPending ? "bg-pend-bg" : "bg-surface"}`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="text-[14px] font-bold text-ink">{r.product}</span>
                        {isPending && <span className="shrink-0 rounded bg-pend-tag px-[5px] py-px text-[9px] font-extrabold tracking-[.06em] text-gold-ink">PENDING</span>}
                      </span>
                      <span className="text-[12px] text-muted">{showClients ? `Client ${r.client} · ${dayText(r.date)}` : dayText(r.date)}</span>
                      <span className="font-mono text-[11px] text-faint">{r.policy}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className={`text-[15px] font-extrabold ${isPending ? "text-gold-ink" : "text-ink"}`}>
                        {isPending ? "+" : ""}
                        {f(cval(r))}
                      </span>
                      <span className={`flex items-center gap-1 text-[11px] ${isPending ? "text-gold-ink" : "text-ok-ink"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isPending ? "bg-gold" : "bg-ok"}`} aria-hidden="true" />
                        {isPending ? "Waiting on the insurer" : "Secured"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {shown.length === 0 && <p className="m-0 border-t border-well p-4 text-[13px] text-muted">No cases here for this month.</p>}
            <nav aria-label="Case pages" className="flex items-center gap-2 border-t border-well px-3 py-2.5">
              <button
                type="button"
                onClick={() => setPage(Math.max(page - 1, 0))}
                disabled={page === 0}
                aria-label="Previous page"
                className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-surface text-accent disabled:text-hairline"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <div className="flex flex-1 flex-col items-center">
                <span className="text-[13px] font-extrabold text-ink">
                  Page {page + 1} of {pageCount}
                </span>
                <span className="text-[11px] text-muted">{shown.length ? `Showing ${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + pageItems.length} of ${shown.length}` : "Nothing to show"}</span>
              </div>
              <button
                type="button"
                onClick={() => setPage(Math.min(page + 1, pageCount - 1))}
                disabled={page >= pageCount - 1}
                aria-label="Next page"
                className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-surface text-accent disabled:text-hairline"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </nav>
          </div>
        )}
      </section>
    </div>
  );
}
