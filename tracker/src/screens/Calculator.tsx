// The Calculator, for the final sprint, at the FC's own band. A card lists
// the plans with an insurer incentive running now, each with a link to its
// circular. Then, per policy, numbered steps: ① choose the plan (a picker
// with search, and filters for the provider and the type of plan; the premium
// type and the term, which lands on the schedule row that covers it), ② the
// premium as the client pays it (a lump sum for the year, or half-yearly,
// quarterly or monthly payments, the first arriving this month) and what the
// client gets from the insurer's customer campaigns, riders (optional, each
// with its own premium and term, paid with the plan) and ③ what the FC
// earns: the first-year commission (FYC) however the client pays, the
// insurer incentives on top, where the first year's premium goes, and what
// the case adds toward the year-end goals. MDRT and Elite count only what is
// paid by 31 Dec (monthly from September is 4 of 12 payments); MDRT counts
// the schedule's commission alone, Elite the first-year GR. Under the
// policies: the case's total toward the goals, the aim set in Goals and the
// other one under it. Nothing here is saved.
import { useState, type ReactNode } from "react";
import { MDRT_MEMBERSHIP_YEAR, TODAY, type Advisor, type BandingCode, type Case, type MetricUnit } from "../mock/data";
import { soloAim } from "../lib/aims";
import {
  clientsNeeded,
  metricSnapshot,
  clientsNeededOnRoute,
  MDRT_CATEGORY_LABEL,
  mdrtSnapshot,
  type GoalSet,
  type PrimaryGoal,
  type RouteCredit,
} from "../lib/calc";
import { count, fmtMetric, periodLabel, sgd } from "../lib/format";
import {
  apeCredits,
  apeOf,
  CATALOGUE,
  CATALOGUE_IS_PRIVATE,
  categoriesOf,
  clientRewardsFor,
  clientRewardValue,
  defaultPay,
  fcShare,
  incentivesFor,
  incentivesOnPolicy,
  incentivesRunning,
  insurerList,
  isoShort,
  isRider,
  PAY_MODES,
  paidInYear,
  payOptionByKey,
  payOptions,
  policyById,
  quote,
  ridersFor,
  rowForTerm,
  termsText,
  type ClientReward,
  type Incentive,
  type PayMode,
  type PayOption,
  type Policy,
  type PolicyVariant,
  type Quote,
} from "../lib/policies";
import { ELITE, eliteTiersFor, tiersInView } from "../lib/elite";
import { Label } from "../components/ui";
import Sheet from "../components/Sheet";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The first payment arrives this month; MDRT, Elite and the sprint all close on 31 Dec. */
const THIS_MONTH = TODAY.getMonth();
/** How the premium field reads for each way of paying. */
const MODE_SUFFIX: Record<PayMode, string> = { annual: "a year", half: "every 6 months", quarter: "a quarter", month: "a month" };
const MODE_WORD: Record<PayMode, string> = { annual: "yearly", half: "half-yearly", quarter: "quarterly", month: "monthly" };
const perYearOf = (mode: PayMode) => PAY_MODES.find((m) => m.code === mode)?.perYear ?? 1;

/** A per-payment amount moved to another way of paying, the year's premium kept: S$2,400 a year is S$200 a month. */
function convertPayment(value: string, from: PayMode, to: PayMode): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || from === to) return value;
  return String(Math.round(((n * perYearOf(from)) / perYearOf(to)) * 100) / 100);
}

/** A plan's typical premium as one payment: the year's premium split over the payments. */
const typicalPayment = (policy: Policy, perYear: number) => String(Math.round((policy.typical_premium / perYear) * 100) / 100);

interface Row {
  key: number;
  policyId: string;
  /** Which pay option (a term group or a fixed row), by PayOption key. */
  payKey: string;
  /** Premium term as typed, in years; unused for a fixed row. */
  years: string;
  /** One payment as typed, for the way the client pays (the year's premium for a lump sum, one month's for monthly); pre-filled with the policy's typical case until the FC types over it. */
  premium: string;
  premiumTouched: boolean;
  /** Universal life only: the target premium, when lower than the premium. */
  target: string;
  /** A rider: the key of the plan row it is added onto. */
  parent?: number;
  /** How often the client pays; a rider goes with its plan. */
  mode: PayMode;
}

/** The aim chosen in Goals, as the calculator reads it. */
interface ActiveGoal {
  label: string;
  /** null when the aim has no target yet. */
  target: number | null;
  /** Confirmed so far inside the aim's window. */
  achieved: number;
  /** The commission route's credit as MDRT splits it when the aim is a tier (the Risk-Protection floor applies); null otherwise. */
  credit: RouteCredit | null;
  /** What one client like this adds toward it: MDRT commission credit, earnings, gross revenue or Elite credits; null for WAPE, which the Calculator doesn't estimate. */
  per: "mdrt" | "earnings" | "gr" | "elite" | null;
  unit: MetricUnit;
}

function parseMoney(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

let nextKey = 1;

/** The term an option opens with: the longest term it lists. */
function defaultYears(option: PayOption): string {
  if (option.variant) return "";
  return String(Math.max(...option.rows.map((v) => v.term ?? 0)));
}

function rowFor(policy: Policy): Row {
  const { option, years } = defaultPay(policy);
  return {
    key: nextKey++,
    policyId: policy.id,
    payKey: option.key,
    years: years === null ? "" : String(years),
    premium: String(policy.typical_premium),
    premiumTouched: false,
    target: "",
    mode: "annual",
  };
}

/** A row moved to another policy: the typed term and premium carry over when they still apply. `perYear` is how many payments the client makes a year. */
function switchPolicy(row: Row, policy: Policy, perYear: number): Partial<Row> {
  const { option, years } = defaultPay(policy);
  const keep = !option.variant && row.years !== "" && rowForTerm(option, Number(row.years)) !== null;
  return {
    policyId: policy.id,
    payKey: option.key,
    years: keep ? row.years : years === null ? "" : String(years),
    premium: row.premiumTouched ? row.premium : typicalPayment(policy, option.variant?.single ? 1 : perYear),
    target: "",
  };
}

/** The first policy the screen opens with, so it is never empty: the first term plan in the catalogue. */
function firstPolicy(): Policy {
  return CATALOGUE.policies.find((p) => p.category === "Term" && !isRider(p)) ?? CATALOGUE.policies.find((p) => !isRider(p))!;
}

/** A rider row for a plan row: the plan's first rider, on the plan's premium term when the rider's schedule has it, paid the plan's way. */
function riderRowFor(base: Row, rider: Policy): Row {
  const row = { ...rowFor(rider), parent: base.key, mode: base.mode, premium: typicalPayment(rider, perYearOf(base.mode)) };
  const option = payOptionByKey(rider, row.payKey);
  return base.years !== "" && rowForTerm(option, Number(base.years)) ? { ...row, years: base.years } : row;
}

const pctText = (n: number) => `${Number(n.toFixed(2))}%`;
/** A share of a whole as a whole percent, 0 when there is no whole. */
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * The aim chosen in Goals. A tier aim reads the MDRT commission route
 * (threshold of the aimed-for tier over the MDRT production year, credit as
 * MDRT counts it); an Elite or custom aim reads its own figure over its own
 * window, through soloAim.
 */
function activeGoalFor(advisor: Advisor, cases: Case[], goalSet: GoalSet, primary: PrimaryGoal): ActiveGoal {
  if (primary.kind === "tier") {
    const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
    const route = mdrt.routes.find((r) => r.metric === "mdrt_commission")!;
    return { label: `${TIER_LABEL[mdrt.goalTier]} ${MDRT_MEMBERSHIP_YEAR}`, target: route.goalThreshold, achieved: route.achieved, credit: route.credit, per: "mdrt", unit: "sgd" };
  }
  const aim = soloAim(advisor, cases, goalSet, primary, TODAY);
  const per = aim.metric === "commission" ? "earnings" : aim.metric === "gross_revenue" ? "gr" : aim.metric === "elite" ? "elite" : null;
  return { label: aim.name, target: aim.target, achieved: aim.achieved, credit: null, per, unit: aim.unit };
}

// ───────────────────────── Small parts ─────────────────────────

/** A compact money field: "S$" inside a rounded, hairlined input. */
function MoneyField({ id, value, onChange, className = "" }: { id: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <span aria-hidden="true" className="tnum pointer-events-none absolute left-[13px] text-[15px] font-semibold text-faint">
        S$
      </span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        className="tnum w-full rounded-xl border border-line bg-surface py-2.5 pl-[42px] pr-3.5 text-[16px] font-semibold text-ink transition-[border-color,box-shadow] duration-150 placeholder:font-normal placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
      />
    </div>
  );
}

function ChevronIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CaretIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </svg>
  );
}

/** A white card for one step. The step that answers the question ("What you earn") gets the brand border. */
function StepCard({ children, highlight = false, label }: { children: ReactNode; highlight?: boolean; label?: string }) {
  return (
    <section aria-label={label} className={`flex flex-col gap-3.5 rounded-2xl bg-surface p-4 ${highlight ? "border-2 border-accent" : "border border-line"}`}>
      {children}
    </section>
  );
}

/** A step's number (or "+" for an optional one), its title and anything on the right. */
function StepHead({ step, title, aside }: { step?: number | "+"; title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {step !== undefined && (
        <span
          aria-hidden="true"
          className={`tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${step === "+" ? "bg-well text-muted" : "bg-brand text-white"}`}
        >
          {step}
        </span>
      )}
      <h2 className="m-0 min-w-0 flex-1 text-[16px] font-extrabold text-ink">{title}</h2>
      {aside}
    </div>
  );
}

/** Two to four choices in a grey track, the chosen one lifted onto white. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  small = false,
}: {
  label: string;
  options: { value: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
  /** 12px labels, for four choices on a phone. */
  small?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-xl bg-well p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-[9px] px-1 py-1 font-extrabold leading-tight ${small ? "whitespace-nowrap text-[12px]" : "text-[13px]"} ${on ? "bg-surface text-accent shadow-[0_1px_2px_rgba(20,35,94,.18)]" : "text-muted"}`}
          >
            {o.label}
            {o.sub && <span className={`block text-[10.5px] font-semibold ${on ? "text-accent/80" : "text-faint"}`}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A number of years with − and + either side; the figure can be typed too. */
function YearsStepper({ id, label, value, onChange, pill = true }: { id: string; label: string; value: string; onChange: (v: string) => void; pill?: boolean }) {
  const n = Number(value);
  const step = (d: number) => onChange(String(Math.min(Math.max((Number.isFinite(n) && n > 0 ? n : 0) + d, 1), 99)));
  const btn = "flex w-11 shrink-0 items-center justify-center text-[20px] font-bold text-accent disabled:text-faint";
  return (
    <div
      className={`flex items-stretch border border-hairline bg-surface focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/16 ${pill ? "h-11 rounded-full" : "h-12 rounded-xl"}`}
    >
      <button type="button" aria-label="One year less" onClick={() => step(-1)} disabled={!(n > 1)} className={btn}>
        −
      </button>
      <div className="flex min-w-16 flex-1 items-center justify-center gap-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={value}
          placeholder="—"
          aria-label={label}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
          className="tnum w-[2.2ch] bg-transparent text-right text-[16px] font-extrabold text-ink placeholder:text-faint focus:outline-none"
        />
        <span aria-hidden="true" className="text-[16px] font-extrabold text-ink">
          yrs
        </span>
      </div>
      <button type="button" aria-label="One year more" onClick={() => step(1)} className={btn}>
        +
      </button>
    </div>
  );
}

/** A small uppercase tag: the insurer, the MDRT category. */
function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`rounded px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[.04em] ${tone}`}>{children}</span>;
}

/** Every company the catalogue lists, with its plans (riders are added onto a plan, not picked here; none yet for a schedule still to come). */
const COMPANIES = insurerList().map((c) => ({ ...c, policies: c.policies.filter((p) => !isRider(p)) }));

/** Each insurer's tag colour, by its place in the catalogue's list. */
const INSURER_TONES = ["bg-warn/12 text-gold-ink", "bg-flag/10 text-flag", "bg-well text-body"];
const insurerTone = (insurer: string) => INSURER_TONES[Math.max(COMPANIES.findIndex((c) => c.name === insurer), 0) % INSURER_TONES.length]!;

/** Plans with money from an insurer incentive running today (information-only ones aside). */
const moneyIncentives = (p: Policy) => incentivesOnPolicy(p, TODAY).filter((i) => i.kind !== "info");

/** A plan's name without its insurer at the front, for tight spaces. */
const shortName = (p: Policy) => (p.name.startsWith(`${p.insurer} `) ? p.name.slice(p.insurer.length + 1) : p.name);

/** Broad types of plan for the picker's filter, from the schedule's own categories (first match wins). */
const PLAN_TYPES: { label: string; test: RegExp }[] = [
  { label: "Term", test: /^term/i },
  { label: "Critical illness", test: /critical/i },
  { label: "Whole life", test: /^whole life/i },
  { label: "Investment", test: /investment/i },
  { label: "Universal life", test: /universal life/i },
  { label: "Savings & income", test: /endowment|retirement|income|savings/i },
  { label: "Health", test: /hospital|health|accident|shield/i },
];
const typeOf = (p: Policy) => PLAN_TYPES.find((t) => t.test.test(p.category))?.label ?? "Other";
const TYPE_ORDER = [...PLAN_TYPES.map((t) => t.label), "Other"];

/** A pay option's label for a segmented control: "Regular pay" → "Regular", "Single pay (premium term 1 year)" → "Single"; "5 pay" stays. */
function shortPayLabel(label: string): string {
  const bare = label.replace(/\s*\(.*\)\s*$/, "");
  const word = bare.replace(/\s+(pay|premium)$/i, "");
  return /^\d/.test(word) ? bare : word;
}

/** Opens the insurer's circular, when the catalogue says where it is. */
function CircularLink({ href, label = "Read the circular" }: { href?: string; label?: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] font-semibold text-accent underline-offset-2 hover:underline">
      {label}
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M4.5 2.5h5v5M9.5 2.5L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

/** What the client gets from the insurer's customer campaigns on this plan: a cashback, a discount, passes. */
function ClientRewards({ rewards, variant, premium }: { rewards: ClientReward[]; variant: PolicyVariant; premium: number }) {
  if (rewards.length === 0) return null;
  return (
    <section aria-label="For your client" className="rounded-xl border border-gold/50 bg-gold-soft px-3 py-2.5">
      <div className="text-[11px] font-bold uppercase tracking-[.08em] text-gold-ink">For your client</div>
      <ul className="mt-1.5 flex flex-col divide-y divide-gold/30">
        {rewards.map((r) => {
          const value = clientRewardValue(r, variant, premium);
          return (
            <li key={r.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold leading-snug text-ink">{r.name}</div>
                  <div className="text-[11px] text-muted">
                    {r.insurer} · {r.coming_soon ? "coming soon" : `ends ${isoShort(r.period[1])}`}
                  </div>
                </div>
                {r.coming_soon ? (
                  <span className="shrink-0 rounded-full bg-surface px-2 py-[3px] text-[11px] font-bold text-muted">Coming soon</span>
                ) : (
                  value !== null &&
                  value > 0 && (
                    <div className="shrink-0 text-right">
                      <div className="tnum text-[16px] font-bold leading-tight text-gold-ink">{sgd(value)}</div>
                      <div className="text-[10.5px] text-muted">to the client</div>
                    </div>
                  )
                )}
              </div>
              <p className="mt-1 text-[12px] leading-[1.45] text-body">{r.detail}</p>
              {value !== null && value > 0 && r.value?.kind === "months_premium" && (
                <p className="tnum mt-1 text-[11.5px] leading-[1.45] text-gold-ink">
                  Here: {r.value.months} {r.value.months === 1 ? "month" : "months"} of {sgd(premium)} a year = {sgd(value)}.
                </p>
              )}
              {r.conditions && r.conditions.length > 0 && (
                <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-[11px] leading-[1.45] text-muted">
                  {r.conditions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              {r.circular && (
                <div className="mt-1">
                  <CircularLink href={r.circular} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ───────────────────────── One policy ─────────────────────────

interface Resolved {
  row: Row;
  policy: Policy;
  option: PayOption;
  /** null when the typed term has no row in the schedule. */
  variant: PolicyVariant | null;
  /** The year's premium: one payment times the payments a year (a single premium as it is). */
  premium: number;
  /** One payment as the client makes it. */
  payment: number;
  incentives: Incentive[];
  /** The client's side: the insurer's customer campaigns on this plan. */
  rewards: ClientReward[];
}

/** How the client pays for a row and how much of year 1 lands in this production year: a rider goes with its plan. */
interface PaySchedule {
  mode: PayMode;
  single: boolean;
  paid: number;
  of: number;
  share: number;
}

/** One row's figures: the plan or rider, its quote (null without a schedule row) and how it is paid. */
interface Computed {
  r: Resolved;
  q: Quote | null;
  pay: PaySchedule;
}

/** In words, how the client pays and what of the first year lands by 31 Dec: "Monthly from this month: 4 of 12 payments by 31 Dec". */
function payText(pay: PaySchedule): string {
  if (pay.single) return "A single premium is paid at once, so all of it counts this year";
  if (pay.of === 1) return "A lump sum for the year is paid at once, so all of it counts this year";
  const mode = PAY_MODES.find((m) => m.code === pay.mode)!;
  const rest = pay.of - pay.paid;
  return `${mode.label} from this month (${MONTHS[THIS_MONTH]}): ${pay.paid === pay.of ? `all ${pay.of}` : `${pay.paid} of ${pay.of}`} payments land by 31 Dec${rest > 0 ? `; the other ${rest} count next year` : ""}`;
}

/**
 * What a row brings in by 31 Dec: commission and uplift on the payments made
 * by then, cash incentives in full. MDRT and Elite count this part; the
 * first-year commission (FYC) shown to the FC is the whole first year.
 */
function sprintOf(c: Computed & { q: Quote }) {
  const { q, pay, r } = c;
  const uplift = q.lines.filter((l) => l.kind === "uplift").reduce((t, l) => t + l.amount, 0);
  const cash = q.lines.filter((l) => l.kind === "cash").reduce((t, l) => t + l.amount, 0);
  const commissionGr = q.base * pay.share;
  const incentiveGr = uplift * pay.share + cash;
  return {
    premium: r.premium * pay.share,
    commissionGr,
    commissionToYou: commissionGr * q.share,
    incentiveGr,
    incentiveToYou: incentiveGr * q.share,
    toYou: (commissionGr + incentiveGr) * q.share,
    /** Elite credits: the first-year GR (commission and uplift) on the payments made by 31 Dec. */
    elite: q.elite * pay.share,
  };
}

/** What the FC can change on an incentive: their other APE this quarter, and a one-off reward they say applies. */
interface IncentiveInputs {
  quarter: Record<string, string>;
  setQuarter: (id: string, value: string) => void;
  flatOn: Record<string, boolean>;
  setFlat: (id: string, on: boolean) => void;
}

/**
 * Every insurer incentive (bonus campaign) running on a plan or rider, one
 * panel each: what the campaign is, whether this case qualifies, what the FC
 * earns from it, and a link to the circular.
 */
function IncentivePanels({ r, q, inputs }: { r: Resolved; q: Quote; inputs: IncentiveInputs }) {
  return (
    <div className="flex flex-col gap-2">
      {r.incentives.map((i) => {
        const line = q.lines.find((l) => l.id === i.id);
        const note = q.notes.find((n) => n.id === i.id);
        const flatElsewhere = i.kind === "flat_cash" && !line && !!inputs.flatOn[i.id];
        const status: { text: string; tone: "ok" | "warn" | "muted" | "accent" } = line
          ? { text: "This case qualifies", tone: "ok" }
          : flatElsewhere
            ? { text: "Paid once, on another policy here", tone: "muted" }
            : note?.kind === "short"
              ? { text: "Not yet", tone: "warn" }
              : note?.kind === "toggle"
                ? { text: "Only if this applies to you", tone: "warn" }
                : note?.kind === "credits"
                  ? { text: "Trip credits, no cash", tone: "accent" }
                  : note?.kind === "ineligible"
                    ? { text: "This option doesn't qualify", tone: "muted" }
                    : { text: "Not worked out here", tone: "muted" };
        const toneClass = { ok: "bg-ok/12 text-ok-ink", warn: "bg-warn/12 text-gold-ink", muted: "bg-well text-muted", accent: "bg-accent-soft text-accent" }[status.tone];
        return (
          <section key={i.id} aria-label={i.name} className={`rounded-xl border bg-surface px-3 py-2.5 ${line ? "border-ok/45" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-bold leading-snug text-ink">{i.name}</div>
                <div className="text-[11px] text-muted">
                  {i.insurer} · ends {isoShort(i.period[1])}
                </div>
              </div>
              <div className="shrink-0 text-right">
                {line ? (
                  <>
                    <div className="tnum text-[16px] font-bold leading-tight text-ok">+{sgd(line.amount * q.share)}</div>
                    <div className="text-[10.5px] text-muted">you earn</div>
                  </>
                ) : note?.potential && !flatElsewhere ? (
                  <>
                    <div className="tnum text-[16px] font-bold leading-tight text-muted">+{sgd(note.potential * q.share)}</div>
                    <div className="text-[10.5px] text-muted">once it qualifies</div>
                  </>
                ) : (
                  <div className="text-[13px] font-semibold text-muted">—</div>
                )}
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
              <span className={`rounded-full px-2 py-[3px] text-[11px] font-bold ${toneClass}`}>{status.text}</span>
              <CircularLink href={i.circular} />
            </div>
            <p className="mt-1.5 text-[12px] leading-[1.45] text-body">{i.detail}</p>
            {line && (
              <p className="tnum mt-1 text-[11.5px] leading-[1.45] text-ok-ink">
                Here: {line.detail} = {sgd(line.amount)} to the firm, your {(q.share * 100).toFixed(2)}% is {sgd(line.amount * q.share)}.
              </p>
            )}
            {line?.next && <p className="tnum mt-1 text-[11.5px] leading-[1.45] text-body">Next tier: {line.next}.</p>}
            {!line && note && note.kind !== "info" && note.kind !== "toggle" && <p className="tnum mt-1 text-[11.5px] leading-[1.45] text-gold-ink">{note.detail}</p>}
            {i.kind === "flat_cash" && (
              <label className="mt-2 flex items-start gap-2 text-[12px] font-semibold text-body">
                <input type="checkbox" checked={!!inputs.flatOn[i.id]} onChange={(e) => inputs.setFlat(i.id, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]" />
                {i.flat.toggle}
              </label>
            )}
            {i.quarter_input && (
              <div className="mt-2">
                <label htmlFor={`quarter-${r.row.key}-${i.id}`} className="text-[11.5px] text-muted">
                  {i.quarter_input}
                </label>
                <MoneyField id={`quarter-${r.row.key}-${i.id}`} value={inputs.quarter[i.id] ?? ""} onChange={(v) => inputs.setQuarter(i.id, v)} className="mt-1" />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The pay options as the design shows them: a segmented control when they are few and short, else a dropdown. */
function PayOptionPicker({ id, policy, option, onPick }: { id: string; policy: Policy; option: PayOption; onPick: (o: PayOption) => void }) {
  const options = payOptions(policy);
  if (options.length < 2) {
    return option.variant ? (
      <div className="text-[12px] text-muted">
        {policy.variant_label}: <span className="font-semibold text-body">{option.variant.label}</span>
      </div>
    ) : null;
  }
  const label = policy.variant_label === "Premium term" ? "Premium type" : policy.variant_label;
  const short = options.map((o) => shortPayLabel(o.label));
  if (options.length <= 3 && short.every((s) => s.length <= 14)) {
    return <Segmented label={label} value={option.key} options={options.map((o, n) => ({ value: o.key, label: short[n]! }))} onChange={(k) => onPick(options.find((o) => o.key === k)!)} />;
  }
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-bold text-ink">
        {label}
      </label>
      <div className="relative mt-1.5">
        <select
          id={id}
          value={option.key}
          onChange={(e) => onPick(options.find((o) => o.key === e.target.value)!)}
          className="w-full appearance-none rounded-xl border border-hairline bg-surface py-[11px] pl-3.5 pr-9 text-[14px] font-semibold text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
          <CaretIcon />
        </span>
      </div>
    </div>
  );
}

/** Where a row lands in the schedule, or why it doesn't. */
function ScheduleRow({ r, compact = false }: { r: Resolved; compact?: boolean }) {
  const { row, policy, option, variant } = r;
  const years = Number(row.years);
  if (variant) {
    return (
      <span className={compact ? "" : "text-[12px] leading-[1.45] text-muted"}>
        Schedule row: <b className="text-body">{variant.label}</b> · pays {pctText(variant.years[0] ?? 0)} {compact ? "in year 1" : "of the premium in year 1"}
      </span>
    );
  }
  return (
    <span role="alert" className="rounded-lg bg-flag/8 px-3 py-2 text-[11.5px] leading-[1.45] text-flag">
      {row.years === "" ? "Type the premium term in years." : `The schedule has no rate for ${row.years} ${years === 1 ? "year" : "years"}.`}{" "}
      {option.label === "Regular premium" || option.label === policy.variant_label ? "It" : option.label} lists {termsText(option)}.
    </span>
  );
}

/** Each rider group the plan's schedule lists, one to pick; its own premium (paid the plan's way) and term; its first-year commission to you. */
function RiderBlock({
  c,
  n,
  multi,
  groups,
  mode,
  onPatch,
  removeButton,
}: {
  c: Computed;
  n: number;
  multi: boolean;
  groups: Policy[];
  /** How the client pays the plan, and so the rider. */
  mode: PayMode;
  onPatch: (p: Partial<Row>) => void;
  removeButton: ReactNode;
}) {
  const { r, q } = c;
  const { row, policy, option } = r;
  const single = r.variant?.single ?? option.variant?.single ?? false;
  return (
    <div className={`flex flex-col gap-3 ${multi && n > 1 ? "border-t border-line pt-3.5" : ""}`}>
      {multi && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">Rider {n}</span>
          {removeButton}
        </div>
      )}
      <div role="radiogroup" aria-label={`Rider ${n}`} className="flex flex-col overflow-hidden rounded-xl border border-line">
        {groups.map((g, i) => {
          const on = g.id === policy.id;
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPatch(switchPolicy(row, g, perYearOf(mode)))}
              className={`flex min-h-[52px] items-center gap-2.5 px-3 py-2.5 text-left ${i > 0 ? "border-t border-well" : ""} ${on ? "bg-accent-soft/60" : "bg-surface hover:bg-canvas"}`}
            >
              <span aria-hidden="true" className={`box-border h-[18px] w-[18px] shrink-0 rounded-full ${on ? "border-[5px] border-accent" : "border-[1.5px] border-hairline"}`} />
              <span className={`text-[13px] leading-[18px] text-ink ${on ? "font-extrabold" : "font-medium"}`}>{g.short_name ?? g.name}</span>
            </button>
          );
        })}
      </div>
      <PayOptionPicker
        id={`pay-${row.key}`}
        policy={policy}
        option={option}
        onPick={(o) => onPatch({ payKey: o.key, years: o.variant ? "" : rowForTerm(o, Number(row.years)) ? row.years : defaultYears(o) })}
      />
      <div className={`grid gap-2.5 ${option.variant ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`premium-${row.key}`} className="text-[13px] font-bold text-ink">
            Rider premium
          </label>
          <div className="flex h-12 items-center gap-1.5 rounded-xl border-[1.5px] border-accent bg-surface px-3 focus-within:ring-[3px] focus-within:ring-accent/16">
            <span aria-hidden="true" className="text-[15px] font-bold text-faint">
              S$
            </span>
            <input
              id={`premium-${row.key}`}
              type="number"
              inputMode="decimal"
              min={0}
              value={row.premium}
              placeholder="0"
              onChange={(e) => onPatch({ premium: e.target.value, premiumTouched: e.target.value !== "" })}
              className="tnum w-full min-w-0 bg-transparent text-[18px] font-extrabold text-ink placeholder:text-faint focus:outline-none"
            />
            <span className="whitespace-nowrap text-[11px] text-muted">{single ? "once" : MODE_SUFFIX[mode]}</span>
          </div>
        </div>
        {!option.variant && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[13px] font-bold text-ink">Rider term</span>
            <YearsStepper id={`years-${row.key}`} label="Rider term in years" value={row.years} onChange={(v) => onPatch({ years: v })} pill={false} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-[10px] bg-canvas px-3 py-2.5 text-[12px] leading-[1.45] text-muted">
        <span className="min-w-0 flex-1">
          <ScheduleRow r={r} compact />
        </span>
        {q && <b className="tnum shrink-0 text-accent">+{sgd(q.base * q.share)} FYC</b>}
      </div>
    </div>
  );
}

/** One policy as numbered steps: ① the plan, ② the premium as the client pays it, riders, ③ what you earn (FYC) and what counts by 31 Dec. */
function PolicyBlock({
  n,
  total,
  plan,
  riders,
  band,
  inputs,
  onPatch,
  onSetMode,
  onRemove,
  onAddRider,
  onRemoveRider,
  onChangePlan,
}: {
  n: number;
  total: number;
  plan: Computed;
  riders: Computed[];
  band: BandingCode;
  inputs: IncentiveInputs;
  onPatch: (key: number, p: Partial<Row>) => void;
  /** How the client pays: the plan's and its riders' payments are converted, the year's premium kept. */
  onSetMode: (mode: PayMode) => void;
  onRemove: () => void;
  onAddRider: () => void;
  onRemoveRider: (key: number) => void;
  onChangePlan: () => void;
}) {
  const { r, pay } = plan;
  const { row, policy, option, variant } = r;
  const single = variant?.single ?? option.variant?.single ?? false;
  const groups = ridersFor(policy);
  const items = [plan, ...riders];
  const quoted = items.filter((c): c is Computed & { q: Quote } => c.q !== null);
  const share = quoted[0]?.q.share ?? fcShare(band);
  // The FC's figure is the first-year commission (FYC), however the client pays; incentives are shown on top.
  const commissionGr = quoted.reduce((t, c) => t + c.q.base, 0);
  const fyc = commissionGr * share;
  const incentiveYear = quoted.reduce((t, c) => t + (c.q.gr - c.q.base) * c.q.share, 0);
  const paymentTotal = quoted.reduce((t, c) => t + c.r.payment, 0);
  const yearPremium = quoted.reduce((t, c) => t + c.r.premium, 0);
  const grPct = Math.min(pctOf(commissionGr, yearPremium), 100);
  const youPct = Math.min(pctOf(fyc, yearPremium), grPct);
  // Toward the year-end goals: only what the client pays by 31 Dec.
  const mdrtIn = quoted.reduce((t, c) => t + c.q.mdrtCommission * c.pay.share, 0);
  const eliteIn = quoted.reduce((t, c) => t + sprintOf(c).elite, 0);
  const withIncentives = quoted.filter((c) => c.r.incentives.length > 0);
  const money = moneyIncentives(policy);
  const firstEnd = money.map((i) => i.period[1]).sort()[0];
  const others = (COMPANIES.find((c) => c.name === policy.insurer)?.policies ?? []).filter((p) => p.id !== policy.id && moneyIncentives(p).length > 0).length;
  const nameOf = (c: Computed) => (c === plan ? shortName(policy) : (c.r.policy.short_name ?? c.r.policy.name));
  const removeRider = (c: Computed) => (
    <button type="button" onClick={() => onRemoveRider(c.r.row.key)} className="h-9 shrink-0 rounded-full bg-flag/8 px-3 text-[12px] font-extrabold text-flag hover:bg-flag/15">
      Remove rider
    </button>
  );
  const lumpSum = single || pay.of === 1;

  return (
    <div className="flex flex-col gap-3">
      {total > 1 && (
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <span className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
            Policy {n} of {total}
          </span>
          <button type="button" onClick={onRemove} className="h-8 rounded-full bg-flag/8 px-3 text-[12px] font-extrabold text-flag hover:bg-flag/15">
            Remove policy
          </button>
        </div>
      )}

      <StepCard label={`Policy ${n}: choose the plan`}>
        <StepHead step={1} title="Choose the plan" />
        <button type="button" onClick={onChangePlan} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface px-3.5 py-3 text-left hover:border-accent">
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="flex flex-wrap items-center gap-1.5">
              <Tag tone={insurerTone(policy.insurer)}>{policy.insurer}</Tag>
              <Tag tone="bg-well text-body">{typeOf(policy)}</Tag>
              <Tag tone="bg-accent-soft text-accent">{MDRT_CATEGORY_LABEL[policy.mdrt_category]}</Tag>
            </span>
            <span className="text-[16px] font-extrabold leading-[21px] text-ink">{shortName(policy)}</span>
            <span className="text-[12px] leading-[1.4] text-muted">
              {money.length > 0 ? (
                <span className="font-bold text-ok-ink">
                  {money.length === 1 ? "An insurer incentive" : `${money.length} insurer incentives`} running · ends {isoShort(firstEnd!).replace(/ \d{4}$/, "")}
                </span>
              ) : (
                <>
                  No incentive on this plan now
                  {others > 0 && (
                    <>
                      {" · "}
                      <span className="font-bold text-ok-ink">
                        {others} {policy.insurer} {others === 1 ? "plan has" : "plans have"} one
                      </span>
                    </>
                  )}
                </>
              )}
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-extrabold text-accent">Change</span>
        </button>
        {policy.status && <p className="rounded-lg bg-warn/9 px-3 py-2 text-[11.5px] leading-[1.45] text-gold-ink">{policy.status}</p>}
        <PayOptionPicker
          id={`pay-${row.key}`}
          policy={policy}
          option={option}
          onPick={(o) =>
            onPatch(row.key, {
              payKey: o.key,
              years: o.variant ? "" : rowForTerm(o, Number(row.years)) ? row.years : defaultYears(o),
              // A single premium is one payment: the year's figure, whatever the way of paying was.
              ...(o.variant?.single && row.mode !== "annual" ? { mode: "annual" as PayMode, premium: convertPayment(row.premium, row.mode, "annual") } : {}),
            })
          }
        />
        {!option.variant && (
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[13px] font-bold text-ink">{/investment/i.test(policy.variant_label) ? "Investment period" : "Premium term"}</span>
            <YearsStepper
              id={`years-${row.key}`}
              label={/investment/i.test(policy.variant_label) ? "Investment period in years" : "Premium term in years"}
              value={row.years}
              onChange={(v) => onPatch(row.key, { years: v })}
            />
          </div>
        )}
        <ScheduleRow r={r} />
      </StepCard>

      <StepCard label={`Policy ${n}: the premium`}>
        <StepHead step={2} title={single ? "Enter the single premium" : "Enter the premium"} />
        {!single && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold text-ink">Client pays</span>
            <Segmented
              label="Client pays"
              small
              value={row.mode}
              options={PAY_MODES.map((m) => ({ value: m.code, label: m.label, sub: m.perYear === 1 ? "lump sum" : `${m.perYear} payments` }))}
              onChange={onSetMode}
            />
          </div>
        )}
        <div className="flex h-[60px] items-center gap-1.5 rounded-[14px] border-2 border-accent bg-surface px-4 focus-within:ring-[3px] focus-within:ring-accent/16">
          <span aria-hidden="true" className="text-[20px] font-bold text-faint">
            S$
          </span>
          <input
            id={`premium-${row.key}`}
            type="number"
            inputMode="decimal"
            min={0}
            value={row.premium}
            placeholder="0"
            aria-label={single ? "Single premium in Singapore dollars" : `Premium ${MODE_SUFFIX[row.mode]} in Singapore dollars`}
            onChange={(e) => onPatch(row.key, { premium: e.target.value, premiumTouched: e.target.value !== "" })}
            className="tnum w-full min-w-0 bg-transparent text-[28px] font-extrabold text-ink placeholder:text-faint focus:outline-none"
          />
          <span className="whitespace-nowrap text-[12px] text-muted">{single ? "once" : MODE_SUFFIX[row.mode]}</span>
        </div>
        <p className="-mt-1 text-[12px] leading-[17px] text-muted">
          {single ? "Type the single premium from the client's quote." : row.mode === "annual" ? "Type the year's premium, paid at once." : `Type each ${MODE_WORD[row.mode]} payment from the client's quote; the first comes in this month.`}{" "}
          Everything below updates as you type.
        </p>
        {policy.target_premium && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`target-${row.key}`} className="text-[13px] font-bold text-ink">
                Target premium a year
              </label>
              <span className="shrink-0 text-[11px] text-muted">optional, if below the premium</span>
            </div>
            <MoneyField id={`target-${row.key}`} value={row.target} onChange={(v) => onPatch(row.key, { target: v })} className="mt-1.5" />
          </div>
        )}
        {policy.riders_in_premium && <p className="text-[12px] leading-[1.45] text-muted">Its riders pay this plan's rates: include their premium here.</p>}
        {variant && <ClientRewards rewards={r.rewards} variant={variant} premium={r.premium} />}
      </StepCard>

      {groups.length > 0 && (
        <StepCard label={`Policy ${n}: riders`}>
          <StepHead
            step="+"
            title={
              <>
                Riders <span className="text-[12px] font-semibold text-faint">optional</span>
              </>
            }
            aside={riders.length === 1 ? removeRider(riders[0]!) : undefined}
          />
          {riders.map((c, i) => (
            <RiderBlock
              key={c.r.row.key}
              c={c}
              n={i + 1}
              multi={riders.length > 1}
              groups={groups}
              mode={row.mode}
              onPatch={(p) => onPatch(c.r.row.key, p)}
              removeButton={removeRider(c)}
            />
          ))}
          {riders.length < groups.length && (
            <button
              type="button"
              onClick={onAddRider}
              className="flex items-center gap-3 rounded-xl border-[1.5px] border-dashed border-pend bg-accent-soft/60 px-3.5 py-3 text-left hover:bg-accent-soft"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-extrabold text-accent">{riders.length > 0 ? "Add another rider" : `Add a rider to ${shortName(policy)}`}</span>
                <span className="text-[12px] text-muted">
                  {groups.length} rider {groups.length === 1 ? "group" : "groups"} on this plan · each has its own premium
                </span>
              </span>
              <span aria-hidden="true" className="text-[22px] font-bold text-accent">
                +
              </span>
            </button>
          )}
        </StepCard>
      )}

      <StepCard highlight label={`Policy ${n}: what you earn`}>
        <StepHead step={3} title="What you earn" aside={<span className="shrink-0 text-[12px] text-muted">Band {band}</span>} />
        {quoted.length === 0 ? (
          <p className="text-[13px] leading-[1.45] text-muted">Pick a term the schedule lists to see the figures.</p>
        ) : (
          <>
            <div className="flex flex-col">
              <span className="text-[13px] text-muted">First-year commission (FYC) to you</span>
              <span className="tnum text-[52px] font-extrabold leading-[58px] tracking-[-.03em] text-accent">{sgd(fyc)}</span>
              <span className="tnum text-[13px] leading-[1.45] text-muted">
                {single ? (
                  <>
                    On the single premium of <b className="text-ink">{sgd(yearPremium)}</b>.
                  </>
                ) : lumpSum ? (
                  <>
                    On the year's <b className="text-ink">{sgd(yearPremium)}</b>, paid at once.
                  </>
                ) : (
                  <>
                    <b className="text-ink">{sgd(fyc / pay.of)}</b> from each {MODE_WORD[row.mode]} payment of {sgd(paymentTotal)}, over {pay.of} payments.
                  </>
                )}
                {incentiveYear > 0 && (
                  <>
                    {" "}
                    Plus <b className="text-ok">{sgd(incentiveYear)}</b> from insurer incentives.
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 rounded-xl bg-ok/10 px-3 py-2.5">
              <span className="text-[11px] font-bold uppercase tracking-[.08em] text-ok-ink">Toward your goals by 31 Dec</span>
              <div className="grid grid-cols-2 gap-2">
                <span className="flex flex-col">
                  <span className="text-[11.5px] text-ok-ink">MDRT commission</span>
                  <span className="tnum text-[20px] font-extrabold leading-tight text-ok-ink">+{sgd(mdrtIn)}</span>
                </span>
                <span className="flex flex-col">
                  <span className="text-[11.5px] text-ok-ink">Elite credits</span>
                  <span className="tnum text-[20px] font-extrabold leading-tight text-ok-ink">+{count(eliteIn)}</span>
                </span>
              </div>
              <span className="tnum text-[11.5px] leading-[1.45] text-ok-ink">{payText(pay)}.</span>
            </div>

            {(riders.length > 0 || incentiveYear > 0) && (
              <div className="tnum flex flex-col gap-1.5 rounded-[10px] bg-canvas px-3 py-2.5 text-[13px]">
                {quoted.map((c) => (
                  <span key={c.r.row.key} className="flex gap-3">
                    <span className="min-w-0 flex-1 truncate text-body">{nameOf(c)}</span>
                    <b className="shrink-0 text-ink">{sgd(c.q.base * c.q.share)}</b>
                  </span>
                ))}
                {incentiveYear > 0 && (
                  <span className="flex gap-3">
                    <span className="min-w-0 flex-1 text-body">Insurer incentives</span>
                    <b className="shrink-0 text-ok">+{sgd(incentiveYear)}</b>
                  </span>
                )}
              </div>
            )}

            {yearPremium > 0 && (
              <div className="flex flex-col gap-2.5">
                <span className="tnum text-[13px] font-extrabold text-ink">Where the first year's {sgd(yearPremium)} goes</span>
                <div
                  className="flex h-7 gap-[2px] overflow-hidden rounded-lg"
                  role="img"
                  aria-label={`To you ${youPct}%, finexis share and deductions ${grPct - youPct}%, stays with the insurer ${100 - grPct}%`}
                >
                  <span className="bg-accent" style={{ width: `${youPct}%` }} />
                  <span className="bg-pend" style={{ width: `${grPct - youPct}%` }} />
                  <span className="flex-1" style={HATCH} />
                </div>
                <div className="flex flex-col">
                  <SplitRow swatch={<span className="h-3 w-3 shrink-0 rounded-[3px] bg-accent" />} title="To you" sub={`${pctText(share * 100)} of gross revenue at Band ${band}`} value={sgd(fyc)} pct={youPct} strong />
                  <SplitRow swatch={<span className="h-3 w-3 shrink-0 rounded-[3px] bg-pend" />} title="finexis share and deductions" sub="the rest of the gross revenue" value={sgd(commissionGr - fyc)} pct={grPct - youPct} />
                  <SplitRow
                    swatch={<span className="h-3 w-3 shrink-0 rounded-[3px]" style={HATCH_KEY} />}
                    title="Stays with the insurer"
                    sub="not paid out as commission"
                    value={sgd(Math.max(yearPremium - commissionGr, 0))}
                    pct={100 - grPct}
                    last
                  />
                </div>
              </div>
            )}

            {withIncentives.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-extrabold text-ink">Insurer incentives</span>
                  <span className={`tnum shrink-0 text-[14px] font-extrabold ${incentiveYear > 0 ? "text-ok" : "text-muted"}`}>{incentiveYear > 0 ? `+${sgd(incentiveYear)} to you` : "S$0 so far"}</span>
                </div>
                {withIncentives.map((c) => (
                  <div key={c.r.row.key} className="flex flex-col gap-1.5">
                    {c !== plan && <span className="truncate text-[11px] font-bold uppercase tracking-[.08em] text-muted">On the rider: {nameOf(c)}</span>}
                    <IncentivePanels r={c.r} q={c.q} inputs={inputs} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </StepCard>
    </div>
  );
}

/** "Stays with the insurer": grey stripes, in the bar and its key. */
const HATCH = { background: "repeating-linear-gradient(135deg, var(--color-line) 0 4px, var(--color-canvas) 4px 8px)" } as const;
const HATCH_KEY = { background: "repeating-linear-gradient(135deg, var(--color-hairline) 0 2px, var(--color-canvas) 2px 4px)" } as const;

/** One line of "Where the premium goes": key, who, the amount and its share of the premium. */
function SplitRow({ swatch, title, sub, value, pct, strong = false, last = false }: { swatch: ReactNode; title: string; sub: string; value: string; pct: number; strong?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 py-2 ${last ? "" : "border-b border-well"}`}>
      {swatch}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[14px] text-ink ${strong ? "font-extrabold" : "font-bold"}`}>{title}</span>
        <span className="tnum text-[12px] text-muted">{sub}</span>
      </span>
      <span className="tnum flex shrink-0 flex-col items-end">
        <span className={`text-[15px] font-extrabold ${strong ? "text-accent" : "text-ink"}`}>{value}</span>
        <span className="text-[11px] text-faint">{pct}%</span>
      </span>
    </div>
  );
}

// ───────────────────────── Sheets: the plan picker, what's running ─────────────────────────

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="shrink-0 text-accent">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SheetHeader({ title, sub, onDone }: { title: string; sub?: string; onDone: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[18px] font-extrabold text-ink">{title}</h2>
        {sub && <div className="tnum text-[12px] text-muted">{sub}</div>}
      </div>
      <button type="button" onClick={onDone} className="h-10 shrink-0 rounded-full bg-accent-soft px-4 text-[14px] font-bold text-accent hover:bg-accent/15">
        Done
      </button>
    </div>
  );
}

/** A row of filter chips that scrolls sideways when it runs out of room. */
function ChipRow({ label, options, value, onChange }: { label: string; options: { value: string; label: string; disabled?: boolean }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-[74px] shrink-0 text-[11px] font-bold uppercase tracking-[.06em] text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="-mr-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-4 [scrollbar-width:none]">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              onClick={() => onChange(o.value)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-[7px] text-[12px] font-bold ${on ? "border-brand bg-brand text-white" : "border-line bg-surface text-body"} disabled:text-faint`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Pick a plan: search by name, and filter by provider and type of plan. */
function PlanPicker({ open, current, onClose, onPick }: { open: boolean; current: Policy | null; onClose: () => void; onPick: (p: Policy) => void }) {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [type, setType] = useState("all");
  const inProvider = COMPANIES.filter((c) => provider === "all" || c.name === provider).flatMap((c) => c.policies);
  const types = TYPE_ORDER.filter((t) => inProvider.some((p) => typeOf(p) === t));
  const typeInUse = types.includes(type) ? type : "all";
  const filtered = inProvider.filter((p) => typeInUse === "all" || typeOf(p) === typeInUse);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length === 0 ? filtered : filtered.filter((p) => words.every((w) => `${p.insurer} ${p.name} ${p.category}`.toLowerCase().includes(w)));
  // Grouped by provider when every provider is in, else by the schedule's category.
  const groups =
    provider === "all"
      ? COMPANIES.map((c) => ({ label: c.name, policies: shown.filter((p) => p.insurer === c.name) })).filter((g) => g.policies.length > 0)
      : categoriesOf(shown);
  const close = () => {
    setQuery("");
    onClose();
  };
  const item = (p: Policy) => {
    const on = p.id === current?.id;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => {
          onPick(p);
          close();
        }}
        aria-current={on || undefined}
        className={`flex w-full items-center gap-3 border-t border-line px-4 py-2.5 text-left first:border-t-0 ${on ? "bg-accent-soft/60" : "bg-surface hover:bg-canvas"}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-bold leading-snug text-ink">{shortName(p)}</span>
          <span className="text-[11.5px] text-muted">
            {p.category} · {MDRT_CATEGORY_LABEL[p.mdrt_category]}
          </span>
        </span>
        {on && <CheckIcon />}
      </button>
    );
  };
  return (
    <Sheet open={open} onClose={close} label="Choose the plan" height="92dvh">
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line px-4 pb-3 pt-2">
        <SheetHeader title="Choose the plan" sub={`${shown.length} ${shown.length === 1 ? "plan" : "plans"}`} onDone={close} />
        <div className="relative flex items-center">
          <svg className="pointer-events-none absolute left-3 text-muted" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.8" />
            <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            placeholder="Search policies"
            aria-label="Search policies"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-xl border border-hairline bg-surface pl-9 pr-3 text-[15px] font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
          />
        </div>
        <ChipRow
          label="Provider"
          value={provider}
          onChange={setProvider}
          options={[{ value: "all", label: "All" }, ...COMPANIES.map((c) => ({ value: c.name, label: c.policies.length === 0 ? `${c.name} (to come)` : c.name, disabled: c.policies.length === 0 }))]}
        />
        <ChipRow label="Type" value={typeInUse} onChange={setType} options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t }))]} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6" aria-label="Matching policies">
        {shown.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted">{words.length > 0 ? `No plan matches “${query.trim()}” here.` : "No plan of this type here."}</p>
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3 className="bg-canvas px-4 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-muted">{g.label}</h3>
              {g.policies.map(item)}
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}

/**
 * The plans with an insurer incentive running today, by provider: what runs
 * on each and when it ends, with a link to the circular to read more. Folded
 * to one line until tapped.
 */
function IncentivesRunning() {
  const [open, setOpen] = useState(false);
  const running = incentivesRunning(TODAY);
  if (running.length === 0) return null;
  const groups = COMPANIES.map((c) => ({
    insurer: c.name,
    plans: c.policies.map((p) => ({ p, items: running.filter((i) => i.targets.some((t) => t.policy === p.id)) })).filter((x) => x.items.length > 0),
  })).filter((g) => g.plans.length > 0);
  const planCount = groups.reduce((t, g) => t + g.plans.length, 0);
  const ends = new Map<string, number>();
  for (const i of running) ends.set(i.period[1], (ends.get(i.period[1]) ?? 0) + 1);
  const [topEnd, topCount] = [...ends.entries()].sort((a, b) => b[1] - a[1])[0]!;
  const day = (iso: string) => isoShort(iso).replace(/ \d{4}$/, "");
  const endsText = running.length === 1 ? `ends ${day(topEnd)}` : topCount === running.length ? `all end ${day(topEnd)}` : `most end ${day(topEnd)}`;
  return (
    <section aria-label="Incentives running now" className="overflow-hidden rounded-[14px] border border-ok/30 bg-ok/7">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok-ink">
          <StarIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-extrabold text-ink">
            Incentives running now on {planCount} {planCount === 1 ? "plan" : "plans"}
          </span>
          <span className="truncate text-[12px] text-ok-ink">
            {groups.map((g) => g.insurer).join(" and ")} · {endsText}
          </span>
        </span>
        <ChevronIcon className={`text-muted transition-transform duration-200 ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <div className="drop-in border-t border-ok/20 bg-surface">
          {groups.map((g) => (
            <div key={g.insurer}>
              <h3 className="bg-canvas px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[.08em] text-muted">{g.insurer}</h3>
              {g.plans.map(({ p, items }) => {
                const links = items.map((i) => i.circular).filter((h, n, all): h is string => !!h && all.indexOf(h) === n);
                // Without a link yet, the circular's short name (its source up to the first comma) says where to look.
                const sources = items.map((i) => i.source.split(",")[0]!).filter((x, n, all) => all.indexOf(x) === n);
                const end = items.map((i) => i.period[1]).sort()[0]!;
                return (
                  <div key={p.id} className="flex items-start gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold leading-snug text-ink">{shortName(p)}</div>
                      <div className="tnum text-[11.5px] leading-[1.4] text-muted">
                        {items.length === 1 ? "1 incentive" : `${items.length} incentives`} · ends {day(end)}
                      </div>
                      <div className="truncate text-[11px] leading-[1.4] text-faint">{items.map((i) => i.name).join(" · ")}</div>
                      {links.length === 0 && <div className="truncate text-[11px] leading-[1.4] text-faint">Circular: {sources.join("; ")}</div>}
                    </div>
                    {links.length > 0 && (
                      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                        {links.map((h) => (
                          <CircularLink key={h} href={h} label="Circular" />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Calculator({
  advisor,
  cases,
  goalSet,
  primary,
  band,
  onGoToGoals,
  personal = true,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  primary: PrimaryGoal;
  /** The FC's own band: the Calculator works at it alone. */
  band: BandingCode;
  onGoToGoals: () => void;
  /** False in a manager's team view: the policies and their figures only, none of the viewer's own goals. */
  personal?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => [rowFor(firstPolicy())]);
  /** Per tiered incentive: APE or APE credits from the FC's other cases this quarter. */
  const [quarter, setQuarter] = useState<Record<string, string>>({});
  /** One-off rewards the FC says they qualify for. */
  const [flatOn, setFlatOn] = useState<Record<string, boolean>>({});
  /** The plan row whose plan the picker is changing, while it is open. */
  const [picking, setPicking] = useState<number | null>(null);

  // ── Per-row maths. Tiered incentives look across the rows: each row's tier counts the others. ──
  const resolved: Resolved[] = rows.map((row) => {
    const policy = policyById(row.policyId)!;
    const option = payOptionByKey(policy, row.payKey);
    const variant = rowForTerm(option, Number(row.years));
    // A rider is paid the plan's way: one payment times the payments a year makes the year's premium.
    const planRow = row.parent !== undefined ? (rows.find((x) => x.key === row.parent) ?? row) : row;
    const single = variant?.single ?? option.variant?.single ?? false;
    const payment = parseMoney(row.premium);
    return {
      row,
      policy,
      option,
      variant,
      premium: payment * (single ? 1 : perYearOf(planRow.mode)),
      payment,
      incentives: variant ? incentivesFor(policy, variant, TODAY) : [],
      rewards: variant ? clientRewardsFor(policy, variant, TODAY) : [],
    };
  });
  /** A rider is paid with its plan: it takes the plan's mode and month. */
  const payOf = (r: Resolved): PaySchedule => {
    const plan = r.row.parent !== undefined ? (rows.find((x) => x.key === r.row.parent) ?? r.row) : r.row;
    const single = r.variant?.single ?? r.option.variant?.single ?? false;
    const inYear = single ? { paid: 1, of: 1, share: 1 } : paidInYear(plan.mode, THIS_MONTH);
    return { mode: plan.mode, single, ...inYear };
  };
  const quarterIncentives = new Map<string, Incentive>();
  for (const r of resolved) for (const i of r.incentives) if (i.quarter_input) quarterIncentives.set(i.id, i);
  const flatIncentives = new Map<string, Incentive>();
  for (const r of resolved) for (const i of r.incentives) if (i.kind === "flat_cash") flatIncentives.set(i.id, i);
  /** What a row contributes toward an incentive's quarter figure: APE credits for tiers, APE for thresholds. */
  const contribution = (r: Resolved, i: Incentive) =>
    !r.variant ? 0 : i.kind === "ape_cash" ? apeCredits(i, r.policy, r.variant, r.premium, TODAY) : i.kind === "sales_cash" && r.policy.insurer === i.insurer ? apeOf(r.variant, r.premium) : 0;
  /** A plan and the riders added onto it are one policy: per-policy tiers count them together. */
  const policyOf = (r: Resolved) => r.row.parent ?? r.row.key;
  // A one-off reward goes on the row where it is largest, once.
  const flatRow = new Map<string, number>();
  for (const [id, i] of flatIncentives) {
    if (!flatOn[id] || i.kind !== "flat_cash") continue;
    let best = -1;
    let bestAmount = 0;
    resolved.forEach((r, n) => {
      const a = r.incentives.some((x) => x.id === id) ? (i.flat.amount[r.policy.id] ?? 0) : 0;
      if (a > bestAmount) {
        best = n;
        bestAmount = a;
      }
    });
    if (best >= 0) flatRow.set(id, best);
  }
  const computed: Computed[] = resolved.map((r, n) => {
    const pay = payOf(r);
    if (!r.variant) return { r, q: null, pay };
    const quarterOther: Record<string, number> = {};
    for (const [id, i] of quarterIncentives) {
      const others = resolved.reduce((t, o, m) => (m === n ? t : t + contribution(o, i)), 0);
      quarterOther[id] = parseMoney(quarter[id] ?? "") + others;
    }
    const policyOther: Record<string, number> = {};
    for (const i of r.incentives) {
      if (i.kind !== "ape_cash" || i.ape.basis !== "per_policy") continue;
      policyOther[i.id] = resolved.reduce((t, o, m) => (m !== n && policyOf(o) === policyOf(r) ? t + contribution(o, i) : t), 0);
    }
    const flat = [...flatRow.entries()].filter(([, row]) => row === n).map(([id]) => id);
    const q = quote({ policy: r.policy, variant: r.variant, premium: r.premium, targetPremium: parseMoney(r.row.target) || null, band, today: TODAY, quarterOther, policyOther, flatOn: flat });
    return { r, q, pay };
  });
  const plans = computed.filter((c) => c.r.row.parent === undefined);
  const ridersOf = (key: number) => computed.filter((c) => c.r.row.parent === key);

  const quotes = computed.map((c) => c.q).filter((q): q is Quote => q !== null);
  // By 31 Dec: commission on the payments made by then, cash incentives in full.
  const sprints = computed.filter((c): c is Computed & { q: Quote } => c.q !== null).map(sprintOf);
  const totalGr = sprints.reduce((t, s) => t + s.commissionGr + s.incentiveGr, 0);
  const totalEarnings = sprints.reduce((t, s) => t + s.toYou, 0);
  const totalElite = sprints.reduce((t, s) => t + s.elite, 0);
  const totalFyc = quotes.reduce((t, q) => t + q.base * q.share, 0);
  // MDRT credits what the client pays inside the production year, and only the schedule's commission.
  const mdrtIn = (category: "risk_protection" | "other", figure: "mdrtCommission" | "mdrtPremium") =>
    computed.filter((c) => c.r.policy.mdrt_category === category).reduce((t, c) => t + (c.q ? c.q[figure] * c.pay.share : 0), 0);
  const mdrtRisk = mdrtIn("risk_protection", "mdrtCommission");
  const mdrtOther = mdrtIn("other", "mdrtCommission");
  const premRisk = mdrtIn("risk_protection", "mdrtPremium");
  const premOther = mdrtIn("other", "mdrtPremium");
  const filledPlans = plans.filter((c) => c.q && c.q.gr > 0).length;
  const filledRiders = computed.filter((c) => c.q && c.q.gr > 0 && c.r.row.parent !== undefined).length;

  // ── The goal set in Goals, what this case adds to it, and the other aim under it ──
  const goal = activeGoalFor(advisor, cases, goalSet, primary);
  const target = goal.target ?? 0;
  // A tier aim counts MDRT commission credit (the schedule's commission, not incentives); the others count their own figure.
  const perClient = goal.per === "mdrt" ? mdrtRisk + mdrtOther : goal.per === "earnings" ? totalEarnings : goal.per === "gr" ? totalGr : goal.per === "elite" ? totalElite : 0;
  const withCase = goal.credit
    ? (() => {
        const c = goal.credit;
        const risk = c.risk + mdrtRisk;
        const other = c.other + mdrtOther;
        return risk >= c.riskFloor ? risk + other : risk;
      })()
    : goal.achieved + perClient;
  const needed = goal.credit ? clientsNeededOnRoute(goal.credit, target, mdrtRisk, mdrtOther) : clientsNeeded(Math.max(target - goal.achieved, 0), perClient);
  const gfmt = (v: number) => fmtMetric(v, goal.unit);
  const nowPct = target > 0 ? Math.min(goal.achieved / target, 1) : 0;
  const afterPct = target > 0 ? Math.min(withCase / target, 1) : 0;

  let verdict: { figure: string | null; text: ReactNode };
  if (goal.target === null || target <= 0) {
    verdict = { figure: null, text: "No target set yet. Set one in Goals to see how many clients like this reach it." };
  } else if (goal.achieved >= target && (!goal.credit || goal.credit.gatesMet)) {
    verdict = { figure: null, text: <b>{goal.label} reached already.</b> };
  } else if (goal.per === null) {
    verdict = { figure: null, text: "The Calculator doesn't estimate this goal." };
  } else if (needed === null) {
    verdict = {
      figure: "—",
      text: goal.credit && goal.credit.riskShortfall > 0 && mdrtRisk === 0 ? "Other Products credit counts only once the Risk-Protection floor is met." : "Enter a premium above.",
    };
  } else if (needed <= 1) {
    verdict = { figure: "0", text: <><b>more clients</b>: this case takes you to {goal.label}</> };
  } else {
    verdict = { figure: String(needed - 1), text: <><b>more {needed - 1 === 1 ? "client" : "clients"} like this</b> to reach {goal.label}</> };
  }

  const eliteNow = { achieved: metricSnapshot(advisor.id, cases, "elite", TODAY, goalSet).achieved, tiers: eliteTiersFor(advisor) };
  const showElite = primary.kind !== "elite";
  const showMdrt = primary.kind !== "tier";
  const mdrtNow = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
  const routeRows = mdrtNow.routes.map((route) => {
    const [risk, other] = route.metric === "mdrt_commission" ? [mdrtRisk, mdrtOther] : [premRisk, premOther];
    return { route, left: Math.max(route.goalThreshold - route.achieved, 0), n: clientsNeededOnRoute(route.credit, route.goalThreshold, risk, other) };
  });
  const mdrtNote = `MDRT and Elite count what the client pays by 31 Dec; MDRT counts the schedule's commission alone. ${plans.map((c) => `${plans.length > 1 ? `${shortName(c.r.policy)}: ` : ""}${payText(c.pay)}.`).join(" ")}`;

  // A plan moved to another product keeps only the riders that go on the new one; removing a plan removes its riders.
  const patch = (key: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)).filter((r) => r.parent !== key || !p.policyId || !!policyById(r.policyId)!.attaches_to?.includes(p.policyId)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key && r.parent !== key));
  const addRider = (baseKey: number) =>
    setRows((rs) => {
      const base = rs.find((r) => r.key === baseKey)!;
      const taken = rs.filter((r) => r.parent === baseKey).map((r) => r.policyId);
      const groups = ridersFor(policyById(base.policyId)!);
      const rider = groups.find((g) => !taken.includes(g.id)) ?? groups[0];
      if (!rider) return rs;
      let at = rs.indexOf(base);
      while (rs[at + 1]?.parent === baseKey) at++;
      return [...rs.slice(0, at + 1), riderRowFor(base, rider), ...rs.slice(at + 1)];
    });
  const usePlan = (key: number | null, p: Policy) => {
    const row = rows.find((r) => r.key === key) ?? rows.find((r) => r.parent === undefined);
    if (row) patch(row.key, switchPolicy(row, p, perYearOf(row.mode)));
  };
  /** How the client pays a plan: its payments and its riders' are converted, the year's premium kept. */
  const setMode = (key: number, mode: PayMode) =>
    setRows((rs) => {
      const from = rs.find((r) => r.key === key)!.mode;
      return rs.map((r) => (r.key === key || r.parent === key ? { ...r, mode, premium: convertPayment(r.premium, from, mode) } : r));
    });
  const incentiveInputs: IncentiveInputs = {
    quarter,
    setQuarter: (id, value) => setQuarter((m) => ({ ...m, [id]: value })),
    flatOn,
    setFlat: (id, on) => setFlatOn((m) => ({ ...m, [id]: on })),
  };
  const countLabel = `${filledPlans} ${filledPlans === 1 ? "policy" : "policies"}${filledRiders > 0 ? ` + ${filledRiders} ${filledRiders === 1 ? "rider" : "riders"}` : ""}`;

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pb-24 pt-4">
        <IncentivesRunning />

        {plans.map((c, i) => (
          <PolicyBlock
            key={c.r.row.key}
            n={i + 1}
            total={plans.length}
            plan={c}
            riders={ridersOf(c.r.row.key)}
            band={band}
            inputs={incentiveInputs}
            onPatch={patch}
            onRemove={() => remove(c.r.row.key)}
            onAddRider={() => addRider(c.r.row.key)}
            onRemoveRider={(key) => remove(key)}
            onChangePlan={() => setPicking(c.r.row.key)}
            onSetMode={(mode) => setMode(c.r.row.key, mode)}
          />
        ))}

        {personal && (
          <StepCard label="What it adds to your goals">
            <StepHead title="What it adds to your goals" />
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "MDRT commission", value: `+${sgd(mdrtRisk + mdrtOther)}` },
                { label: "MDRT premium", value: `+${sgd(premRisk + premOther)}` },
                { label: "Elite credits", value: `+${count(totalElite)}` },
              ].map((t) => (
                <div key={t.label} className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-ok/10 p-2.5">
                  <span className="text-[11px] font-bold leading-tight text-ok-ink">{t.label}</span>
                  <span className={`tnum whitespace-nowrap font-extrabold leading-tight tracking-[-.01em] text-ok-ink ${t.value.length > 8 ? "text-[13px]" : "text-[16px]"}`}>{t.value}</span>
                </div>
              ))}
            </div>
            <p className="-mt-1 text-[11.5px] leading-[1.45] text-muted">
              {mdrtNote}
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-ink">{goal.label}</span>
                <button type="button" onClick={onGoToGoals} className="tnum flex shrink-0 items-center gap-0.5 text-[12px] text-muted hover:text-accent" aria-label="Change the goal in Goals">
                  {goal.target === null ? "no target set" : `goal ${gfmt(goal.target)}`}
                  <ChevronIcon size={12} />
                </button>
              </div>
              {target > 0 && (
                <>
                  <div
                    className="relative h-3 overflow-hidden rounded-full bg-well"
                    role="img"
                    aria-label={`${Math.round(nowPct * 100)}% so far, ${Math.round(afterPct * 100)}% with this case`}
                  >
                    <div className="absolute inset-y-0 left-0 rounded-full bg-[#54d4a0] transition-[width] duration-500" style={{ width: `${afterPct * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${nowPct * 100}%` }} />
                  </div>
                  <div className="tnum flex text-[12px] text-muted">
                    <span className="flex-1">
                      <b className="text-accent">{Math.round(nowPct * 100)}%</b> so far
                    </span>
                    <span>
                      <b className="text-ok-ink">{Math.round(afterPct * 100)}%</b> with this case
                    </span>
                  </div>
                </>
              )}
              <div className="flex items-center gap-3.5 rounded-xl bg-accent-soft p-3.5">
                {verdict.figure !== null && <span className="tnum text-[40px] font-extrabold leading-10 text-accent">{verdict.figure}</span>}
                <span className="text-[13px] leading-[18px] text-ink">{verdict.text}</span>
              </div>
            </div>

            {showMdrt && (
              <div className="flex flex-col">
                <div className="flex items-baseline justify-between gap-2 pb-1.5">
                  <Label>
                    {TIER_LABEL[mdrtNow.goalTier]} {MDRT_MEMBERSHIP_YEAR}
                  </Label>
                  <span className="tnum shrink-0 text-[11px] text-muted">{periodLabel(mdrtNow.period)}</span>
                </div>
                {routeRows.map(({ route, left, n }) => (
                  <div key={route.metric} className="tnum flex min-h-10 items-center gap-2 border-t border-well py-1.5">
                    <span className="min-w-0 flex-1 text-[14px] font-bold text-ink">{route.label} route</span>
                    {left <= 0 && route.credit.gatesMet ? (
                      <span className="text-[13px] font-bold text-ok">Reached</span>
                    ) : (
                      <>
                        <span className="text-right text-[12px] text-muted">{sgd(left)} to go</span>
                        <span className="w-[76px] shrink-0 text-right text-[13px] text-muted">
                          <b className="text-accent">{n ?? "—"}</b> {n === 1 ? "client" : "clients"}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showElite && (
              <div className="flex flex-col">
                <div className="flex items-baseline justify-between gap-2 pb-1.5">
                  <Label>finexis {ELITE.name}</Label>
                  <span className="tnum shrink-0 text-[11px] text-muted">{count(eliteNow.achieved)} credits now</span>
                </div>
                {tiersInView(eliteNow.tiers, eliteNow.achieved).map((t) => {
                  const left = t.credits - eliteNow.achieved;
                  const n = clientsNeeded(left, totalElite);
                  return (
                    <div key={t.code} className="tnum flex min-h-10 items-center gap-2 border-t border-well py-1.5">
                      <span className="min-w-0 flex-1 text-[14px] font-bold text-ink">{t.name}</span>
                      {left <= 0 ? (
                        <span className="text-[13px] font-bold text-ok">Reached</span>
                      ) : (
                        <>
                          <span className="text-right text-[12px] text-muted">{count(left)} credits to go</span>
                          <span className="w-[76px] shrink-0 text-right text-[13px] text-muted">
                            <b className="text-accent">{n ?? "—"}</b> {n === 1 ? "client" : "clients"}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </StepCard>
        )}

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, rowFor(firstPolicy())])}
          className="h-12 w-full rounded-xl border-[1.5px] border-dashed border-pend bg-accent-soft/60 text-[13px] font-extrabold text-accent hover:bg-accent-soft"
        >
          + Add another policy
        </button>

        <p className="m-0 px-1 text-[11px] leading-4 text-faint">
          {CATALOGUE_IS_PRIVATE ? `Rates and incentives from the insurers' ${CATALOGUE.version} schedules and circulars.` : "Rates and incentives here are a made-up sample."} Banding rates are placeholders.
          Nothing here is saved.
        </p>
      </div>

      <PlanPicker
        open={picking !== null}
        current={picking !== null ? (policyById(rows.find((r) => r.key === picking)?.policyId ?? "") ?? null) : null}
        onClose={() => setPicking(null)}
        onPick={(p) => usePlan(picking, p)}
      />
      <section
        aria-label="Total per client"
        className="fixed inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom))] z-10 mx-auto flex w-full max-w-[430px] items-center gap-3 bg-brand-hover px-4 py-3 text-white"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[11px] font-extrabold uppercase tracking-[.08em] text-white/78">{countLabel} · first-year commission</span>
          <span className="tnum truncate text-[12px] text-[#54d4a0]">
            By 31 Dec: +{sgd(mdrtRisk + mdrtOther)} MDRT · +{count(totalElite)} Elite
          </span>
        </div>
        <span className="tnum shrink-0 text-[26px] font-extrabold leading-none">{sgd(totalFyc)}</span>
      </section>
    </>
  );
}
