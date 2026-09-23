// Mock data for the Finexis production tracker.
//
// Section 1 holds reference values: the product panel, banding rates and MDRT
// thresholds (the Elite scheme is in src/lib/elite.ts). Rows marked PLACEHOLDER are
// guesses to be replaced by the business's own figures (see
// src/private/README for how the confidential ones are loaded).
//
// Section 2 holds fake advisers and their monthly production import, which
// is the app's data source: each row is one FA's year-to-date figures as of
// a month end, the way the backend import supplies them. Nothing here is real.

// ─────────────────────────────────────────────────────────────────
// SECTION 1 — REFERENCE DATA
// ─────────────────────────────────────────────────────────────────

export type ProductCategory = "life" | "ilp" | "health" | "endowment";
export type PremiumType = "regular" | "single";
export type MdrtCategory = "risk_protection" | "other";
export type BandingCode = "B1" | "B2" | "B3" | "B4" | "B5";
export type CreditMetric = "mdrt_premium" | "mdrt_commission" | "wape";
export type Tier = "mdrt" | "cot" | "tot";
export type PeriodType = "jan_dec" | "jan_jun" | "feb_jan" | "apr_mar";
export type MetricCode = "commission" | "premium" | "mdrt_premium" | "mdrt_commission" | "elite" | "wape";
export type MetricUnit = "sgd" | "count";

export interface Insurer {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  insurer_id: string;
  name: string;
  category: ProductCategory;
  premium_type: PremiumType;
  /** How MDRT classes the product: Risk-Protection or Other Products. */
  mdrt_category: MdrtCategory;
  /** PLACEHOLDER — gross revenue as a share of the annual premium (or of the lump sum). */
  comm_rate: number;
  /** A typical case, pre-filled in the Calculator. */
  typical_premium: number;
  /** Not offered in the product picker (the two import buckets). */
  hidden?: boolean;
}

export interface Banding {
  code: BandingCode;
  label: string;
  commission_rate: number;
}

export interface CreditRate {
  product_id: string;
  metric: CreditMetric;
  rate: number;
}

/** The two ways the firm tracks MDRT qualification: first-year commission or first-year premium. */
export type MdrtRouteMetric = "mdrt_commission" | "mdrt_premium";

export interface MetricThreshold {
  metric: MdrtRouteMetric;
  tier: Tier;
  value: number;
}

/** MDRT's minimum inside a route: the credit that must come from Risk-Protection products before any Other Products credit counts. */
export interface MdrtFloor {
  metric: MdrtRouteMetric;
  risk_protection: number;
}

export interface MetricDefinition {
  code: MetricCode;
  label: string;
  unit: MetricUnit;
  period_type: PeriodType;
}

// The panel this version covers: three insurers, as agreed. Names are generic
// descriptors of each insurer's product types, not their actual product names.
export const insurers: Insurer[] = [
  { id: "ins_singlife", name: "Singlife" },
  { id: "ins_hsbc", name: "HSBC Life" },
  { id: "ins_fwd", name: "FWD" },
];

// PLACEHOLDER — the broad product types the import's entries are filed
// under; the Calculator's real policies are in the policy catalogue.
export const products: Product[] = [
  { id: "prd_01", insurer_id: "ins_singlife", name: "Singlife Term", category: "life", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 0.95, typical_premium: 1800 },
  { id: "prd_02", insurer_id: "ins_singlife", name: "Singlife Whole Life (par)", category: "life", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 0.95, typical_premium: 3600 },
  { id: "prd_20", insurer_id: "ins_singlife", name: "Singlife Hospital Plan", category: "health", premium_type: "regular", mdrt_category: "other", comm_rate: 0.6, typical_premium: 1200 },
  { id: "prd_07", insurer_id: "ins_hsbc", name: "HSBC Life Critical Illness", category: "health", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 0.95, typical_premium: 2400 },
  { id: "prd_08", insurer_id: "ins_hsbc", name: "HSBC Life Regular Endowment", category: "endowment", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 0.45, typical_premium: 6000 },
  { id: "prd_09", insurer_id: "ins_hsbc", name: "HSBC Life Single-Premium ILP", category: "ilp", premium_type: "single", mdrt_category: "risk_protection", comm_rate: 0.04, typical_premium: 50000 },
  { id: "prd_14", insurer_id: "ins_fwd", name: "FWD Term", category: "life", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 0.95, typical_premium: 1800 },
  { id: "prd_15", insurer_id: "ins_fwd", name: "FWD Critical Illness", category: "health", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 0.95, typical_premium: 2400 },
  { id: "prd_16", insurer_id: "ins_fwd", name: "FWD Regular-Premium ILP", category: "ilp", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 0.7, typical_premium: 6000 },
  { id: "prd_21", insurer_id: "ins_fwd", name: "FWD Hospital Plan", category: "health", premium_type: "regular", mdrt_category: "other", comm_rate: 0.6, typical_premium: 1200 },
  // The two buckets a monthly import row is split into. Their figures come from the import, not from these rates.
  { id: "import_risk", insurer_id: "", name: "Risk-Protection products", category: "life", premium_type: "regular", mdrt_category: "risk_protection", comm_rate: 1, typical_premium: 0, hidden: true },
  { id: "import_other", insurer_id: "", name: "Other Products", category: "health", premium_type: "regular", mdrt_category: "other", comm_rate: 1, typical_premium: 0, hidden: true },
];

// PLACEHOLDER — confirm the banding table with the business.
export const bandings: Banding[] = [
  { code: "B1", label: "Band 1", commission_rate: 0.3 },
  { code: "B2", label: "Band 2", commission_rate: 0.4 },
  { code: "B3", label: "Band 3", commission_rate: 0.5 },
  { code: "B4", label: "Band 4", commission_rate: 0.6 },
  { code: "B5", label: "Band 5", commission_rate: 0.7 },
];

// PLACEHOLDER — the MDRT rates follow MDRT's "Eligible Products and Credit"
// table (2027 Membership Information, page 4): 100% of first-year commission
// for every product; premium credit 100% of first-year premium for regular
// life / CI / health / endowment, 6% for single premium. WAPE rates are
// Finexis's own and still to be supplied. Not modelled yet: MDRT gives a
// regular endowment of 15 years or less only 6% premium credit (100% from
// 16 years), which depends on the term, not the product.
const REGULAR: [CreditMetric, number][] = [
  ["mdrt_premium", 1.0],
  ["mdrt_commission", 1.0],
  ["wape", 1.0],
];
const SINGLE: [CreditMetric, number][] = [
  ["mdrt_premium", 0.06],
  ["mdrt_commission", 1.0],
  ["wape", 0.1],
];
export const credit_rates: CreditRate[] = products.flatMap((p) => (p.premium_type === "single" ? SINGLE : REGULAR).map(([metric, rate]) => ({ product_id: p.id, metric, rate })));

/**
 * MDRT counts a calendar year of production toward the next membership year:
 * 2026 production qualifies for 2027 membership, judged against the 2027
 * membership year's chart (confirmed by marketing, 9 Sep 2026).
 */
export const MDRT_PRODUCTION_YEAR = 2026;
export const MDRT_MEMBERSHIP_YEAR = 2027;
/**
 * True once metric_thresholds holds the Singapore row of the membership
 * year's chart. Flipped 14 Sep 2026 from "Membership Information for the
 * 2027 Million Dollar Round Table" (MDRT, Global edition dated 3/14/2026,
 * page 12). The UI shows a "to confirm" note while false.
 */
export const MDRT_THRESHOLDS_CONFIRMED = true;

// Singapore, SGD, 2027 membership (2026 production), from pages 12 and 15 of
// the document above: MDRT / COT / TOT at 1x / 3x / 6x on both routes. The
// income route exists at MDRT but the firm does not track it, so it is left out.
export const metric_thresholds: MetricThreshold[] = [
  { metric: "mdrt_commission", tier: "mdrt", value: 75800 },
  { metric: "mdrt_commission", tier: "cot", value: 227400 },
  { metric: "mdrt_commission", tier: "tot", value: 454800 },
  { metric: "mdrt_premium", tier: "mdrt", value: 227400 },
  { metric: "mdrt_premium", tier: "cot", value: 682200 },
  { metric: "mdrt_premium", tier: "tot", value: 1364400 },
];

// Minimums inside each route (same document, section I and page 9): half the
// entry-level MDRT requirement must come from Risk-Protection products before
// any Other Products credit counts, and the same floor applies to COT and TOT.
export const mdrt_floors: MdrtFloor[] = [
  { metric: "mdrt_commission", risk_protection: 37900 },
  { metric: "mdrt_premium", risk_protection: 113700 },
];

// The metrics the app tracks. commission and premium are the import's
// headline figures; the two MDRT credits are the import's MDRT columns;
// Elite credits come straight from the import (the scheme's tiers and rules
// are in src/lib/elite.ts). WAPE is defined but has no column in the import
// yet.
export const metric_definitions: MetricDefinition[] = [
  { code: "commission", label: "Commission", unit: "sgd", period_type: "jan_dec" },
  { code: "premium", label: "Premium", unit: "sgd", period_type: "jan_dec" },
  { code: "elite", label: "Elite credits", unit: "count", period_type: "jan_dec" },
  { code: "mdrt_commission", label: "MDRT commission", unit: "sgd", period_type: "jan_dec" },
  { code: "mdrt_premium", label: "MDRT premium", unit: "sgd", period_type: "jan_dec" },
  { code: "wape", label: "WAPE", unit: "sgd", period_type: "apr_mar" },
];

// ─────────────────────────────────────────────────────────────────
// SECTION 2 — ADVISERS AND THEIR PRODUCTION IMPORT
// Fake people. Shapes mirror the future tables and the import file.
// ─────────────────────────────────────────────────────────────────

export type CaseStatus = "pending" | "confirmed" | "superseded";
export type CaseSource = "manual" | "merlin" | "import";

export interface Advisor {
  id: string;
  name: string;
  fc_code: string;
  banding_code: BandingCode;
  /** null for a manager with no manager above them in the import; otherwise the manager's advisor id. */
  manager_id: string | null;
  /** The year of the FC's RNF, when the import says; Elite has lower tiers for new FCs. */
  rnf_year: number | null;
}

/** The per-case (or per-import-entry) figures every metric sums. */
export interface CaseMetricValues {
  commission: number;
  gross_revenue: number;
  /** Annual premium (lump sum for single premium). */
  premium: number;
  mdrt_premium: number;
  mdrt_commission: number;
  wape: number;
  /** Elite credits. */
  elite: number;
}

/**
 * One production entry. Hypothetical cases the Calculator builds carry a
 * product and a premium and their figures are computed from the rates; a
 * month of imported production carries its figures explicitly in `metrics`.
 */
export interface Case {
  id: string;
  advisor_id: string;
  /** "Imported production" for an import entry. */
  client_name: string;
  product_id: string;
  /** Annual premium for regular-premium products; lump sum for single premium. */
  premium_amount: number;
  /** 1 for single-premium products. */
  premium_term_years: number;
  /** Revenue the firm receives from the insurer for this case (mock values). */
  gross_revenue: number;
  banding_code_at_time: BandingCode;
  status: CaseStatus;
  source: CaseSource;
  /** ISO date (YYYY-MM-DD). */
  submitted_on: string;
  /** ISO date, or null while pending. */
  confirmed_on: string | null;
  /** Import entries: the month's figures as imported, overriding anything the rates would compute. */
  metrics?: Partial<CaseMetricValues>;
  /** Import entries: "August 2026". */
  label?: string;
}

/**
 * One row of the monthly production import: an FA's year-to-date figures as
 * of a month end. The backend takes the firm's CSV (see
 * public/sample-import.csv for the columns); the app receives each FA's own
 * rows, and a manager's team's rows, from the server.
 */
export interface ImportRow {
  fc_code: string;
  name: string;
  banding: BandingCode;
  /** Empty for the top of the tree. */
  manager_fc_code: string;
  /** ISO date, the month end the figures are as of. */
  as_of: string;
  /** First-year commission, year to date. */
  commission_ytd: number;
  /** First-year premium, year to date. */
  premium_ytd: number;
  /** MDRT commission credit, year to date, and the part from Risk-Protection products. */
  mdrt_commission_ytd: number;
  mdrt_commission_risk_ytd: number;
  /** MDRT premium credit, year to date, and the part from Risk-Protection products. */
  mdrt_premium_ytd: number;
  mdrt_premium_risk_ytd: number;
  /** Submitted, not yet confirmed by the insurer. */
  pending_commission: number;
  pending_premium: number;
  /** Elite credits, year to date, as the scheme counts them (first-year GR times each product's multiplier). */
  elite_credits_ytd: number;
  /** Optional: the date (or year) of the FC's RNF, which decides the new-FC Elite tiers. */
  rnf_date?: string;
}

/** How often a self-set goal resets. "year" follows the metric's own period_type (e.g. Apr–Mar for WAPE). */
export type GoalCadence = "year" | "half" | "quarter" | "month";

export interface Goal {
  advisor_id: string;
  metric: MetricCode;
  /** The calendar year the goal applies to. */
  year: number;
  cadence: GoalCadence;
  /** The target for one period of the cadence (e.g. per quarter when cadence is "quarter"). */
  target_value: number;
}

/** Which MDRT tier the FC is aiming for this year. Both routes pace toward this tier. */
export interface MdrtTierGoal {
  advisor_id: string;
  year: number;
  tier: Tier;
}

/** The FC the mockup opens on (a non-manager). The view switch flips to the manager. */
export const DEFAULT_USER_ID = "FC001";
export const MANAGER_USER_ID = "FC000";

/** Pinned so the mockup reads the same on any day: a Sunday in September, the week after the August import. */
export const TODAY = new Date("2026-09-06T00:00:00");

/**
 * The sample import: one manager and five FAs, January to August 2026,
 * generated from the mockup's earlier case list so the figures stay familiar
 * (FC001's S$25,062 of commission, S$23,804 of it from Risk-Protection
 * products, and so on). public/sample-import.csv is the same rows as a file.
 * Elite credits here are commission ÷ the banding rate (roughly first-year
 * GR at a multiplier of 1). FC004 is a new FC (RNF in 2025).
 */
export const import_rows: ImportRow[] = [
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-01-31", commission_ytd: 10369, premium_ytd: 16700, mdrt_commission_ytd: 10369, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14813 },
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-02-28", commission_ytd: 10369, premium_ytd: 16700, mdrt_commission_ytd: 10369, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14813 },
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-03-31", commission_ytd: 10369, premium_ytd: 16700, mdrt_commission_ytd: 10369, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14813 },
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-04-30", commission_ytd: 10369, premium_ytd: 16700, mdrt_commission_ytd: 10369, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14813 },
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-05-31", commission_ytd: 10369, premium_ytd: 16700, mdrt_commission_ytd: 10369, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14813 },
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-06-30", commission_ytd: 11172, premium_ytd: 111700, mdrt_commission_ytd: 11172, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 22400, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 15960 },
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-07-31", commission_ytd: 11172, premium_ytd: 111700, mdrt_commission_ytd: 11172, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 22400, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 15960 },
  { fc_code: "FC000", name: "Jonathan Koh", banding: "B5", manager_fc_code: "", as_of: "2026-08-31", commission_ytd: 11172, premium_ytd: 111700, mdrt_commission_ytd: 11172, mdrt_commission_risk_ytd: 10369, mdrt_premium_ytd: 22400, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 15960 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-01-31", commission_ytd: 4836, premium_ytd: 10400, mdrt_commission_ytd: 4836, mdrt_commission_risk_ytd: 4836, mdrt_premium_ytd: 10400, mdrt_premium_risk_ytd: 10400, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 9672 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-02-28", commission_ytd: 7400, premium_ytd: 15600, mdrt_commission_ytd: 7400, mdrt_commission_risk_ytd: 7400, mdrt_premium_ytd: 15600, mdrt_premium_risk_ytd: 15600, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14800 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-03-31", commission_ytd: 7400, premium_ytd: 15600, mdrt_commission_ytd: 7400, mdrt_commission_risk_ytd: 7400, mdrt_premium_ytd: 15600, mdrt_premium_risk_ytd: 15600, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14800 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-04-30", commission_ytd: 9428, premium_ytd: 21000, mdrt_commission_ytd: 9428, mdrt_commission_risk_ytd: 9428, mdrt_premium_ytd: 21000, mdrt_premium_risk_ytd: 21000, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 18856 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-05-31", commission_ytd: 17692, premium_ytd: 186000, mdrt_commission_ytd: 17692, mdrt_commission_risk_ytd: 16435, mdrt_premium_ytd: 45000, mdrt_premium_risk_ytd: 36000, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 35384 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-06-30", commission_ytd: 21573, premium_ytd: 290700, mdrt_commission_ytd: 21573, mdrt_commission_risk_ytd: 20316, mdrt_premium_ytd: 55700, mdrt_premium_risk_ytd: 46700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 43146 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-07-31", commission_ytd: 22878, premium_ytd: 297200, mdrt_commission_ytd: 22878, mdrt_commission_risk_ytd: 21621, mdrt_premium_ytd: 62200, mdrt_premium_risk_ytd: 53200, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 45756 },
  { fc_code: "FC001", name: "Tan Wei Lun", banding: "B3", manager_fc_code: "FC000", as_of: "2026-08-31", commission_ytd: 25062, premium_ytd: 301900, mdrt_commission_ytd: 25062, mdrt_commission_risk_ytd: 23804, mdrt_premium_ytd: 66900, mdrt_premium_risk_ytd: 57900, pending_commission: 9174, pending_premium: 19200, elite_credits_ytd: 50124 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-01-31", commission_ytd: 0, premium_ytd: 0, mdrt_commission_ytd: 0, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 0, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 0 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-02-28", commission_ytd: 2529, premium_ytd: 9100, mdrt_commission_ytd: 2529, mdrt_commission_risk_ytd: 2529, mdrt_premium_ytd: 9100, mdrt_premium_risk_ytd: 9100, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 6322 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-03-31", commission_ytd: 2529, premium_ytd: 9100, mdrt_commission_ytd: 2529, mdrt_commission_risk_ytd: 2529, mdrt_premium_ytd: 9100, mdrt_premium_risk_ytd: 9100, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 6322 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-04-30", commission_ytd: 2529, premium_ytd: 9100, mdrt_commission_ytd: 2529, mdrt_commission_risk_ytd: 2529, mdrt_premium_ytd: 9100, mdrt_premium_risk_ytd: 9100, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 6322 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-05-31", commission_ytd: 4814, premium_ytd: 15300, mdrt_commission_ytd: 4814, mdrt_commission_risk_ytd: 4814, mdrt_premium_ytd: 15300, mdrt_premium_risk_ytd: 15300, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 12035 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-06-30", commission_ytd: 4814, premium_ytd: 15300, mdrt_commission_ytd: 4814, mdrt_commission_risk_ytd: 4814, mdrt_premium_ytd: 15300, mdrt_premium_risk_ytd: 15300, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 12035 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-07-31", commission_ytd: 4814, premium_ytd: 15300, mdrt_commission_ytd: 4814, mdrt_commission_risk_ytd: 4814, mdrt_premium_ytd: 15300, mdrt_premium_risk_ytd: 15300, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 12035 },
  { fc_code: "FC002", name: "Nur Aisyah Rahim", banding: "B2", manager_fc_code: "FC000", as_of: "2026-08-31", commission_ytd: 6235, premium_ytd: 18700, mdrt_commission_ytd: 6235, mdrt_commission_risk_ytd: 6235, mdrt_premium_ytd: 18700, mdrt_premium_risk_ytd: 18700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 15588 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-01-31", commission_ytd: 0, premium_ytd: 0, mdrt_commission_ytd: 0, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 0, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 0 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-02-28", commission_ytd: 1885, premium_ytd: 75000, mdrt_commission_ytd: 1885, mdrt_commission_risk_ytd: 1885, mdrt_premium_ytd: 4500, mdrt_premium_risk_ytd: 4500, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 3142 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-03-31", commission_ytd: 1885, premium_ytd: 75000, mdrt_commission_ytd: 1885, mdrt_commission_risk_ytd: 1885, mdrt_premium_ytd: 4500, mdrt_premium_risk_ytd: 4500, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 3142 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-04-30", commission_ytd: 8818, premium_ytd: 87200, mdrt_commission_ytd: 8818, mdrt_commission_risk_ytd: 8818, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14697 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-05-31", commission_ytd: 8818, premium_ytd: 87200, mdrt_commission_ytd: 8818, mdrt_commission_risk_ytd: 8818, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14697 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-06-30", commission_ytd: 8818, premium_ytd: 87200, mdrt_commission_ytd: 8818, mdrt_commission_risk_ytd: 8818, mdrt_premium_ytd: 16700, mdrt_premium_risk_ytd: 16700, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14697 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-07-31", commission_ytd: 15432, premium_ytd: 110700, mdrt_commission_ytd: 15432, mdrt_commission_risk_ytd: 15432, mdrt_premium_ytd: 40200, mdrt_premium_risk_ytd: 40200, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 25720 },
  { fc_code: "FC003", name: "Rachel Lim", banding: "B4", manager_fc_code: "FC000", as_of: "2026-08-31", commission_ytd: 25126, premium_ytd: 127700, mdrt_commission_ytd: 25126, mdrt_commission_risk_ytd: 25126, mdrt_premium_ytd: 57200, mdrt_premium_risk_ytd: 57200, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 41877 },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-01-31", commission_ytd: 0, premium_ytd: 0, mdrt_commission_ytd: 0, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 0, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 0, rnf_date: "2025-03-03" },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-02-28", commission_ytd: 0, premium_ytd: 0, mdrt_commission_ytd: 0, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 0, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 0, rnf_date: "2025-03-03" },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-03-31", commission_ytd: 921, premium_ytd: 3600, mdrt_commission_ytd: 921, mdrt_commission_risk_ytd: 921, mdrt_premium_ytd: 3600, mdrt_premium_risk_ytd: 3600, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 3070, rnf_date: "2025-03-03" },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-04-30", commission_ytd: 921, premium_ytd: 3600, mdrt_commission_ytd: 921, mdrt_commission_risk_ytd: 921, mdrt_premium_ytd: 3600, mdrt_premium_risk_ytd: 3600, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 3070, rnf_date: "2025-03-03" },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-05-31", commission_ytd: 921, premium_ytd: 3600, mdrt_commission_ytd: 921, mdrt_commission_risk_ytd: 921, mdrt_premium_ytd: 3600, mdrt_premium_risk_ytd: 3600, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 3070, rnf_date: "2025-03-03" },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-06-30", commission_ytd: 921, premium_ytd: 3600, mdrt_commission_ytd: 921, mdrt_commission_risk_ytd: 921, mdrt_premium_ytd: 3600, mdrt_premium_risk_ytd: 3600, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 3070, rnf_date: "2025-03-03" },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-07-31", commission_ytd: 1943, premium_ytd: 7000, mdrt_commission_ytd: 1943, mdrt_commission_risk_ytd: 1943, mdrt_premium_ytd: 7000, mdrt_premium_risk_ytd: 7000, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 6477, rnf_date: "2025-03-03" },
  { fc_code: "FC004", name: "Marcus Ong", banding: "B1", manager_fc_code: "FC000", as_of: "2026-08-31", commission_ytd: 1943, premium_ytd: 7000, mdrt_commission_ytd: 1943, mdrt_commission_risk_ytd: 1943, mdrt_premium_ytd: 7000, mdrt_premium_risk_ytd: 7000, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 6477, rnf_date: "2025-03-03" },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-01-31", commission_ytd: 0, premium_ytd: 0, mdrt_commission_ytd: 0, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 0, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 0 },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-02-28", commission_ytd: 0, premium_ytd: 0, mdrt_commission_ytd: 0, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 0, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 0 },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-03-31", commission_ytd: 728, premium_ytd: 95000, mdrt_commission_ytd: 728, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 5700, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 1456 },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-04-30", commission_ytd: 728, premium_ytd: 95000, mdrt_commission_ytd: 728, mdrt_commission_risk_ytd: 0, mdrt_premium_ytd: 5700, mdrt_premium_risk_ytd: 0, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 1456 },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-05-31", commission_ytd: 7474, premium_ytd: 108900, mdrt_commission_ytd: 7474, mdrt_commission_risk_ytd: 6746, mdrt_premium_ytd: 19600, mdrt_premium_risk_ytd: 13900, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14948 },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-06-30", commission_ytd: 7474, premium_ytd: 108900, mdrt_commission_ytd: 7474, mdrt_commission_risk_ytd: 6746, mdrt_premium_ytd: 19600, mdrt_premium_risk_ytd: 13900, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14948 },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-07-31", commission_ytd: 7474, premium_ytd: 108900, mdrt_commission_ytd: 7474, mdrt_commission_risk_ytd: 6746, mdrt_premium_ytd: 19600, mdrt_premium_risk_ytd: 13900, pending_commission: 0, pending_premium: 0, elite_credits_ytd: 14948 },
  { fc_code: "FC005", name: "Devi Rajan", banding: "B3", manager_fc_code: "FC000", as_of: "2026-08-31", commission_ytd: 7474, premium_ytd: 108900, mdrt_commission_ytd: 7474, mdrt_commission_risk_ytd: 6746, mdrt_premium_ytd: 19600, mdrt_premium_risk_ytd: 13900, pending_commission: 1982, pending_premium: 4400, elite_credits_ytd: 14948 },
];

export const goals: Goal[] = [
  { advisor_id: "FC001", metric: "commission", year: 2026, cadence: "year", target_value: 45000 },
  { advisor_id: "FC001", metric: "premium", year: 2026, cadence: "year", target_value: 400000 },
  { advisor_id: "FC001", metric: "elite", year: 2026, cadence: "year", target_value: 100000 },
  { advisor_id: "FC002", metric: "commission", year: 2026, cadence: "year", target_value: 15000 },
  { advisor_id: "FC003", metric: "commission", year: 2026, cadence: "year", target_value: 35000 },
  { advisor_id: "FC003", metric: "elite", year: 2026, cadence: "year", target_value: 200000 },
  { advisor_id: "FC004", metric: "commission", year: 2026, cadence: "year", target_value: 5000 },
  { advisor_id: "FC005", metric: "commission", year: 2026, cadence: "year", target_value: 12000 },
  { advisor_id: "FC000", metric: "commission", year: 2026, cadence: "year", target_value: 15000 },
];

/** Self-set MDRT aspiration for 2026. Defaults to MDRT; an FC can raise it to COT or TOT. */
export const mdrt_tier_goals: MdrtTierGoal[] = [
  { advisor_id: "FC001", year: 2026, tier: "mdrt" },
  { advisor_id: "FC002", year: 2026, tier: "mdrt" },
  { advisor_id: "FC003", year: 2026, tier: "cot" },
  { advisor_id: "FC004", year: 2026, tier: "mdrt" },
  { advisor_id: "FC005", year: 2026, tier: "mdrt" },
  { advisor_id: "FC000", year: 2026, tier: "mdrt" },
];
