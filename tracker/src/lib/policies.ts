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
import { bandings, type BandingCode, type MdrtCategory } from "../mock/data";
import { SAMPLE_CATALOGUE } from "../mock/policies.sample";

export interface PolicyVariant {
  id: string;
  /** "Regular pay · 10 to 24 years" */
  label: string;
  /** Commission as % of premium, policy year 1 first. */
  years: number[];
  /** The premium term in years this row applies from (for incentive rules that depend on the term). */
  term?: number;
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
  /** PLACEHOLDER — Elite credits per S$1,000 of premium; defaults apply until the scheme's rules arrive. */
  elite_rate?: number;
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
  /** APE credits toward a trip; no money. */
  | (IncentiveBase & { kind: "convention"; ape: { share: Record<string, ApeShare>; multiplier: Record<string, number>; tickets: number[] } })
  /** Shown for information only. */
  | (IncentiveBase & { kind: "info" });

export interface Catalogue {
  version: string;
  confidential?: boolean;
  sources: string[];
  /** FC earnings = share × (banding rate − band_deduction) × GR. */
  fc_formula: { share: number; band_deduction: number };
  policies: Policy[];
  incentives: Incentive[];
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
  const rate = bandings.find((b) => b.code === band)?.commission_rate ?? 0;
  return Math.max(CATALOGUE.fc_formula.share * (rate - CATALOGUE.fc_formula.band_deduction), 0);
}

const inPeriod = (i: Incentive, today: Date) => {
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return day >= i.period[0] && day <= i.period[1];
};

/** Incentives running on `today` that name this policy (and this variant, when the incentive lists variants). */
export function incentivesFor(policy: Policy, variant: PolicyVariant, today: Date): Incentive[] {
  return CATALOGUE.incentives.filter(
    (i) => inPeriod(i, today) && i.targets.some((t) => t.policy === policy.id && (!t.variants || t.variants.includes(variant.id))),
  );
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

/** APE credits this policy earns under an APE-based incentive. */
export function apeCredits(i: Incentive, policy: Policy, variant: PolicyVariant, premium: number): number {
  if (i.kind !== "ape_cash" && i.kind !== "convention") return 0;
  return apeOf(variant, premium) * shareFor(i.ape.share[policy.id], variant) * (i.ape.multiplier[policy.id] ?? 1);
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
}

export interface QuoteNote {
  id: string;
  label: string;
  detail: string;
  until?: string;
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
  /** Year-1 commission only (policy rate and commission uplifts), what MDRT counts. */
  commissionGr: number;
  /** The FC's year-1 earnings on all of GR. */
  earnings: number;
  /** Later policy years from the schedule (and any uplift), with the FC's share. */
  later: { year: number; rate: number; gr: number; earnings: number }[];
  /** MDRT commission credit: the FC's share of year-1 commission. */
  mdrtCommission: number;
  /** MDRT premium credit: 100% of a regular premium, 6% of a single premium. */
  mdrtPremium: number;
  /** PLACEHOLDER Elite credits. */
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
        const credits = apeCredits(i, policy, variant, premium);
        if (credits <= 0) {
          notes.push({ id: i.id, label: i.name, detail: "This premium term earns no APE credits for it.", until });
          break;
        }
        const other = i.ape.basis === "cumulative" ? (input.quarterOther?.[i.id] ?? 0) : 0;
        const total = credits + other;
        const tier = i.ape.tiers.filter((t) => total >= t.min).pop();
        const mult = i.ape.multiplier[policy.id] ?? 1;
        const creditText = `${money(credits)} APE credits${mult !== 1 ? ` (${mult}× APE)` : ""}`;
        if (!tier) {
          const first = i.ape.tiers[0]!;
          notes.push({
            id: i.id,
            label: i.name,
            detail: `${creditText}${other > 0 ? ` plus ${money(other)} this quarter` : ""}: ${money(first.min - total)} short of the ${pctText(first.pct)} tier${i.ape.basis === "cumulative" ? " across your quarter" : ""}.`,
            until,
          });
          break;
        }
        const amount = (credits * tier.pct) / 100;
        cash += amount;
        lines.push({
          id: i.id,
          label: i.name,
          detail: `${pctText(tier.pct)}${i.ape.gst ? " (+GST)" : ""} of ${creditText}${i.ape.basis === "cumulative" ? ` · tier on ${money(total)} this quarter` : ""}`,
          amount,
          kind: "cash",
          until,
        });
        break;
      }
      case "sales_cash": {
        const pct = i.sales.pct[variant.id] ?? 0;
        if (pct <= 0) {
          notes.push({ id: i.id, label: i.name, detail: "This option is not eligible.", until });
          break;
        }
        const quarter = ape + (input.quarterOther?.[i.id] ?? 0);
        if (quarter < i.sales.min_quarter_ape) {
          notes.push({ id: i.id, label: i.name, detail: `Pays ${pctText(pct)} of the premium once your quarter's APE reaches ${money(i.sales.min_quarter_ape)}; ${money(i.sales.min_quarter_ape - quarter)} to go.`, until });
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
        } else notes.push({ id: i.id, label: i.name, detail: `${money(amount)} once, if you tick “${i.flat.toggle}” below.`, until });
        break;
      }
      case "convention": {
        const credits = apeCredits(i, policy, variant, premium);
        if (credits > 0) notes.push({ id: i.id, label: i.name, detail: `Adds ${money(credits)} of APE credits. First ticket at ${money(i.ape.tickets[0] ?? 0)}.`, until });
        break;
      }
      case "info":
        notes.push({ id: i.id, label: i.name, detail: i.detail, until });
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
  const eliteRate = policy.elite_rate ?? (variant.single ? 0.5 : 10);
  return {
    ape,
    base,
    lines,
    notes,
    gr,
    commissionGr,
    earnings: gr * share,
    later,
    mdrtCommission: commissionGr * share,
    mdrtPremium: premium * (variant.single ? 0.06 : 1),
    elite: (premium / 1000) * eliteRate,
    share,
  };
}

/** Policies grouped for the dropdown: insurer, then category, in catalogue order. */
export function policyGroups(): { label: string; policies: Policy[] }[] {
  const groups = new Map<string, Policy[]>();
  for (const p of CATALOGUE.policies) {
    const key = `${p.insurer} · ${p.category}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  return [...groups.entries()].map(([label, policies]) => ({ label, policies }));
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

/** The row for a term in years: the longest row whose term is at or below it, else the default. */
export function variantForTerm(policy: Policy, years: number | null): PolicyVariant {
  if (!years) return defaultVariant(policy);
  const fits = policy.variants.filter((v) => !v.single && v.term !== undefined && v.term <= years);
  return fits.length > 0 ? fits.reduce((a, b) => ((b.term ?? 0) > (a.term ?? 0) ? b : a)) : defaultVariant(policy);
}
