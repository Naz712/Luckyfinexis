// The Calculator: build a client's case from the insurers' schedules before
// meeting them, in the order the business asked for: company and product
// (dropdowns), annual premium, premium term. The term is typed in years and
// lands on the schedule row that covers it. Each policy then shows four
// figures: ① the FC's commission at the schedule's rate, ② the insurer's
// running incentives, ③ MDRT credit and ④ Finexis Elite credits, with the
// distance left to the next tier. Riders are added onto their plan, from the
// riders the schedule lists for it. The full breakdown (later years, incentive
// conditions, the schedule's fine print) opens under the card. Nothing here
// is saved.
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
import { count, fmtMetric, pct, periodLabel, sgd } from "../lib/format";
import {
  apeCredits,
  apeOf,
  CATALOGUE,
  CATALOGUE_IS_PRIVATE,
  categoriesOf,
  defaultPay,
  incentivesFor,
  insurerList,
  isoShort,
  isRider,
  payOptionByKey,
  payOptions,
  policyById,
  quote,
  ridersFor,
  rowForTerm,
  termsText,
  type Incentive,
  type PayOption,
  type Policy,
  type PolicyVariant,
  type Quote,
} from "../lib/policies";
import { ELITE, eliteTiersFor, type EliteTier } from "../lib/elite";
import { Card, Label } from "../components/ui";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;

interface Row {
  key: number;
  policyId: string;
  /** Which pay option (a term group or a fixed row), by PayOption key. */
  payKey: string;
  /** Premium term as typed, in years; unused for a fixed row. */
  years: string;
  /** Premium as typed; pre-filled with the policy's typical case until the FC types over it. */
  premium: string;
  premiumTouched: boolean;
  /** Universal life only: the target premium, when lower than the premium. */
  target: string;
  /** A rider: the key of the plan row it is added onto. */
  parent?: number;
}

/** The aim chosen in Goals, as the calculator reads it. */
interface ActiveGoal {
  label: string;
  /** null when the aim has no target yet. */
  target: number | null;
  /** Confirmed so far inside the aim's window. */
  achieved: number;
  /** "commission route, Jan–Dec 2026" / "Q4 2026, starts 1 Oct". */
  window: string;
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
  return { key: nextKey++, policyId: policy.id, payKey: option.key, years: years === null ? "" : String(years), premium: String(policy.typical_premium), premiumTouched: false, target: "" };
}

/** A row moved to another policy: the typed term and premium carry over when they still apply. */
function switchPolicy(row: Row, policy: Policy): Partial<Row> {
  const { option, years } = defaultPay(policy);
  const keep = !option.variant && row.years !== "" && rowForTerm(option, Number(row.years)) !== null;
  return {
    policyId: policy.id,
    payKey: option.key,
    years: keep ? row.years : years === null ? "" : String(years),
    premium: row.premiumTouched ? row.premium : String(policy.typical_premium),
    target: "",
  };
}

/** The first policy the screen opens with, so it is never empty: the first term plan in the catalogue. */
function firstPolicy(): Policy {
  return CATALOGUE.policies.find((p) => p.category === "Term" && !isRider(p)) ?? CATALOGUE.policies.find((p) => !isRider(p))!;
}

/** A rider row for a plan row: the plan's first rider, on the plan's premium term when the rider's schedule has it. */
function riderRowFor(base: Row, rider: Policy): Row {
  const row = { ...rowFor(rider), parent: base.key };
  const option = payOptionByKey(rider, row.payKey);
  return base.years !== "" && rowForTerm(option, Number(base.years)) ? { ...row, years: base.years } : row;
}

/** "share × (band − deduction) = N% of gross revenue", in the payout formula's own figures. */
function formulaText(band: BandingCode, share: number): string {
  const f = CATALOGUE.fc_formula;
  if (f.share === 1 && f.band_deduction === 0) return `${pct(share)} of gross revenue at ${band}`;
  const rate = share / f.share + f.band_deduction;
  return `${f.share} × (${Math.round(rate * 100)}% − ${Math.round(f.band_deduction * 100)}%) = ${(share * 100).toFixed(2)}% of gross revenue`;
}

const pctText = (n: number) => `${Number(n.toFixed(2))}%`;

/**
 * The aim chosen in Goals. A tier aim reads the MDRT commission route
 * (threshold of the aimed-for tier over the MDRT production year, credit as
 * MDRT counts it); an Elite or custom aim reads its own
 * figure over their own window, through soloAim.
 */
function activeGoalFor(advisor: Advisor, cases: Case[], goalSet: GoalSet, primary: PrimaryGoal): ActiveGoal {
  if (primary.kind === "tier") {
    const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
    const route = mdrt.routes.find((r) => r.metric === "mdrt_commission")!;
    return {
      label: `${TIER_LABEL[mdrt.goalTier]} ${MDRT_MEMBERSHIP_YEAR}`,
      target: route.goalThreshold,
      achieved: route.achieved,
      window: `commission route, ${periodLabel(mdrt.period)}`,
      credit: route.credit,
      per: "mdrt",
      unit: "sgd",
    };
  }
  const aim = soloAim(advisor, cases, goalSet, primary, TODAY);
  const per = aim.metric === "commission" ? "earnings" : aim.metric === "gross_revenue" ? "gr" : aim.metric === "elite" ? "elite" : null;
  return {
    label: aim.name,
    target: aim.target,
    achieved: aim.achieved,
    window: periodLabel(aim.period),
    credit: null,
    per,
    unit: aim.unit,
  };
}

/** The design's money field: "S$" prefix inside a rounded, hairlined input. */
function MoneyField({
  id,
  value,
  onChange,
  compact = false,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** The smaller what-if variant (16px, 10px vertical padding). */
  compact?: boolean;
  className?: string;
}) {
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
        className={`tnum w-full rounded-xl border border-line bg-surface pl-[42px] pr-3.5 font-semibold text-ink transition-[border-color,box-shadow] duration-150 placeholder:font-normal placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16 ${
          compact ? "py-2.5 text-[16px]" : "py-[11px] text-[17px]"
        }`}
      />
    </div>
  );
}

/** The premium term in years: a number field with − and + either side. */
function YearsField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const n = Number(value);
  const step = (d: number) => onChange(String(Math.min(Math.max((Number.isFinite(n) && n > 0 ? n : 0) + d, 1), 99)));
  const btn = "flex w-9 shrink-0 items-center justify-center text-[18px] font-semibold text-accent hover:bg-accent-soft disabled:text-faint";
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-line bg-surface focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/16">
      <button type="button" aria-label="One year less" onClick={() => step(-1)} disabled={!(n > 1)} className={btn}>
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        value={value}
        placeholder="yrs"
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
        className="tnum w-full min-w-0 bg-transparent py-[11px] text-center text-[17px] font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:outline-none"
      />
      <button type="button" aria-label="One year more" onClick={() => step(1)} className={btn}>
        +
      </button>
    </div>
  );
}

function ChevronIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

/** A native dropdown styled like the design's fields; `groups` with a label render as optgroups. */
function Dropdown({
  id,
  label,
  value,
  onChange,
  groups,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  groups: { label?: string; options: { value: string; label: string; disabled?: boolean }[] }[];
}) {
  const option = (o: { value: string; label: string; disabled?: boolean }) => (
    <option key={o.value} value={o.value} disabled={o.disabled}>
      {o.label}
    </option>
  );
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block truncate text-[12px] text-muted">
        {label}
      </label>
      <div className="relative mt-[5px]">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none truncate rounded-xl border border-line bg-surface py-[11px] pl-3 pr-8 text-[14px] font-semibold text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
        >
          {groups.map((g) =>
            g.label ? (
              <optgroup key={g.label} label={g.label}>
                {g.options.map(option)}
              </optgroup>
            ) : (
              g.options.map(option)
            ),
          )}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted">
          <CaretIcon />
        </span>
      </div>
    </div>
  );
}

/** Every company the catalogue lists, with its plans (riders are added onto a plan, not picked here; none yet for a schedule still to come). */
const COMPANIES = insurerList().map((c) => ({ ...c, policies: c.policies.filter((p) => !isRider(p)) }));

/** A numbered output, ① to ④, as the business's whiteboard lists them. */
function Step({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="tnum flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">
      {n}
    </span>
  );
}

// ───────────────────────── One policy on the main screen ─────────────────────────

interface Resolved {
  row: Row;
  policy: Policy;
  option: PayOption;
  /** null when the typed term has no row in the schedule. */
  variant: PolicyVariant | null;
  premium: number;
  incentives: Incentive[];
}

/** The four figures, the numbers the business asked for. */
function outputsOf(q: Quote) {
  const incentiveLines = q.lines.filter((l) => l.kind !== "base");
  const incentiveGr = incentiveLines.reduce((t, l) => t + l.amount, 0);
  return { incentiveLines, incentiveGr, commissionToYou: q.base * q.share, incentiveToYou: incentiveGr * q.share };
}

function PolicyCard({
  r,
  q,
  band,
  canRemove,
  onPatch,
  onRemove,
  elite,
  parent,
  onAddRider,
}: {
  r: Resolved;
  q: Quote | null;
  band: BandingCode;
  canRemove: boolean;
  onPatch: (p: Partial<Row>) => void;
  onRemove: () => void;
  /** For a rider: the plan it is added onto. */
  parent: Policy | null;
  /** For a plan with riders in the schedule: adds one under it. */
  onAddRider: (() => void) | null;
  /** The FC's Elite credits so far and the tiers that apply to them, for the distance after this case; null in a manager's team view. */
  elite: { achieved: number; tiers: EliteTier[] } | null;
}) {
  const { row, policy, option, variant } = r;
  const [open, setOpen] = useState(false);
  const nextTier = q && elite ? (elite.tiers.find((t) => t.credits > elite.achieved + q.elite) ?? null) : null;
  const options = payOptions(policy);
  const years = Number(row.years);
  const out = q ? outputsOf(q) : null;
  const single = variant?.single ?? option.variant?.single ?? false;

  return (
    <div className={`overflow-hidden rounded-2xl border bg-surface ${parent ? "ml-5 border-line border-l-[3px] border-l-accent/45" : "border-line"}`}>
      <div className="flex flex-col gap-[11px] px-4 pb-3.5 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[.08em] text-muted">{parent ? `Rider on ${parent.name}` : "Policy"}</span>
          {canRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${policy.name}`} className="shrink-0 text-[11px] font-semibold text-muted hover:text-flag">
              Remove
            </button>
          )}
        </div>

        {/* A rider picks from its plan's riders; a plan from its company's plans, company first, the business's order. */}
        {parent ? (
          <Dropdown
            id={`rider-${row.key}`}
            label="Rider"
            value={policy.id}
            groups={[{ options: ridersFor(parent).map((p) => ({ value: p.id, label: p.short_name ?? p.name })) }]}
            onChange={(id) => onPatch(switchPolicy(row, policyById(id)!))}
          />
        ) : (
          <div className="grid grid-cols-[minmax(0,.8fr)_minmax(0,1.6fr)] gap-2.5">
            <Dropdown
              id={`company-${row.key}`}
              label="Company"
              value={policy.insurer}
              groups={[{ options: COMPANIES.map((c) => ({ value: c.name, label: c.policies.length > 0 ? c.name : `${c.name} (schedule to come)`, disabled: c.policies.length === 0 })) }]}
              onChange={(name) => {
                const first = COMPANIES.find((c) => c.name === name)?.policies[0];
                if (first) onPatch(switchPolicy(row, first));
              }}
            />
            <Dropdown
              id={`policy-${row.key}`}
              label="Product"
              value={policy.id}
              groups={categoriesOf(COMPANIES.find((c) => c.name === policy.insurer)?.policies ?? [policy]).map((g) => ({ label: g.label, options: g.policies.map((p) => ({ value: p.id, label: p.name })) }))}
              onChange={(id) => onPatch(switchPolicy(row, policyById(id)!))}
            />
          </div>
        )}

        {policy.status && <p className="rounded-lg bg-warn/9 px-3 py-2 text-[11.5px] leading-[1.45] text-gold-ink">{policy.status}</p>}

        {options.length > 1 ? (
          <div>
            <div className="text-[12px] text-muted">{policy.variant_label === "Premium term" ? "Premium type" : policy.variant_label}</div>
            {options.length <= 4 ? (
              <div role="radiogroup" aria-label={policy.variant_label} className="mt-[5px] flex flex-wrap gap-1.5">
                {options.map((o) => {
                  const on = o.key === option.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onPatch({ payKey: o.key, years: o.variant ? "" : rowForTerm(o, years) ? row.years : defaultYears(o) })}
                      className={`rounded-full border px-3 py-[6px] text-left text-[12px] font-semibold leading-snug ${on ? "border-brand bg-brand text-white" : "border-line bg-surface text-body"}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="relative mt-[5px]">
                <select
                  id={`pay-${row.key}`}
                  aria-label={policy.variant_label}
                  value={option.key}
                  onChange={(e) => {
                    const o = options.find((x) => x.key === e.target.value)!;
                    onPatch({ payKey: o.key, years: o.variant ? "" : rowForTerm(o, years) ? row.years : defaultYears(o) });
                  }}
                  className="w-full appearance-none rounded-xl border border-line bg-surface py-[11px] pl-3.5 pr-9 text-[14px] font-semibold text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
                >
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        ) : (
          option.variant && (
            <div className="text-[12px] text-muted">
              {policy.variant_label}: <span className="font-semibold text-body">{option.variant.label}</span>
            </div>
          )
        )}

        <div className={`grid gap-2.5 ${option.variant ? "grid-cols-1" : "grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"}`}>
          <div className="min-w-0">
            <label htmlFor={`premium-${row.key}`} className="block truncate text-[12px] text-muted">
              {single ? "Single premium" : "Annual premium"}
            </label>
            <MoneyField id={`premium-${row.key}`} value={row.premium} onChange={(v) => onPatch({ premium: v, premiumTouched: v !== "" })} className="mt-[5px]" />
          </div>
          {!option.variant && (
            <div className="min-w-0">
              <label htmlFor={`years-${row.key}`} className="block truncate text-[12px] text-muted">
                {/investment/i.test(policy.variant_label) ? "Investment period (yrs)" : "Premium term (years)"}
              </label>
              <div className="mt-[5px]">
                <YearsField id={`years-${row.key}`} value={row.years} onChange={(v) => onPatch({ years: v })} />
              </div>
            </div>
          )}
        </div>
        {!option.variant &&
          (variant ? (
            <p className="-mt-1 text-[11.5px] leading-[1.45] text-muted">
              Schedule row: <span className="font-semibold text-body">{variant.label}</span> · {pctText(variant.years[0] ?? 0)} in year 1
            </p>
          ) : (
            <p role="alert" className="-mt-1 rounded-lg bg-flag/8 px-3 py-2 text-[11.5px] leading-[1.45] text-flag">
              {row.years === "" ? "Type the premium term in years." : `The schedule has no rate for ${row.years} ${years === 1 ? "year" : "years"}.`}{" "}
              {option.label === "Regular premium" || option.label === policy.variant_label ? "It" : option.label} lists {termsText(option)}.
            </p>
          ))}
        {!row.premiumTouched && <p className="-mt-1.5 text-[11px] text-muted">Premium pre-filled with a typical case; type the client's.</p>}
        {policy.riders_in_premium && <p className="-mt-1.5 text-[11px] leading-[1.45] text-muted">Its riders pay this plan's rates: include their premium in the annual premium.</p>}
        {policy.target_premium && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`target-${row.key}`} className="text-[12px] text-muted">
                Target premium
              </label>
              <span className="shrink-0 text-[11px] text-muted">optional, if below the premium</span>
            </div>
            <MoneyField id={`target-${row.key}`} value={row.target} onChange={(v) => onPatch({ target: v })} compact className="mt-[5px]" />
          </div>
        )}
      </div>

      {/* ① to ④, the four figures the business asked for. */}
      <div className="border-t border-line bg-canvas px-4 py-3">
        <ul className="flex flex-col gap-2.5">
          <li className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2">
              <Step n={1} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-ink">Commission</span>
                <span className="tnum block text-[11.5px] leading-[1.4] text-muted">
                  {q ? `${q.lines.filter((l) => l.kind === "base").map((l) => l.detail).join(" + ")} = ${sgd(q.base)} GR` : "no schedule row"}
                </span>
              </span>
            </span>
            <span className="tnum shrink-0 text-[14px] font-bold text-ink">{out ? sgd(out.commissionToYou) : "—"}</span>
          </li>
          <li className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2">
              <Step n={2} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-ink">Insurer incentive</span>
                {q && out && out.incentiveLines.length > 0 && (
                  <span className="tnum block text-[11.5px] leading-[1.4] text-muted">{out.incentiveLines.map((l) => `${l.label} ${sgd(l.amount)} GR`).join(" · ")}</span>
                )}
                {q && q.notes.some((n) => n.kind === "short" || n.kind === "toggle") && (
                  <span className="mt-0.5 flex flex-col gap-0.5">
                    {q.notes
                      .filter((n) => n.kind === "short" || n.kind === "toggle")
                      .map((n) => (
                        <span key={n.id} className="line-clamp-2 text-[11px] leading-[1.4] text-muted">
                          <span className="font-semibold text-body">{n.label}:</span> {n.detail}
                        </span>
                      ))}
                  </span>
                )}
                {q && q.notes.some((n) => n.kind !== "short" && n.kind !== "toggle") && (
                  <span className="mt-0.5 block text-[11px] leading-[1.4] text-muted">
                    Also running: {q.notes
                      .filter((n) => n.kind !== "short" && n.kind !== "toggle")
                      .map((n) => n.label)
                      .join(" · ")}
                  </span>
                )}
                {q && out && out.incentiveLines.length === 0 && q.notes.length === 0 && <span className="block text-[11.5px] text-muted">None running on this plan now</span>}
              </span>
            </span>
            <span className={`tnum shrink-0 text-[14px] font-bold ${out && out.incentiveToYou > 0 ? "text-ok" : "text-muted"}`}>{out && out.incentiveToYou > 0 ? `+${sgd(out.incentiveToYou)}` : "—"}</span>
          </li>
          <li className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2">
              <Step n={3} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-ink">MDRT</span>
                <span className="tnum block text-[11.5px] leading-[1.4] text-muted">
                  {q ? `commission credit · ${sgd(q.mdrtPremium)} premium credit · ${MDRT_CATEGORY_LABEL[policy.mdrt_category]}` : MDRT_CATEGORY_LABEL[policy.mdrt_category]}
                </span>
              </span>
            </span>
            <span className="tnum shrink-0 text-[14px] font-bold text-ink">{q ? sgd(q.mdrtCommission) : "—"}</span>
          </li>
          <li className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2">
              <Step n={4} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-ink">Elite credits</span>
                <span className="tnum block text-[11.5px] leading-[1.4] text-muted">
                  {q ? `first-year GR ${sgd(q.fygr)} × ${q.eliteMultiplier}${ELITE.multipliers_confirmed ? "" : " (default for now)"}` : "first-year GR × multiplier"}
                </span>
                {q && elite && (
                  <span className="tnum block text-[11.5px] leading-[1.4] text-accent">
                    {nextTier ? `Then ${count(nextTier.credits - elite.achieved - q.elite)} to ${nextTier.name}` : `Every ${ELITE.name} tier reached with this`}
                  </span>
                )}
              </span>
            </span>
            <span className="tnum shrink-0 text-[14px] font-bold text-ink">{q ? `+${count(q.elite)}` : "—"}</span>
          </li>
        </ul>

        <div className="mt-3 flex items-center justify-between gap-2.5 border-t border-line pt-2.5">
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold text-body">To you, year 1 @ {band}</span>
            <span className="tnum block text-[11px] leading-[1.4] text-muted">{q ? `① + ② · ${formulaText(band, q.share)}` : "—"}</span>
          </span>
          <span className="tnum shrink-0 text-[20px] font-bold text-ink">{q && q.gr > 0 ? sgd(q.earnings) : "—"}</span>
        </div>
      </div>

      {q && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`breakdown-${row.key}`}
            className="flex w-full items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-left text-[12.5px] font-semibold text-accent"
          >
            Full breakdown, later years and fine print
            <span className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
              <CaretIcon />
            </span>
          </button>
          {open && (
            <div id={`breakdown-${row.key}`} className="drop-in border-t border-line">
              <Breakdown r={r} q={q} band={band} />
            </div>
          )}
        </>
      )}
      {onAddRider && (
        <button type="button" onClick={onAddRider} className="flex w-full items-center gap-1.5 border-t border-line px-4 py-2.5 text-left text-[12.5px] font-semibold text-accent hover:bg-accent-soft/50">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add a rider to {policy.name}
        </button>
      )}
    </div>
  );
}

// ───────────────────────── The breakdown, opened under a policy ─────────────────────────

function Section({ n, title, children }: { n?: number; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex items-center gap-2">
        {n !== undefined && <Step n={n} />}
        <Label>{title}</Label>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Line({ label, detail, amount, strong = false }: { label: ReactNode; detail?: ReactNode; amount: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className={`block text-[12.5px] ${strong ? "font-bold text-ink" : "font-semibold text-body"}`}>{label}</span>
        {detail && <span className="tnum block text-[11.5px] leading-[1.45] text-muted">{detail}</span>}
      </span>
      <span className={`tnum shrink-0 ${strong ? "text-[15px] font-bold text-ink" : "text-[13px] font-semibold text-body"}`}>{amount}</span>
    </div>
  );
}

/** Everything behind one policy's figures. */
function Breakdown({ r, q, band }: { r: Resolved; q: Quote; band: BandingCode }) {
  const { policy, variant } = r;
  const out = outputsOf(q);
  const running = variant ? incentivesFor(policy, variant, TODAY) : [];
  const lineFor = (id: string) => q.lines.find((l) => l.id === id);
  const noteFor = (id: string) => q.notes.find((n) => n.id === id);
  const laterEarnings = q.later.reduce((t, l) => t + l.earnings, 0);
  return (
    <div>
      <Section n={1} title="Commission, year 1">
        {q.lines
          .filter((l) => l.kind === "base")
          .map((l) => (
            <Line key={l.id} label={l.label} detail={l.detail} amount={sgd(l.amount)} />
          ))}
        <div className="mt-1 border-t border-line pt-1.5">
          <Line label="Gross revenue from the schedule" amount={sgd(q.base)} strong />
          <Line label={`To you @ ${band}`} detail={formulaText(band, q.share)} amount={sgd(out.commissionToYou)} strong />
        </div>
      </Section>

      <Section n={2} title="Insurer incentives">
        {running.length === 0 ? (
          <p className="text-[12px] leading-normal text-muted">None of the insurer's incentives this quarter covers this plan{variant ? ` on the ${variant.label.toLowerCase()} row` : ""}.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {running.map((i) => {
              const l = lineFor(i.id);
              const n = noteFor(i.id);
              return (
                <div key={i.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink">{i.name}</span>
                      <span className="block text-[11px] text-muted">
                        {i.insurer} · {isoShort(i.period[0])} to {isoShort(i.period[1])}
                      </span>
                    </span>
                    <span className={`tnum shrink-0 text-[13px] font-bold ${l ? "text-ok" : "text-muted"}`}>{l ? `+${sgd(l.amount)} GR` : "—"}</span>
                  </div>
                  <p className="mt-1.5 text-[12px] leading-[1.5] text-body">{i.detail}</p>
                  {l && <p className="tnum mt-1 text-[11.5px] leading-[1.45] text-ok-ink">Here: {l.detail}.</p>}
                  {n && <p className="tnum mt-1 text-[11.5px] leading-[1.45] text-muted">Here: {n.detail}</p>}
                  {i.conditions && i.conditions.length > 0 && (
                    <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-4 text-[11px] leading-[1.45] text-muted">
                      {i.conditions.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {out.incentiveGr > 0 && (
          <div className="mt-2 border-t border-line pt-1.5">
            <Line label="Incentives in gross revenue" amount={sgd(out.incentiveGr)} strong />
            <Line label={`To you @ ${band}`} detail={`the same ${(q.share * 100).toFixed(2)}% as commission`} amount={sgd(out.incentiveToYou)} strong />
          </div>
        )}
      </Section>

      <Section n={3} title="MDRT credit">
        <Line
          label="Commission credit"
          detail={`Your share of year-1 commission (the schedule's rate${out.incentiveLines.some((l) => l.kind === "uplift") ? " and commission uplifts" : ""}); cash incentives don't count.`}
          amount={sgd(q.mdrtCommission)}
        />
        <Line label="Premium credit" detail={variant?.single ? "6% of a single premium." : "The annual premium in full."} amount={sgd(q.mdrtPremium)} />
        <p className="mt-1 text-[11.5px] leading-[1.45] text-muted">
          Counts as {MDRT_CATEGORY_LABEL[policy.mdrt_category]}. MDRT counts Other Products only once Risk-Protection commission reaches its floor.
        </p>
      </Section>

      <Section n={4} title={`Finexis ${ELITE.name}`}>
        <Line label="First-year gross revenue" detail="The schedule's year-1 commission and any commission uplift. Insurer cash incentives and later years don't count toward Elite." amount={sgd(q.fygr)} />
        <Line label="Elite multiplier" detail={ELITE.multipliers_confirmed ? "This product's multiplier." : "Every product at the default until Finexis confirms the multipliers."} amount={`× ${q.eliteMultiplier}`} />
        <div className="mt-1 border-t border-line pt-1.5">
          <Line label="Elite credits" amount={`+${count(q.elite)}`} strong />
        </div>
        <p className="mt-1 text-[11.5px] leading-[1.45] text-muted">{ELITE.basis} Credits count year by year, apart from MDRT.</p>
      </Section>

      {q.later.length > 0 && q.later.some((l) => l.rate > 0) && (
        <Section title="Later years">
          <p className="text-[11.5px] leading-[1.45] text-muted">
            {q.later.length === 1 ? `${policy.onwards ?? "Year 2"} at the schedule's rate: ${sgd(laterEarnings)} a year to you.` : `Years 2 to ${q.later.length + 1} at the schedule's rates${policy.onwards ? ", the last rate continuing" : ""}: ${sgd(laterEarnings)} to you in all.`}
          </p>
          <table className="tnum mt-2 w-full text-[12px] text-muted">
            <thead>
              <tr className="text-left">
                <th className="py-1 font-semibold">Year</th>
                <th className="py-1 text-right font-semibold">Rate</th>
                <th className="py-1 text-right font-semibold">Gross revenue</th>
                <th className="py-1 text-right font-semibold">To you</th>
              </tr>
            </thead>
            <tbody>
              {q.later.map((l) => (
                <tr key={l.year} className="border-t border-well">
                  <td className="py-1.5">{l.year === q.later.length + 1 && policy.onwards ? `${l.year}+` : l.year}</td>
                  <td className="py-1.5 text-right">{Number(l.rate.toFixed(2))}%</td>
                  <td className="py-1.5 text-right">{sgd(l.gr)}</td>
                  <td className="py-1.5 text-right text-body">{sgd(l.earnings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {policy.notes && policy.notes.length > 0 && (
        <Section title="Fine print from the schedule">
          <p className="text-[11.5px] leading-[1.45] text-muted">The insurer's own notes on this plan: top-ups, renewals, clawbacks and promotions that change the figures.</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[12px] leading-[1.5] text-body">
            {policy.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Section>
      )}

      <p className="border-t border-line px-4 py-2.5 text-[11px] leading-normal text-muted">Source: {policy.source}.</p>
    </div>
  );
}

// ───────────────────────── The screen ─────────────────────────

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
  band: BandingCode;
  onGoToGoals: () => void;
  /** False in a manager's team view: the policies and their figures only, none of the viewer's own goal or Elite position. */
  personal?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => [rowFor(firstPolicy())]);
  /** The what-if goal figure while the box is open; null means "use my goals". Never saved. */
  const [whatIf, setWhatIf] = useState<string | null>(null);
  /** Per tiered incentive: APE or APE credits from the FC's other cases this quarter. */
  const [quarter, setQuarter] = useState<Record<string, string>>({});
  /** One-off rewards the FC says they qualify for. */
  const [flatOn, setFlatOn] = useState<Record<string, boolean>>({});

  // ── Per-row maths. Tiered incentives look across the rows: each row's tier counts the others. ──
  const resolved: Resolved[] = rows.map((row) => {
    const policy = policyById(row.policyId)!;
    const option = payOptionByKey(policy, row.payKey);
    const variant = rowForTerm(option, Number(row.years));
    const premium = parseMoney(row.premium);
    return { row, policy, option, variant, premium, incentives: variant ? incentivesFor(policy, variant, TODAY) : [] };
  });
  const quarterIncentives = new Map<string, Incentive>();
  for (const r of resolved) for (const i of r.incentives) if (i.quarter_input) quarterIncentives.set(i.id, i);
  const flatIncentives = new Map<string, Incentive>();
  for (const r of resolved) for (const i of r.incentives) if (i.kind === "flat_cash") flatIncentives.set(i.id, i);
  /** What a row contributes toward an incentive's quarter figure: APE credits for tiers, APE for thresholds. */
  const contribution = (r: Resolved, i: Incentive) =>
    !r.variant ? 0 : i.kind === "ape_cash" ? apeCredits(i, r.policy, r.variant, r.premium) : i.kind === "sales_cash" && r.policy.insurer === i.insurer ? apeOf(r.variant, r.premium) : 0;
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
  const computed = resolved.map((r, n) => {
    if (!r.variant) return { r, q: null };
    const quarterOther: Record<string, number> = {};
    for (const [id, i] of quarterIncentives) {
      const others = resolved.reduce((t, o, m) => (m === n ? t : t + contribution(o, i)), 0);
      quarterOther[id] = parseMoney(quarter[id] ?? "") + others;
    }
    const flat = [...flatRow.entries()].filter(([, row]) => row === n).map(([id]) => id);
    const q = quote({ policy: r.policy, variant: r.variant, premium: r.premium, targetPremium: parseMoney(r.row.target) || null, band, today: TODAY, quarterOther, flatOn: flat });
    return { r, q };
  });

  const quotes = computed.map((c) => c.q).filter((q): q is Quote => q !== null);
  const totalGr = quotes.reduce((t, q) => t + q.gr, 0);
  const totalEarnings = quotes.reduce((t, q) => t + q.earnings, 0);
  const totalMdrtPremium = quotes.reduce((t, q) => t + q.mdrtPremium, 0);
  const totalElite = quotes.reduce((t, q) => t + q.elite, 0);
  const mdrtRisk = computed.filter((c) => c.r.policy.mdrt_category === "risk_protection").reduce((t, c) => t + (c.q?.mdrtCommission ?? 0), 0);
  const mdrtOther = computed.filter((c) => c.r.policy.mdrt_category === "other").reduce((t, c) => t + (c.q?.mdrtCommission ?? 0), 0);
  const filled = computed.filter((c) => c.q && c.q.gr > 0 && c.r.row.parent === undefined).length;
  const filledRiders = computed.filter((c) => c.q && c.q.gr > 0 && c.r.row.parent !== undefined).length;

  // ── The goal set in Goals, and the what-if figure laid over it ──
  const goal = activeGoalFor(advisor, cases, goalSet, primary);
  /** Elite so far and the FC's tiers: each card says how far from the next tier its case leaves them. */
  const eliteNow = { achieved: metricSnapshot(advisor.id, cases, "elite", TODAY, goalSet).achieved, tiers: eliteTiersFor(advisor) };
  const savedTarget = goal.target ?? 0;
  const ratio = goal.target ? Math.min(goal.achieved / goal.target, 1) : 0;
  const toGo = Math.max(savedTarget - goal.achieved, 0);
  const goalNum = whatIf === null ? savedTarget : parseMoney(whatIf);
  const gap = Math.max(goalNum - goal.achieved, 0);
  // A tier aim counts MDRT commission credit (the schedule's commission, not cash incentives); the others count their own figure.
  const perClient = goal.per === "mdrt" ? mdrtRisk + mdrtOther : goal.per === "earnings" ? totalEarnings : goal.per === "gr" ? totalGr : goal.per === "elite" ? totalElite : 0;
  const needed = goal.credit ? clientsNeededOnRoute(goal.credit, goalNum, mdrtRisk, mdrtOther) : clientsNeeded(gap, perClient);
  const gfmt = (v: number) => fmtMetric(v, goal.unit);
  const perWord = { mdrt: " of MDRT commission credit", earnings: " to you", gr: " of gross revenue", elite: " Elite credits" } as const;
  const goalName = whatIf === null ? goal.label : "that figure";
  const floorHolds = goal.credit !== null && goal.credit.riskShortfall > 0 && mdrtOther > 0;

  let verdict: { figure: string; unit: string; note: string; ink: string };
  if (goalNum <= 0) {
    verdict = { figure: "—", unit: "Enter a figure above", note: "With an amount set, this shows how many clients like this one close the gap.", ink: "text-ink" };
  } else if (gap === 0) {
    verdict = { figure: "Goal reached", unit: "", note: `${goalName} is already met. Anything from here is above target.`, ink: "text-ok" };
  } else if (needed === null && floorHolds && mdrtRisk === 0) {
    verdict = {
      figure: "—",
      unit: "Not counted yet",
      note: `Everything here is Other Products credit. MDRT only counts it once ${sgd(goal.credit!.riskShortfall)} more of your commission comes from Risk-Protection products (life, ILPs, CI). Add one above to see the count.`,
      ink: "text-ink",
    };
  } else if (goal.per === null) {
    verdict = { figure: "—", unit: "Not estimated here", note: "WAPE is Finexis's own weighting of premium and comes in the monthly import; the Calculator doesn't estimate it.", ink: "text-ink" };
  } else if (needed === null) {
    verdict = { figure: "—", unit: "Add a policy above", note: "Once a policy has a premium, this shows the number of clients you need.", ink: "text-ink" };
  } else {
    const eliteText = totalElite >= 0.5 && goal.per !== "elite" ? ` and ${count(totalElite)} Elite ${Math.round(totalElite) === 1 ? "credit" : "credits"}` : "";
    verdict = {
      figure: String(needed),
      unit: needed === 1 ? "more client like this" : "more clients like this",
      note: `At ${gfmt(perClient)}${perWord[goal.per]} a client, that closes the ${gfmt(gap)} gap to ${goalName}. Each one also adds ${sgd(totalMdrtPremium)} of MDRT premium credit${eliteText}.${
        floorHolds ? ` ${sgd(mdrtOther)} of each is Other Products credit, which MDRT counts only once Risk-Protection commission reaches ${sgd(goal.credit!.riskFloor)}; the count allows for that.` : ""
      }${goal.credit && totalEarnings > perClient + 0.5 ? ` Cash incentives (${sgd(totalEarnings - perClient)} a client to you) are left out of MDRT credit.` : ""}`,
      ink: "text-accent",
    };
  }

  // A plan moved to another product keeps only the riders that go on the new one; removing a plan removes its riders.
  const patch = (key: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)).filter((r) => r.parent !== key || !p.policyId || !!policyById(r.policyId)!.attaches_to?.includes(p.policyId)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key && r.parent !== key));
  const addRider = (baseKey: number) =>
    setRows((rs) => {
      const base = rs.find((r) => r.key === baseKey)!;
      const rider = ridersFor(policyById(base.policyId)!)[0];
      if (!rider) return rs;
      let at = rs.indexOf(base);
      while (rs[at + 1]?.parent === baseKey) at++;
      return [...rs.slice(0, at + 1), riderRowFor(base, rider), ...rs.slice(at + 1)];
    });
  const plans = rows.filter((r) => r.parent === undefined).length;

  return (
    <>
      <div className="flex flex-col gap-2.5 px-4 pb-24 pt-3">
        {computed.map(({ r, q }) => (
          <PolicyCard
            key={r.row.key}
            r={r}
            q={q}
            band={band}
            canRemove={r.row.parent !== undefined || plans > 1}
            onPatch={(p) => patch(r.row.key, p)}
            onRemove={() => remove(r.row.key)}
            elite={personal ? eliteNow : null}
            parent={r.row.parent !== undefined ? policyById(rows.find((x) => x.key === r.row.parent)!.policyId)! : null}
            onAddRider={r.row.parent === undefined && ridersFor(r.policy).length > 0 ? () => addRider(r.row.key) : null}
          />
        ))}

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, rowFor(firstPolicy())])}
          className="flex w-full items-center justify-center gap-[7px] rounded-2xl border border-dashed border-accent/45 bg-accent-soft/50 p-3.5 text-[14px] font-semibold text-accent hover:border-accent hover:bg-accent-soft"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add another policy
        </button>

        {(quarterIncentives.size > 0 || flatIncentives.size > 0) && (
          <Card>
            <Label>Your quarter so far</Label>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-muted">Some incentives depend on the rest of your quarter. Rows above already count toward each other.</p>
            <div className="mt-2.5 flex flex-col gap-3">
              {[...quarterIncentives.values()].map((i) => (
                <div key={i.id}>
                  <label htmlFor={`quarter-${i.id}`} className="text-[12px] text-muted">
                    {i.quarter_input}
                  </label>
                  <MoneyField id={`quarter-${i.id}`} value={quarter[i.id] ?? ""} onChange={(v) => setQuarter((m) => ({ ...m, [i.id]: v }))} compact className="mt-[5px]" />
                  <p className="mt-1 text-[11px] leading-[1.45] text-muted">{i.detail}</p>
                </div>
              ))}
              {[...flatIncentives.values()].map(
                (i) =>
                  i.kind === "flat_cash" && (
                    <label key={i.id} className="flex items-start gap-2.5 text-[12.5px] text-body">
                      <input type="checkbox" checked={!!flatOn[i.id]} onChange={(e) => setFlatOn((m) => ({ ...m, [i.id]: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
                      <span>
                        <span className="font-semibold">{i.flat.toggle}</span>
                        <span className="block text-[11px] leading-[1.45] text-muted">{i.detail}</span>
                      </span>
                    </label>
                  ),
              )}
            </div>
          </Card>
        )}

        {personal && (
          <Card className="mt-0.5">
            <div className="flex items-baseline justify-between gap-2.5">
              <Label>How far this gets you</Label>
              <button type="button" onClick={onGoToGoals} className="-my-1.5 flex shrink-0 items-center gap-[3px] py-1.5 text-[11px] font-semibold text-accent underline-offset-2 hover:underline">
                Set in Goals
                <ChevronIcon />
              </button>
            </div>

            <div className="mt-2.5 rounded-xl bg-accent-soft px-[13px] py-3">
              <div className="flex items-baseline justify-between gap-[9px]">
                <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{goal.label}</span>
                <span className="tnum shrink-0 text-[15px] font-bold text-accent">{goal.target === null ? "Not set" : gfmt(goal.target)}</span>
              </div>
              <div className="mt-[9px] flex h-1.5 overflow-hidden rounded-full bg-accent/18" role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
                <span className="bg-accent" style={{ width: pct(ratio) }} />
              </div>
              <div className="tnum mt-2 flex items-baseline justify-between gap-[9px] text-[11px] text-muted">
                <span>
                  {gfmt(goal.achieved)} so far · {goal.target === null ? goal.window : `${pct(ratio)} · ${goal.window}`}
                </span>
                <span className="shrink-0">{goal.target === null ? "no target" : toGo === 0 ? "reached" : `${gfmt(toGo)} to go`}</span>
              </div>
            </div>

            {goal.unit !== "sgd" ? null : whatIf === null ? (
              <button type="button" onClick={() => setWhatIf(goal.target === null ? "" : String(goal.target))} className="mt-[9px] text-[11px] font-semibold text-accent">
                Try a different figure
              </button>
            ) : (
              <div className="mt-2.5 rounded-xl border border-dashed border-dash bg-accent-soft/40 px-3 py-[11px]">
                <div className="flex items-baseline justify-between gap-2.5">
                  <label htmlFor="what-if" className="text-[11px] font-bold uppercase tracking-[.06em] text-muted">
                    What if the goal were
                  </label>
                  <button type="button" onClick={() => setWhatIf(null)} className="shrink-0 text-[11px] font-semibold text-accent">
                    Use my goals
                  </button>
                </div>
                <MoneyField id="what-if" value={whatIf} onChange={setWhatIf} compact className="mt-2" />
                <div className="mt-[7px] text-[11px] text-muted">Not saved. Change it for real in Goals.</div>
              </div>
            )}

            <div className="mt-[13px] border-t border-line pt-[13px]">
              <div className="tnum flex flex-wrap items-baseline gap-2">
                <span className={`text-[38px] font-bold leading-none tracking-[-.03em] ${verdict.ink}`}>{verdict.figure}</span>
                {verdict.unit && <span className="text-[14px] font-medium text-body">{verdict.unit}</span>}
              </div>
              <div className="tnum mt-2 text-pretty text-[12px] leading-normal text-muted">{verdict.note}</div>
            </div>

            {totalElite >= 0.5 && (
              <div className="mt-[13px] border-t border-line pt-[11px]">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>Finexis {ELITE.name}</Label>
                  <span className="tnum shrink-0 text-[11px] text-muted">{count(eliteNow.achieved)} credits now</span>
                </div>
                <ul className="mt-1.5 divide-y divide-line">
                  {eliteNow.tiers.map((t) => {
                    const left = t.credits - eliteNow.achieved;
                    const n = clientsNeeded(left, totalElite);
                    return (
                      <li key={t.code} className="tnum flex items-baseline justify-between gap-3 py-1.5 text-[12px]">
                        <span className="font-semibold text-body">{t.name}</span>
                        <span className="text-right text-muted">
                          {left <= 0 ? (
                            <span className="font-semibold text-ok">Reached</span>
                          ) : (
                            <>
                              {count(left)} to go · <span className="font-semibold text-accent">{n}</span> {n === 1 ? "client" : "clients"} like this
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Card>
        )}

        <p className="tnum px-1 pt-0.5 text-center text-pretty text-[11px] leading-normal text-muted">
          {CATALOGUE_IS_PRIVATE
            ? `Rates and incentives from: ${CATALOGUE.sources.join("; ")}. Confidential. Banding rates are placeholders. Nothing here is saved.`
            : "Sample policies and rates, made up for the public site; the real schedules are kept out of it. Banding rates are placeholders. Nothing here is saved."}
        </p>
      </div>

      <section
        aria-label="Total per client"
        className="fixed inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom))] z-10 mx-auto flex w-full max-w-[430px] items-center justify-between gap-3 bg-brand px-5 pb-3 pt-[11px] text-white"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.08em] text-white/72">To you, year 1 per client</div>
          <div className="tnum mt-0.5 truncate text-[11px] text-white/78">
            {filled} {filled === 1 ? "policy" : "policies"}
            {filledRiders > 0 ? ` + ${filledRiders} ${filledRiders === 1 ? "rider" : "riders"}` : ""} · GR {sgd(totalGr)} · MDRT prem. {sgd(totalMdrtPremium)}
            {totalElite >= 0.5 ? ` · Elite +${count(totalElite)}` : ""}
          </div>
        </div>
        <div className="tnum shrink-0 text-[28px] font-bold leading-none tracking-[-.025em]">{sgd(totalEarnings)}</div>
      </section>

    </>
  );
}
