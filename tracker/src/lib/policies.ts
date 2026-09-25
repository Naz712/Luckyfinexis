// The policy catalogue: each insurer's commission schedule, row by row, and
// the insurer incentives running on top of it. The real catalogue is
// confidential and lives in src/private/policies.local.json (gitignored);
// without it the app uses the generic sample in src/mock/policies.sample.ts,
// so the public build never carries a real rate.
//
// Gross revenue (GR) is what the insurer pays the firm on a policy: the
// schedule's rate for that policy year times the premium, plus any insurer
// incentive. The FC's earnings are the firm's payout formula applied to GR
// (share × (banding rate − deduction) × GR), also taken from the catalogue.
import { bandRate, type BandingCode, type MdrtCategory } from "../mock/data";
import { SAMPLE_CATALOGUE } from "../mock/policies.sample";

export interface PolicyVariant {
  id: string;
  /** "Regular pay · 10 to 24 years" */
  label: string;
  /** Commission as % of premium, policy year 1 first. */
  years: number[];
  /** The premium term in years this row applies from (for incentive rules that depend on the term). */
  term?: number;
  /** The last premium term the row covers: absent for an exact term, null for "or more". */
  term_to?: number | null;
  /** Single premium (or a top-up): APE counts 10% of it and MDRT premium credit 6%. */
  single?: boolean;
  /** % paid on premium above the target premium (single-pay universal life). */
  excess_rate?: number;
}

export interface Policy {
  id: string;
  insurer: string;
  name: string;
  /** "Term", "Critical illness", "Investment-linked", "Rider", … */
  category: string;
  mdrt_category: MdrtCategory;
  /** What the variant dropdown is called: "Premium term", "Plan", "Minimum investment period". */
  variant_label: string;
  /** Pre-filled premium in the Calculator. */
  typical_premium: number;
  variants: PolicyVariant[];
  /** When the last listed year's rate continues: "Year 7 onwards". */
  onwards?: string;
  notes?: string[];
  /** Set when the policy is closed or closing to new business. */
  status?: string;
  /** Rates apply to premium up to a target premium (universal life); the Calculator asks for it. */
  target_premium?: boolean;
  /** A rider: the base plans it can be added to. Riders are added onto a plan, never picked on their own. */
  attaches_to?: string[];
  /** A rider's name without its base plan ("CI Plus, Payer Premium Eraser"), for the rider picker. */
  short_name?: string;
  /** The plan's riders pay the plan's own rates, so their premium goes in with the plan's. */
  riders_in_premium?: boolean;
  /** A lump sum paid on top of the regular premium (a top-up): the % of it the schedule pays as commission, and where the rate comes from. */
  lump_sum?: { rate: number; note: string };
  source: string;
}

/** How much of a policy's APE counts as APE credit, by premium term. */
export interface ApeShare {
  /** Terms at or above this count `full`. */
  min_term_full?: number;
  full?: number;
  /** Exact-term overrides: { "5": 0.5 }. */
  by_term?: Record<string, number>;
  /** Terms below `min_term_full` without an override. */
  short?: number;
  /** Single premium: share of its APE (which is 10% of the premium). */
  single?: number;
  /** Counts `full` whatever the term. */
  any_term?: boolean;
}

interface IncentiveBase {
  id: string;
  insurer: string;
  name: string;
  /** ISO dates, inclusive. */
  period: [string, string];
  source: string;
  targets: { policy: string; variants?: string[] }[];
  /** One sentence on what it pays. */
  detail: string;
  conditions?: string[];
  /** Label for a "rest of the quarter" figure the tier or threshold depends on. */
  quarter_input?: string;
  /** Where the circular can be opened: a URL, or a path published next to the page. */
  circular?: string;
}

export type Incentive =
  /** Extra commission, % of premium by policy year, per variant id. */
  | (IncentiveBase & { kind: "uplift"; uplift: Record<string, number[]> })
  /** Cash as a % of APE credits, tiered per policy or on the quarter's total. */
  | (IncentiveBase & {
      kind: "ape_cash";
      ape: { basis: "per_policy" | "cumulative"; gst?: boolean; share: Record<string, ApeShare>; multiplier: Record<string, number>; tiers: { min: number; pct: number }[] };
    })
  /** Cash as a % of the premium, once the quarter's APE reaches a minimum. */
  | (IncentiveBase & { kind: "sales_cash"; sales: { pct: Record<string, number>; min_quarter_ape: number } })
  /** A one-off amount per adviser, behind a yes/no condition. */
  | (IncentiveBase & { kind: "flat_cash"; flat: { amount: Record<string, number>; toggle: string } })
  /** APE credits toward a trip; no money. The multipliers apply only to policies incepted in `boost_period`, when it is set. */
  | (IncentiveBase & {
      kind: "convention";
      ape: { share: Record<string, ApeShare>; multiplier: Record<string, number>; boost_period?: [string, string]; tickets: number[] };
    })
  /** Shown for information only. */
  | (IncentiveBase & { kind: "info" });

/**
 * Something the client gets from an insurer's customer campaign: a cashback,
 * a premium discount, passes or vouchers. Shown beside the policy it applies
 * to; the adviser's own figures don't change with it.
 */
export interface ClientReward {
  id: string;
  insurer: string;
  /** "Client cashback", "Premium discount". */
  name: string;
  /** ISO dates, inclusive. */
  period: [string, string];
  targets: { policy: string; variants?: string[] }[];
  /** One sentence on what the client gets. */
  detail: string;
  /** What the Calculator can work out from the premium: months of the annual premium, or a fixed amount. */
  value?: { kind: "months_premium"; months: number } | { kind: "flat"; amount: number };
  /** Announced but not open yet. */
  coming_soon?: boolean;
  conditions?: string[];
  source: string;
  /** Where the circular can be opened: a URL, or a path published next to the page. */
  circular?: string;
}

/** finexis Elite: the in-house scheme (a trip), counted on first-year GR, tracked apart from MDRT. */
export interface EliteRules {
  name: string;
  /** What the top performers win. */
  prize: string;
  /** Qualifying period, ISO dates inclusive. */
  period: [string, string];
  /** One sentence on what earns credits. */
  basis: string;
  /** Lowest first. New FCs need `new_fc_credits`. */
  tiers: { code: string; name: string; credits: number; new_fc_credits?: number; perk?: string }[];
  /** FCs whose RNF is this year or later count as new FCs. */
  new_fc_from_rnf_year: number;
  new_fc_label: string;
  /** False while the tiers are stand-ins. */
  tiers_confirmed: boolean;
  rules: string[];
  source: string;
}

export interface Catalogue {
  version: string;
  confidential?: boolean;
  sources: string[];
  /** Companies in the order the picker lists them, including any whose schedule has not come in yet. */
  insurers?: string[];
  elite: EliteRules;
  /** FC earnings = share × (banding rate − band_deduction) × GR. */
  fc_formula: { share: number; band_deduction: number };
  policies: Policy[];
  incentives: Incentive[];
  /** The insurers' customer campaigns: what the client gets. */
  client_rewards?: ClientReward[];
}

const files = import.meta.glob("../private/policies.local.json", { eager: true, import: "default" }) as Record<string, Catalogue>;
const privateCatalogue = Object.values(files)[0];

export const CATALOGUE: Catalogue = privateCatalogue ?? SAMPLE_CATALOGUE;
/** True when the confidential catalogue was present at build time. */
export const CATALOGUE_IS_PRIVATE = privateCatalogue !== undefined;

export function policyById(id: string): Policy | undefined {
  return CATALOGUE.policies.find((p) => p.id === id);
}

export function variantById(policy: Policy, id: string): PolicyVariant {
  return policy.variants.find((v) => v.id === id) ?? policy.variants[0]!;
}

/** The default row: the longest regular-premium term, else the first row. */
export function defaultVariant(policy: Policy): PolicyVariant {
  const regular = policy.variants.filter((v) => !v.single && v.term !== undefined);
  if (regular.length > 0) return regular.reduce((a, b) => ((b.term ?? 0) > (a.term ?? 0) ? b : a));
  return policy.variants[0]!;
}

/** The FC's share of GR at a band, by the catalogue's payout formula. */
export function fcShare(band: BandingCode): number {
  const rate = bandRate(band);
  return Math.max(CATALOGUE.fc_formula.share * (rate - CATALOGUE.fc_formula.band_deduction), 0);
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const within = (period: [string, string], today: Date) => isoDay(today) >= period[0] && isoDay(today) <= period[1];
const inPeriod = (i: Incentive, today: Date) => within(i.period, today);

/** Incentives running on `today` that name this policy (and this variant, when the incentive lists variants). */
export function incentivesFor(policy: Policy, variant: PolicyVariant, today: Date): Incentive[] {
  return CATALOGUE.incentives.filter(
    (i) => inPeriod(i, today) && i.targets.some((t) => t.policy === policy.id && (!t.variants || t.variants.includes(variant.id))),
  );
}

/** Every insurer incentive running on `today`. */
export function incentivesRunning(today: Date): Incentive[] {
  return CATALOGUE.incentives.filter((i) => inPeriod(i, today));
}

/** Every customer campaign running on `today`, coming-soon ones included. */
export function clientRewardsRunning(today: Date): ClientReward[] {
  return (CATALOGUE.client_rewards ?? []).filter((r) => r.coming_soon || within(r.period, today));
}

/** Incentives running on `today` that name this policy in any of its rows. */
export function incentivesOnPolicy(policy: Policy, today: Date): Incentive[] {
  return CATALOGUE.incentives.filter((i) => inPeriod(i, today) && i.targets.some((t) => t.policy === policy.id));
}

/** Customer campaigns running on `today` for this policy (and row, when the campaign lists rows); coming-soon ones included. */
export function clientRewardsFor(policy: Policy, variant: PolicyVariant, today: Date): ClientReward[] {
  return (CATALOGUE.client_rewards ?? []).filter(
    (r) => (r.coming_soon || within(r.period, today)) && r.targets.some((t) => t.policy === policy.id && (!t.variants || t.variants.includes(variant.id))),
  );
}

/** What a client reward is worth on this premium, when the Calculator can tell. */
export function clientRewardValue(r: ClientReward, variant: PolicyVariant, premium: number): number | null {
  if (!r.value || r.coming_soon) return null;
  if (r.value.kind === "flat") return r.value.amount;
  return variant.single ? null : (premium * r.value.months) / 12;
}

/** How often the client pays the premium. */
export type PayMode = "annual" | "half" | "quarter" | "month";
export const PAY_MODES: { code: PayMode; label: string; perYear: number }[] = [
  { code: "annual", label: "Yearly", perYear: 1 },
  { code: "half", label: "Half-yearly", perYear: 2 },
  { code: "quarter", label: "Quarterly", perYear: 4 },
  { code: "month", label: "Monthly", perYear: 12 },
];

/**
 * How much of the first year's premium is paid by 31 Dec when the policy is
 * sold in `month` (0 = Jan): MDRT credits what is paid inside its production
 * year. Yearly (or a single premium) is all of it; monthly from October is
 * October to December, 3 of 12.
 */
export function paidInYear(mode: PayMode, month: number): { paid: number; of: number; share: number } {
  const of = PAY_MODES.find((m) => m.code === mode)?.perYear ?? 1;
  const paid = Math.min(Math.ceil((12 - month) / (12 / of)), of);
  return { paid, of, share: paid / of };
}

/** APE: the annualised premium, or 10% of a single premium. */
export function apeOf(variant: PolicyVariant, premium: number): number {
  return variant.single ? premium * 0.1 : premium;
}

function shareFor(spec: ApeShare | undefined, variant: PolicyVariant): number {
  if (!spec) return 0;
  if (variant.single) return spec.single ?? 0;
  if (spec.any_term) return spec.full ?? 1;
  const term = variant.term;
  if (term === undefined) return 0; // e.g. a renewal row: not new business
  const exact = spec.by_term?.[String(term)];
  if (exact !== undefined) return exact;
  if (spec.min_term_full !== undefined && term >= spec.min_term_full) return spec.full ?? 1;
  return spec.short ?? 0;
}

/** The APE multiplier an incentive gives this policy on `today`: a booster only counts inside its window. */
export function apeMultiplier(i: Incentive, policy: Policy, today: Date): number {
  if (i.kind !== "ape_cash" && i.kind !== "convention") return 1;
  if (i.kind === "convention" && i.ape.boost_period && !within(i.ape.boost_period, today)) return 1;
  return i.ape.multiplier[policy.id] ?? 1;
}

/** APE credits this policy earns under an APE-based incentive. */
export function apeCredits(i: Incentive, policy: Policy, variant: PolicyVariant, premium: number, today: Date): number {
  if (i.kind !== "ape_cash" && i.kind !== "convention") return 0;
  return apeOf(variant, premium) * shareFor(i.ape.share[policy.id], variant) * apeMultiplier(i, policy, today);
}

export interface QuoteLine {
  id: string;
  /** "Policy rate · year 1" or the incentive's name. */
  label: string;
  /** "72% of S$2,400" */
  detail: string;
  amount: number;
  kind: "base" | "uplift" | "cash";
  /** "until 30 Sep 2026" for incentives. */
  until?: string;
  /** Tiered incentives: the next tier up, when there is one: "7% from S$8,000 APE credits, S$800 more". */
  next?: string;
}

export interface QuoteNote {
  id: string;
  label: string;
  detail: string;
  until?: string;
  /** short: a tier or threshold not reached yet; toggle: a one-off the FC can tick; credits: trip credits; ineligible: this row doesn't qualify; info: for reading. */
  kind: "short" | "toggle" | "credits" | "ineligible" | "info";
  /** A threshold not met yet, or a one-off not ticked: the gross revenue it would add once it applies. */
  potential?: number;
}

export interface QuoteInput {
  policy: Policy;
  variant: PolicyVariant;
  premium: number;
  /** Universal life: the target premium, when lower than the premium. */
  targetPremium?: number | null;
  band: BandingCode;
  today: Date;
  /** Per incentive id: APE (or APE credits) from the rest of the quarter, for tiers and thresholds. */
  quarterOther?: Record<string, number>;
  /** Per incentive id: APE credits from the same policy's other rows (its plan or riders), for per-policy tiers. */
  policyOther?: Record<string, number>;
  /** Flat rewards the FC has said yes to (incentive ids), applied on this row. */
  flatOn?: string[];
}

export interface Quote {
  ape: number;
  /** Year-1 GR at the schedule's rate. */
  base: number;
  /** Money lines that make up year-1 GR: the policy rate, then each incentive. */
  lines: QuoteLine[];
  /** Incentives that add no money here: trip credits, thresholds not met yet, information. */
  notes: QuoteNote[];
  /** Year-1 GR, incentives included. */
  gr: number;
  /** Year-1 commission only: the policy rate and commission uplifts. */
  commissionGr: number;
  /** The FC's year-1 earnings on all of GR. */
  earnings: number;
  /** Later policy years from the schedule (and any uplift), with the FC's share. */
  later: { year: number; rate: number; gr: number; earnings: number }[];
  /** MDRT commission credit for the policy's first year: the FC's share of the schedule's commission alone, no insurer incentive. */
  mdrtCommission: number;
  /** MDRT premium credit: 100% of a regular premium, 6% of a single premium. */
  mdrtPremium: number;
  /** First-year GR as Elite counts it: the schedule's rate and commission uplifts, cash incentives left out. */
  fygr: number;
  /** Elite credits: the FYGR. */
  elite: number;
  share: number;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function isoShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH[(m ?? 1) - 1]} ${y}`;
}
const money = (n: number) => `S$${Math.round(n).toLocaleString("en-SG")}`;
const pctText = (n: number) => `${Number(n.toFixed(2))}%`;

/** Everything one policy row earns: the schedule rate, the incentives, the FC's share, the later years. */
export function quote(input: QuoteInput): Quote {
  const { policy, variant, band } = input;
  const premium = Math.max(input.premium, 0);
  const share = fcShare(band);
  const target = policy.target_premium && input.targetPremium && input.targetPremium > 0 && input.targetPremium < premium ? input.targetPremium : null;
  const commissionable = target ?? premium;
  const excess = target !== null ? premium - target : 0;
  const y1 = variant.years[0] ?? 0;
  const ape = apeOf(variant, premium);

  const lines: QuoteLine[] = [];
  const notes: QuoteNote[] = [];
  let base = (commissionable * y1) / 100;
  lines.push({ id: "base", label: "Policy rate · year 1", detail: `${pctText(y1)} of ${money(commissionable)}${target !== null ? " (target premium)" : ""}`, amount: (commissionable * y1) / 100, kind: "base" });
  if (excess > 0 && variant.excess_rate) {
    const e = (excess * variant.excess_rate) / 100;
    base += e;
    lines.push({ id: "excess", label: "Excess premium", detail: `${pctText(variant.excess_rate)} of ${money(excess)} above the target premium`, amount: e, kind: "base" });
  }

  const upliftByYear: number[] = [];
  let cash = 0;
  for (const i of incentivesFor(policy, variant, input.today)) {
    const until = `until ${isoShort(i.period[1])}`;
    switch (i.kind) {
      case "uplift": {
        const u = i.uplift[variant.id] ?? i.uplift["*"];
        if (!u) break;
        u.forEach((x, n) => (upliftByYear[n] = (upliftByYear[n] ?? 0) + x));
        const amount = (commissionable * (u[0] ?? 0)) / 100;
        lines.push({ id: i.id, label: i.name, detail: `+${pctText(u[0] ?? 0)} of ${money(commissionable)}`, amount, kind: "uplift", until });
        break;
      }
      case "ape_cash": {
        const credits = apeCredits(i, policy, variant, premium, input.today);
        if (credits <= 0) {
          notes.push({ id: i.id, label: i.name, detail: "This premium term earns no APE credits for it.", until, kind: "ineligible" });
          break;
        }
        const other = i.ape.basis === "cumulative" ? (input.quarterOther?.[i.id] ?? 0) : (input.policyOther?.[i.id] ?? 0);
        const total = credits + other;
        const tier = i.ape.tiers.filter((t) => total >= t.min).pop();
        const mult = apeMultiplier(i, policy, input.today);
        const creditText = `${money(credits)} APE credits${mult !== 1 ? ` (${mult}× APE)` : ""}`;
        if (!tier) {
          const first = i.ape.tiers[0]!;
          notes.push({
            id: i.id,
            label: i.name,
            detail: `${creditText}${other > 0 ? ` plus ${money(other)} ${i.ape.basis === "cumulative" ? "this quarter" : "on the rest of the policy"}` : ""}: ${money(first.min - total)} short of the ${pctText(first.pct)} tier${i.ape.basis === "cumulative" ? " across your quarter" : ""}.`,
            until,
            kind: "short",
            potential: (credits * first.pct) / 100,
          });
          break;
        }
        const amount = (credits * tier.pct) / 100;
        cash += amount;
        const up = i.ape.tiers.find((t) => t.min > total);
        lines.push({
          id: i.id,
          label: i.name,
          detail: `${pctText(tier.pct)}${i.ape.gst ? " (+GST)" : ""} of ${creditText}${i.ape.basis === "cumulative" ? ` · tier on ${money(total)} this quarter` : other > 0 ? ` · tier on ${money(total)} with the rest of the policy` : ""}`,
          amount,
          kind: "cash",
          until,
          ...(up ? { next: `${pctText(up.pct)} from ${money(up.min)} of APE credits${i.ape.basis === "cumulative" ? " across your quarter" : ""}, ${money(up.min - total)} more` } : {}),
        });
        break;
      }
      case "sales_cash": {
        const pct = i.sales.pct[variant.id] ?? 0;
        if (pct <= 0) {
          notes.push({ id: i.id, label: i.name, detail: "This option is not eligible.", until, kind: "ineligible" });
          break;
        }
        const quarter = ape + (input.quarterOther?.[i.id] ?? 0);
        if (quarter < i.sales.min_quarter_ape) {
          notes.push({
            id: i.id,
            label: i.name,
            detail: `Pays ${pctText(pct)} of the premium once your quarter's APE reaches ${money(i.sales.min_quarter_ape)}; ${money(i.sales.min_quarter_ape - quarter)} to go.`,
            until,
            kind: "short",
            potential: (premium * pct) / 100,
          });
          break;
        }
        const amount = (premium * pct) / 100;
        cash += amount;
        lines.push({ id: i.id, label: i.name, detail: `${pctText(pct)} of ${money(premium)}`, amount, kind: "cash", until });
        break;
      }
      case "flat_cash": {
        const amount = i.flat.amount[policy.id] ?? 0;
        if (amount <= 0) break;
        if (input.flatOn?.includes(i.id)) {
          cash += amount;
          lines.push({ id: i.id, label: i.name, detail: "one-off, once per adviser", amount, kind: "cash", until });
        } else notes.push({ id: i.id, label: i.name, detail: `${money(amount)} once, if you tick “${i.flat.toggle}” below.`, until, kind: "toggle", potential: amount });
        break;
      }
      case "convention": {
        const credits = apeCredits(i, policy, variant, premium, input.today);
        if (credits > 0) notes.push({ id: i.id, label: i.name, detail: `Adds ${money(credits)} of APE credits. First ticket at ${money(i.ape.tickets[0] ?? 0)}.`, until, kind: "credits" });
        break;
      }
      case "info":
        notes.push({ id: i.id, label: i.name, detail: i.detail, until, kind: "info" });
        break;
    }
  }

  const upliftY1 = ((upliftByYear[0] ?? 0) * commissionable) / 100;
  const commissionGr = base + upliftY1;
  const gr = commissionGr + cash;
  const later = variant.years.slice(1).map((r, n) => {
    const rate = r + (upliftByYear[n + 1] ?? 0);
    const g = (premium * rate) / 100;
    return { year: n + 2, rate, gr: g, earnings: g * share };
  });
  return {
    ape,
    base,
    lines,
    notes,
    gr,
    commissionGr,
    earnings: gr * share,
    later,
    mdrtCommission: base * share,
    mdrtPremium: premium * (variant.single ? 0.06 : 1),
    fygr: commissionGr,
    elite: commissionGr,
    share,
  };
}

/** A rider (added onto a base plan) rather than a plan of its own. */
export const isRider = (p: Policy) => (p.attaches_to?.length ?? 0) > 0;

/** The riders that can go on a base plan. */
export function ridersFor(base: Policy): Policy[] {
  return CATALOGUE.policies.filter((p) => p.attaches_to?.includes(base.id));
}

/** The companies the picker offers, in order, with their policies (none yet for a schedule still to come). */
export function insurerList(): { name: string; policies: Policy[] }[] {
  const names = [...(CATALOGUE.insurers ?? []), ...CATALOGUE.policies.map((p) => p.insurer)].filter((n, i, all) => all.indexOf(n) === i);
  return names.map((name) => ({ name, policies: CATALOGUE.policies.filter((p) => p.insurer === name) }));
}

/** One insurer's policies grouped by category, in catalogue order. */
export function categoriesOf(policies: Policy[]): { label: string; policies: Policy[] }[] {
  const groups = new Map<string, Policy[]>();
  for (const p of policies) (groups.get(p.category) ?? groups.set(p.category, []).get(p.category)!).push(p);
  return [...groups.entries()].map(([label, ps]) => ({ label, policies: ps }));
}

/**
 * One way to pay for a policy, as the Calculator offers it: either a group of
 * schedule rows picked by a typed premium term ("Regular pay", 5 to 25+ years)
 * or a single fixed row (single premium, a plan, a premium charge).
 */
export interface PayOption {
  key: string;
  label: string;
  /** Rows the typed term picks from; empty for a fixed row. */
  rows: PolicyVariant[];
  /** The fixed row, when there is no term to type. */
  variant?: PolicyVariant;
}

/** The part of a row label before " · ", which names its pay group ("Regular pay", "Multi pay"). */
const groupOf = (v: PolicyVariant) => (v.label.includes(" · ") ? v.label.split(" · ")[0]! : "");

/**
 * The pay options for a policy. Term rows sharing a pay group become one
 * option with a years box when they cover more than one term; everything
 * else (single premium, plans, one-term rows) is a fixed option.
 */
export function payOptions(policy: Policy): PayOption[] {
  const out: PayOption[] = [];
  const seen = new Set<string>();
  const hasFixed = policy.variants.some((v) => v.single || v.term === undefined);
  for (const v of policy.variants) {
    if (!v.single && v.term !== undefined) {
      const g = groupOf(v);
      if (seen.has(g)) continue;
      const rows = policy.variants.filter((x) => !x.single && x.term !== undefined && groupOf(x) === g);
      if (new Set(rows.map((x) => x.term)).size > 1) {
        seen.add(g);
        out.push({ key: `t:${g}`, label: g || (hasFixed ? "Regular premium" : policy.variant_label), rows });
        continue;
      }
    }
    out.push({ key: `v:${v.id}`, label: v.label, rows: [], variant: v });
  }
  return out;
}

export function payOptionByKey(policy: Policy, key: string): PayOption {
  const all = payOptions(policy);
  return all.find((o) => o.key === key) ?? all[0]!;
}

/** The row of a term option that covers `years`, or null when the schedule has none. */
export function rowForTerm(option: PayOption, years: number): PolicyVariant | null {
  if (option.variant) return option.variant;
  if (!Number.isFinite(years) || years <= 0) return null;
  return option.rows.find((v) => v.term! <= years && (v.term_to === null || years <= (v.term_to ?? v.term!))) ?? null;
}

/** The terms a term option covers, in words: "5 to 25+ years", "15 or 20 years", "10, 15, 20, 25 or 30 years". */
export function termsText(option: PayOption): string {
  const rows = [...option.rows].sort((a, b) => a.term! - b.term!);
  if (rows.length === 0) return "";
  const contiguous = rows.every((v, i) => i === 0 || v.term === (rows[i - 1]!.term_to ?? rows[i - 1]!.term!) + 1);
  const last = rows[rows.length - 1]!;
  const top = last.term_to === null ? `${last.term}+` : String(last.term_to ?? last.term);
  if (contiguous) return `${rows[0]!.term} to ${top} years`;
  const each = rows.map((v) => (v.term_to === null ? `${v.term}+` : v.term_to !== undefined ? `${v.term}–${v.term_to}` : String(v.term)));
  return `${each.slice(0, -1).join(", ")} or ${each[each.length - 1]} years`;
}

/** The option and term a policy opens with: the longest regular term, as in defaultVariant. */
export function defaultPay(policy: Policy): { option: PayOption; years: number | null } {
  const v = defaultVariant(policy);
  const option = payOptions(policy).find((o) => o.variant === v || o.rows.includes(v))!;
  return { option, years: option.variant ? null : (v.term ?? null) };
}

/** A policy by a loose name ("term", "wealth voyage", "future first"), for the assistant. */
export function findPolicy(hint: string): Policy | null {
  const h = hint.trim().toLowerCase();
  if (!h) return null;
  const all = CATALOGUE.policies.filter((p) => p.category !== "Rider");
  const byName = all.find((p) => p.name.toLowerCase() === h) ?? all.find((p) => p.name.toLowerCase().includes(h)) ?? all.find((p) => h.includes(p.name.toLowerCase().replace(/^(hsbc life|fwd)\s+/, "")));
  if (byName) return byName;
  const kinds: [RegExp, RegExp][] = [
    [/critical|\bci\b/, /critical/i],
    [/hospital|shield/, /hospital/i],
    [/whole life/, /whole life/i],
    [/\bterm\b/, /^term$/i],
    [/\bilp\b|investment.linked|invest/, /investment-linked$/i],
    [/endowment|income|retirement|savings/, /endowment|income|retirement/i],
    [/universal life|\bul\b|legacy/, /universal life/i],
  ];
  for (const [re, cat] of kinds) if (re.test(h)) return all.find((p) => cat.test(p.category)) ?? null;
  return null;
}

/** The row for a term in years: the row covering it, else the longest row whose term is at or below it, else the default. */
export function variantForTerm(policy: Policy, years: number | null): PolicyVariant {
  if (!years) return defaultVariant(policy);
  for (const o of payOptions(policy)) {
    const row = o.variant ? null : rowForTerm(o, years);
    if (row) return row;
  }
  const fits = policy.variants.filter((v) => !v.single && v.term !== undefined && v.term <= years);
  return fits.length > 0 ? fits.reduce((a, b) => ((b.term ?? 0) > (a.term ?? 0) ? b : a)) : defaultVariant(policy);
}
