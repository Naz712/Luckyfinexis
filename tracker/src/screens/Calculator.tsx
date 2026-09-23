// The Calculator: build a client's case from the insurers' schedules before
// meeting them. Pick a policy and its option (premium term, plan, MIP) from
// the dropdowns, enter the premium, and each row shows the gross revenue the
// firm earns (the schedule's rate plus the insurer's running incentives) and
// the FC's share of it at the band in the header. Nothing here is saved.
import { useState } from "react";
import { MDRT_MEMBERSHIP_YEAR, TODAY, type Advisor, type BandingCode, type Case } from "../mock/data";
import {
  aggregate,
  clientsNeeded,
  clientsNeededOnRoute,
  goalFor,
  goalPeriod,
  MDRT_CATEGORY_LABEL,
  mdrtSnapshot,
  metricDefinition,
  periodBounds,
  type GoalSet,
  type PrimaryGoal,
  type RouteCredit,
} from "../lib/calc";
import { count, pct, periodLabel, sgd } from "../lib/format";
import {
  apeCredits,
  apeOf,
  CATALOGUE,
  CATALOGUE_IS_PRIVATE,
  defaultVariant,
  incentivesFor,
  policyById,
  policyGroups,
  quote,
  variantById,
  type Incentive,
  type Policy,
  type Quote,
} from "../lib/policies";
import { Card, Label } from "../components/ui";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;

interface Row {
  key: number;
  policyId: string;
  variantId: string;
  /** Premium as typed; pre-filled with the policy's typical case until the FC types over it. */
  premium: string;
  premiumTouched: boolean;
  /** Universal life only: the target premium, when lower than the premium. */
  target: string;
}

/** The one goal set in Goals, as the calculator reads it. */
interface ActiveGoal {
  label: string;
  /** null when a custom aim has no commission target yet. */
  target: number | null;
  /** Confirmed commission inside the goal's window. */
  achieved: number;
  /** "commission route, Jan–Dec 2026" / "Q3 2026". */
  window: string;
  /** The commission route's credit as MDRT splits it when the aim is a tier (the Risk-Protection floor applies); null for the FC's own goal. */
  credit: RouteCredit | null;
}

function parseMoney(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

let nextKey = 1;

function rowFor(policy: Policy): Row {
  return { key: nextKey++, policyId: policy.id, variantId: defaultVariant(policy).id, premium: String(policy.typical_premium), premiumTouched: false, target: "" };
}

/** The first policy the screen opens with, so it is never empty: the first term plan in the catalogue. */
function firstPolicy(): Policy {
  return CATALOGUE.policies.find((p) => p.category === "Term") ?? CATALOGUE.policies[0]!;
}

/** "share × (band − deduction) = N% of gross revenue", in the payout formula's own figures. */
function formulaText(band: BandingCode, share: number): string {
  const f = CATALOGUE.fc_formula;
  if (f.share === 1 && f.band_deduction === 0) return `${pct(share)} of gross revenue at ${band}`;
  const rate = share / f.share + f.band_deduction;
  return `${f.share} × (${Math.round(rate * 100)}% − ${Math.round(f.band_deduction * 100)}%) = ${(share * 100).toFixed(2)}% of gross revenue`;
}

/**
 * The goal chosen in Goals. A tier aim reads the MDRT commission route
 * (threshold of the aimed-for tier over the MDRT production year, credit as
 * MDRT counts it); a custom aim reads the FC's own commission goal over that
 * goal's cadence window.
 */
function activeGoalFor(advisor: Advisor, cases: Case[], goalSet: GoalSet, primary: PrimaryGoal): ActiveGoal {
  const year = TODAY.getFullYear();
  const confirmed = cases.filter((c) => c.status === "confirmed");
  if (primary.kind === "tier") {
    const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, goalSet);
    const route = mdrt.routes.find((r) => r.metric === "mdrt_commission")!;
    return {
      label: `${TIER_LABEL[mdrt.goalTier]} ${MDRT_MEMBERSHIP_YEAR}`,
      target: route.goalThreshold,
      achieved: route.achieved,
      window: `commission route, ${periodLabel(mdrt.period)}`,
      credit: route.credit,
    };
  }
  const goal = goalFor(advisor.id, "commission", year, goalSet.targets);
  const def = metricDefinition("commission");
  const period = goal ? goalPeriod(goal.cadence, def.period_type, TODAY) : periodBounds(def.period_type, TODAY);
  return {
    label: "Your commission goal",
    target: goal ? goal.target_value : null,
    achieved: aggregate(confirmed, "commission", period.start, period.end),
    window: periodLabel(period),
    credit: null,
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

function ChevronIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A native dropdown styled like the design's fields; `groups` renders optgroups. */
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
  groups: { label?: string; options: { value: string; label: string }[] }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[12px] text-muted">
        {label}
      </label>
      <div className="relative mt-[5px]">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-line bg-surface py-[11px] pl-3.5 pr-9 text-[15px] font-semibold text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
        >
          {groups.map((g, n) =>
            g.label ? (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              g.options.map((o) => (
                <option key={`${n}-${o.value}`} value={o.value}>
                  {o.label}
                </option>
              ))
            ),
          )}
        </select>
        <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

const POLICY_GROUPS = policyGroups().map((g) => ({ label: g.label, options: g.policies.map((p) => ({ value: p.id, label: p.name })) }));

/** One policy row: the two dropdowns, the premium, and what it earns. */
function PolicyCard({
  row,
  q,
  band,
  canRemove,
  onPatch,
  onRemove,
}: {
  row: Row;
  q: Quote;
  band: BandingCode;
  canRemove: boolean;
  onPatch: (p: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const policy = policyById(row.policyId)!;
  const variant = variantById(policy, row.variantId);
  const [showLater, setShowLater] = useState(false);
  const laterEarnings = q.later.reduce((t, l) => t + l.earnings, 0);
  // One later rate that carries on ("Year 2 onwards") reads as a yearly figure; several read as a total over the listed years.
  const perYear = q.later.length === 1 && !!policy.onwards;
  const laterText =
    q.later.length === 1 ? `${policy.onwards ?? "Year 2"} at the schedule's rate` : `Years 2–${q.later.length + 1} at the schedule's rates${policy.onwards ? ", the last rate continuing" : ""}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-col gap-[11px] px-4 pb-3.5 pt-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">{policy.insurer}</span>
          {canRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove ${policy.name}`} className="shrink-0 text-[11px] font-semibold text-muted hover:text-flag">
              Remove
            </button>
          )}
        </div>
        <Dropdown
          id={`policy-${row.key}`}
          label="Policy"
          value={row.policyId}
          groups={POLICY_GROUPS}
          onChange={(id) => {
            const p = policyById(id)!;
            onPatch({ policyId: id, variantId: defaultVariant(p).id, premium: row.premiumTouched ? row.premium : String(p.typical_premium), target: "" });
          }}
        />
        {policy.variants.length > 1 ? (
          <Dropdown
            id={`variant-${row.key}`}
            label={policy.variant_label}
            value={variant.id}
            groups={[{ options: policy.variants.map((v) => ({ value: v.id, label: v.label })) }]}
            onChange={(id) => onPatch({ variantId: id })}
          />
        ) : (
          <div className="text-[12px] text-muted">
            {policy.variant_label}: <span className="font-semibold text-body">{variant.label}</span>
          </div>
        )}
        {policy.status && <p className="rounded-lg bg-warn/9 px-3 py-2 text-[11.5px] leading-[1.45] text-gold-ink">{policy.status}</p>}
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`premium-${row.key}`} className="text-[12px] text-muted">
              {variant.single ? "Single premium" : "Annual premium"}
            </label>
            <span className="shrink-0 text-[11px] text-muted">{row.premiumTouched ? "your figure" : "typical case, adjust to yours"}</span>
          </div>
          <MoneyField id={`premium-${row.key}`} value={row.premium} onChange={(v) => onPatch({ premium: v, premiumTouched: v !== "" })} className="mt-[5px]" />
        </div>
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

      <div className="border-t border-line bg-canvas px-4 py-3">
        <ul className="flex flex-col gap-2" aria-label="Gross revenue, year 1">
          {q.lines.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-ink">{l.label}</span>
                  {l.kind !== "base" && <span className="shrink-0 rounded bg-ok/12 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-ok">Incentive</span>}
                </span>
                <span className="tnum block text-[11.5px] leading-[1.4] text-muted">
                  {l.detail}
                  {l.until ? ` · ${l.until}` : ""}
                </span>
              </span>
              <span className="tnum shrink-0 text-[13px] font-semibold text-body">{sgd(l.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
          <span className="text-[12.5px] font-semibold text-ink">Gross revenue, year 1</span>
          <span className="tnum text-[14px] font-bold text-ink">{sgd(q.gr)}</span>
        </div>
        {q.notes.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {q.notes.map((n) => (
              <li key={n.id} className="text-[11px] leading-[1.45] text-muted">
                <span className="font-semibold text-body">{n.label}:</span> {n.detail}
                {n.until ? ` (${n.until})` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2.5 border-t border-line px-4 py-[11px]">
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-body">Your earnings @ {band}</span>
          <span className="tnum block text-[11px] leading-[1.4] text-muted">
            {formulaText(band, q.share)} · {MDRT_CATEGORY_LABEL[policy.mdrt_category]}
            {q.elite >= 0.5 ? ` · Elite +${count(q.elite)}` : ""}
          </span>
        </span>
        <span className="tnum shrink-0 text-[20px] font-bold text-ink">{q.gr > 0 ? sgd(q.earnings) : "—"}</span>
      </div>

      {q.later.length > 0 && q.later.some((l) => l.rate > 0) && (
        <div className="border-t border-line px-4 py-2.5">
          <button type="button" onClick={() => setShowLater((s) => !s)} aria-expanded={showLater} className="flex w-full items-center justify-between gap-2 text-left">
            <span className="text-[12px] text-muted">{laterText}</span>
            <span className="tnum shrink-0 text-[12.5px] font-semibold text-accent">
              +{sgd(laterEarnings)}
              {perYear ? " a year" : ""} to you {showLater ? "▴" : "▾"}
            </span>
          </button>
          {showLater && (
            <table className="tnum mt-2 w-full text-[11.5px] text-muted">
              <thead>
                <tr className="text-left">
                  <th className="py-0.5 font-semibold">Year</th>
                  <th className="py-0.5 text-right font-semibold">Rate</th>
                  <th className="py-0.5 text-right font-semibold">Gross revenue</th>
                  <th className="py-0.5 text-right font-semibold">To you</th>
                </tr>
              </thead>
              <tbody>
                {q.later.map((l) => (
                  <tr key={l.year} className="border-t border-well">
                    <td className="py-1">{l.year === q.later.length + 1 && policy.onwards ? `${l.year}+` : l.year}</td>
                    <td className="py-1 text-right">{Number(l.rate.toFixed(2))}%</td>
                    <td className="py-1 text-right">{sgd(l.gr)}</td>
                    <td className="py-1 text-right text-body">{sgd(l.earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {policy.notes && policy.notes.length > 0 && (
        <details className="border-t border-line px-4 py-2.5 text-[11px] leading-[1.45] text-muted">
          <summary className="cursor-pointer font-semibold text-body">Schedule notes</summary>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
            {policy.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default function Calculator({
  advisor,
  cases,
  goalSet,
  primary,
  band,
  onGoToGoals,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  primary: PrimaryGoal;
  band: BandingCode;
  onGoToGoals: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => [rowFor(firstPolicy())]);
  /** The what-if goal figure while the box is open; null means "use my goals". Never saved. */
  const [whatIf, setWhatIf] = useState<string | null>(null);
  /** Per tiered incentive: APE or APE credits from the FC's other cases this quarter. */
  const [quarter, setQuarter] = useState<Record<string, string>>({});
  /** One-off rewards the FC says they qualify for. */
  const [flatOn, setFlatOn] = useState<Record<string, boolean>>({});

  // ── Per-row maths. Tiered incentives look across the rows: each row's tier counts the others. ──
  const resolved = rows.map((row) => {
    const policy = policyById(row.policyId)!;
    const variant = variantById(policy, row.variantId);
    const premium = parseMoney(row.premium);
    return { row, policy, variant, premium, incentives: incentivesFor(policy, variant, TODAY) };
  });
  const quarterIncentives = new Map<string, Incentive>();
  for (const r of resolved) for (const i of r.incentives) if (i.quarter_input) quarterIncentives.set(i.id, i);
  const flatIncentives = new Map<string, Incentive>();
  for (const r of resolved) for (const i of r.incentives) if (i.kind === "flat_cash") flatIncentives.set(i.id, i);
  /** What a row contributes toward an incentive's quarter figure: APE credits for tiers, APE for thresholds. */
  const contribution = (r: (typeof resolved)[number], i: Incentive) =>
    i.kind === "ape_cash" ? apeCredits(i, r.policy, r.variant, r.premium) : i.kind === "sales_cash" && r.policy.insurer === i.insurer ? apeOf(r.variant, r.premium) : 0;
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
    const quarterOther: Record<string, number> = {};
    for (const [id, i] of quarterIncentives) {
      const others = resolved.reduce((t, o, m) => (m === n ? t : t + contribution(o, i)), 0);
      quarterOther[id] = parseMoney(quarter[id] ?? "") + others;
    }
    const flat = [...flatRow.entries()].filter(([, row]) => row === n).map(([id]) => id);
    const q = quote({ policy: r.policy, variant: r.variant, premium: r.premium, targetPremium: parseMoney(r.row.target) || null, band, today: TODAY, quarterOther, flatOn: flat });
    return { ...r, q };
  });

  const totalGr = computed.reduce((t, c) => t + c.q.gr, 0);
  const totalEarnings = computed.reduce((t, c) => t + c.q.earnings, 0);
  const totalMdrtPremium = computed.reduce((t, c) => t + c.q.mdrtPremium, 0);
  const totalElite = computed.reduce((t, c) => t + c.q.elite, 0);
  const mdrtRisk = computed.filter((c) => c.policy.mdrt_category === "risk_protection").reduce((t, c) => t + c.q.mdrtCommission, 0);
  const mdrtOther = computed.filter((c) => c.policy.mdrt_category === "other").reduce((t, c) => t + c.q.mdrtCommission, 0);
  const filled = computed.filter((c) => c.q.gr > 0).length;

  // ── The goal set in Goals, and the what-if figure laid over it ──
  const goal = activeGoalFor(advisor, cases, goalSet, primary);
  const savedTarget = goal.target ?? 0;
  const ratio = goal.target ? Math.min(goal.achieved / goal.target, 1) : 0;
  const toGo = Math.max(savedTarget - goal.achieved, 0);
  const goalNum = whatIf === null ? savedTarget : parseMoney(whatIf);
  const gap = Math.max(goalNum - goal.achieved, 0);
  // A tier aim counts MDRT commission credit (the schedule's commission, not cash incentives); the FC's own goal counts all earnings.
  const perClient = goal.credit ? mdrtRisk + mdrtOther : totalEarnings;
  const needed = goal.credit ? clientsNeededOnRoute(goal.credit, goalNum, mdrtRisk, mdrtOther) : clientsNeeded(gap, totalEarnings);
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
  } else if (needed === null) {
    verdict = { figure: "—", unit: "Add a policy above", note: "Once a policy has a premium, this shows the number of clients you need.", ink: "text-ink" };
  } else {
    const eliteText = totalElite >= 0.5 ? ` and ${count(totalElite)} Elite ${Math.round(totalElite) === 1 ? "credit" : "credits"}` : "";
    verdict = {
      figure: String(needed),
      unit: needed === 1 ? "more client like this" : "more clients like this",
      note: `At ${sgd(perClient)}${goal.credit ? " of MDRT commission credit" : ""} a client, that closes the ${sgd(gap)} gap to ${goalName}. Each one also adds ${sgd(totalMdrtPremium)} of MDRT premium credit${eliteText}.${
        floorHolds ? ` ${sgd(mdrtOther)} of each is Other Products credit, which MDRT counts only once Risk-Protection commission reaches ${sgd(goal.credit!.riskFloor)}; the count allows for that.` : ""
      }${goal.credit && totalEarnings > perClient + 0.5 ? ` Cash incentives (${sgd(totalEarnings - perClient)} a client to you) are left out of MDRT credit.` : ""}`,
      ink: "text-accent",
    };
  }

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  return (
    <>
      <div className="flex flex-col gap-2.5 px-4 pb-24 pt-3">
        {computed.map((c) => (
          <PolicyCard key={c.row.key} row={c.row} q={c.q} band={band} canRemove={rows.length > 1} onPatch={(p) => patch(c.row.key, p)} onRemove={() => remove(c.row.key)} />
        ))}

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, rowFor(firstPolicy())])}
          className="flex w-full items-center justify-center gap-[7px] rounded-2xl border border-dashed border-accent/45 bg-accent-soft/50 p-3.5 text-[14px] font-semibold text-accent hover:border-accent hover:bg-accent-soft"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add another policy or rider
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
              <span className="tnum shrink-0 text-[15px] font-bold text-accent">{goal.target === null ? "Not set" : sgd(goal.target)}</span>
            </div>
            <div className="mt-[9px] flex h-1.5 overflow-hidden rounded-full bg-accent/18" role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
              <span className="bg-accent" style={{ width: pct(ratio) }} />
            </div>
            <div className="tnum mt-2 flex items-baseline justify-between gap-[9px] text-[11px] text-muted">
              <span>
                {sgd(goal.achieved)} so far · {goal.target === null ? goal.window : `${pct(ratio)} · ${goal.window}`}
              </span>
              <span className="shrink-0">{goal.target === null ? "no target" : toGo === 0 ? "reached" : `${sgd(toGo)} to go`}</span>
            </div>
          </div>

          {whatIf === null ? (
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
        </Card>

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
            {filled} {filled === 1 ? "policy" : "policies"} · GR {sgd(totalGr)} · MDRT prem. {sgd(totalMdrtPremium)}
            {totalElite >= 0.5 ? ` · Elite +${count(totalElite)}` : ""}
          </div>
        </div>
        <div className="tnum shrink-0 text-[28px] font-bold leading-none tracking-[-.025em]">{sgd(totalEarnings)}</div>
      </section>
    </>
  );
}
