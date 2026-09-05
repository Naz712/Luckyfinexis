// Mock data for the Finexis production tracker mockup.
//
// Everything a screen displays comes from the tables in this file (via
// src/lib/calc.ts). The shapes mirror the intended Supabase tables so the
// whole file can be swapped for real queries later.
//
// ─────────────────────────────────────────────────────────────────────────
// SECTION 1 — PLACEHOLDER REFERENCE TABLES
// Every value in this section is made up. Search for "PLACEHOLDER" to find
// what must be replaced with business-supplied values before go-live.
// ─────────────────────────────────────────────────────────────────────────

export type ProductCategory = "life" | "ilp" | "health" | "endowment" | "fund";
export type PremiumType = "regular" | "single";
export type MdrtCategory = "risk_protection" | "other";
export type BandingCode = "B1" | "B2" | "B3" | "B4" | "B5";
export type CreditMetric = "mdrt_premium" | "mdrt_commission" | "wape";
export type Tier = "mdrt" | "cot" | "tot";
export type PeriodType = "jan_dec" | "jan_jun" | "feb_jan" | "apr_mar";
export type MetricCode =
  | "commission"
  | "gross_revenue"
  | "mdrt_premium"
  | "mdrt_commission"
  | "wape"
  | "elite"
  | "new_clients"
  | "referrals"
  | "testimonials";
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
  mdrt_category: MdrtCategory;
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

export interface MetricThreshold {
  metric: "mdrt_premium" | "mdrt_commission";
  tier: Tier;
  value: number;
}

export interface MetricDefinition {
  code: MetricCode;
  label: string;
  unit: MetricUnit;
  period_type: PeriodType;
}

// PLACEHOLDER — replace with business-supplied values.
// The Calculator estimates gross revenue as premium × this rate until the
// real per-product revenue rules are supplied.
export const GROSS_REVENUE_PLACEHOLDER_RATE = 0.9;

// PLACEHOLDER — replace with business-supplied values (real insurer names).
export const insurers: Insurer[] = [
  { id: "ins_a", name: "Insurer A" },
  { id: "ins_b", name: "Insurer B" },
  { id: "ins_c", name: "Insurer C" },
  { id: "ins_d", name: "Insurer D" },
  { id: "ins_e", name: "Insurer E" },
];

// PLACEHOLDER — replace with business-supplied values (real product list).
export const products: Product[] = [
  { id: "prd_01", insurer_id: "ins_a", name: "Term Plan X", category: "life", premium_type: "regular", mdrt_category: "risk_protection" },
  { id: "prd_02", insurer_id: "ins_a", name: "Whole Life Y", category: "life", premium_type: "regular", mdrt_category: "risk_protection" },
  { id: "prd_03", insurer_id: "ins_a", name: "Unit Trust", category: "fund", premium_type: "single", mdrt_category: "other" },
  { id: "prd_04", insurer_id: "ins_b", name: "ILP Z", category: "ilp", premium_type: "regular", mdrt_category: "other" },
  { id: "prd_05", insurer_id: "ins_b", name: "Single Premium Endowment", category: "endowment", premium_type: "single", mdrt_category: "other" },
  { id: "prd_06", insurer_id: "ins_b", name: "Hospital Plan H", category: "health", premium_type: "regular", mdrt_category: "risk_protection" },
  { id: "prd_07", insurer_id: "ins_c", name: "Critical Illness Plan C", category: "health", premium_type: "regular", mdrt_category: "risk_protection" },
  { id: "prd_08", insurer_id: "ins_c", name: "Regular Endowment E", category: "endowment", premium_type: "regular", mdrt_category: "other" },
  { id: "prd_09", insurer_id: "ins_c", name: "Single Premium ILP S", category: "ilp", premium_type: "single", mdrt_category: "other" },
  { id: "prd_10", insurer_id: "ins_d", name: "Whole Life W", category: "life", premium_type: "regular", mdrt_category: "risk_protection" },
  { id: "prd_11", insurer_id: "ins_d", name: "Term Plan T", category: "life", premium_type: "regular", mdrt_category: "risk_protection" },
  { id: "prd_12", insurer_id: "ins_e", name: "Retirement Income R", category: "endowment", premium_type: "regular", mdrt_category: "other" },
  { id: "prd_13", insurer_id: "ins_e", name: "Managed Fund M", category: "fund", premium_type: "single", mdrt_category: "other" },
];

// PLACEHOLDER — replace with business-supplied values (actual banding rates).
export const bandings: Banding[] = [
  { code: "B1", label: "Band 1", commission_rate: 0.3 },
  { code: "B2", label: "Band 2", commission_rate: 0.4 },
  { code: "B3", label: "Band 3", commission_rate: 0.5 },
  { code: "B4", label: "Band 4", commission_rate: 0.6 },
  { code: "B5", label: "Band 5", commission_rate: 0.7 },
];

// PLACEHOLDER — replace with business-supplied values.
// Seeded from these rules (one row per product × metric):
//   regular life / health / endowment → mdrt_premium 1.00, mdrt_commission 1.00, wape 1.00
//   single premium                    → mdrt_premium 0.06, mdrt_commission 1.00, wape 0.10
//   funds                             → mdrt_premium 0.06, mdrt_commission 1.00, wape 0
// Assumption: regular-premium ILP follows the regular life rule.
export const credit_rates: CreditRate[] = [
  { product_id: "prd_01", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_01", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_01", metric: "wape", rate: 1.0 },
  { product_id: "prd_02", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_02", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_02", metric: "wape", rate: 1.0 },
  { product_id: "prd_03", metric: "mdrt_premium", rate: 0.06 },
  { product_id: "prd_03", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_03", metric: "wape", rate: 0.0 },
  { product_id: "prd_04", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_04", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_04", metric: "wape", rate: 1.0 },
  { product_id: "prd_05", metric: "mdrt_premium", rate: 0.06 },
  { product_id: "prd_05", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_05", metric: "wape", rate: 0.1 },
  { product_id: "prd_06", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_06", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_06", metric: "wape", rate: 1.0 },
  { product_id: "prd_07", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_07", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_07", metric: "wape", rate: 1.0 },
  { product_id: "prd_08", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_08", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_08", metric: "wape", rate: 1.0 },
  { product_id: "prd_09", metric: "mdrt_premium", rate: 0.06 },
  { product_id: "prd_09", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_09", metric: "wape", rate: 0.1 },
  { product_id: "prd_10", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_10", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_10", metric: "wape", rate: 1.0 },
  { product_id: "prd_11", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_11", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_11", metric: "wape", rate: 1.0 },
  { product_id: "prd_12", metric: "mdrt_premium", rate: 1.0 },
  { product_id: "prd_12", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_12", metric: "wape", rate: 1.0 },
  { product_id: "prd_13", metric: "mdrt_premium", rate: 0.06 },
  { product_id: "prd_13", metric: "mdrt_commission", rate: 1.0 },
  { product_id: "prd_13", metric: "wape", rate: 0.0 },
];

// PLACEHOLDER — replace with business-supplied values (current-year MDRT table).
export const metric_thresholds: MetricThreshold[] = [
  { metric: "mdrt_commission", tier: "mdrt", value: 72400 },
  { metric: "mdrt_commission", tier: "cot", value: 217200 },
  { metric: "mdrt_commission", tier: "tot", value: 434400 },
  { metric: "mdrt_premium", tier: "mdrt", value: 217200 },
  { metric: "mdrt_premium", tier: "cot", value: 651600 },
  { metric: "mdrt_premium", tier: "tot", value: 1303200 },
];

// PLACEHOLDER — replace with business-supplied values.
// period_type is a guess per metric; the business must confirm which window
// each metric is measured over. "elite" is an internal qualification whose
// definition is unknown; it is modelled as a count for now.
export const metric_definitions: MetricDefinition[] = [
  { code: "commission", label: "Commission", unit: "sgd", period_type: "jan_dec" },
  { code: "gross_revenue", label: "Gross revenue", unit: "sgd", period_type: "jan_dec" },
  { code: "mdrt_premium", label: "MDRT premium", unit: "sgd", period_type: "jan_dec" },
  { code: "mdrt_commission", label: "MDRT commission", unit: "sgd", period_type: "jan_dec" },
  { code: "wape", label: "WAPE", unit: "sgd", period_type: "apr_mar" },
  { code: "elite", label: "Elite", unit: "count", period_type: "jan_jun" },
  { code: "new_clients", label: "New clients", unit: "count", period_type: "jan_dec" },
  { code: "referrals", label: "Referrals", unit: "count", period_type: "feb_jan" },
  { code: "testimonials", label: "Testimonials", unit: "count", period_type: "jan_dec" },
];

// ─────────────────────────────────────────────────────────────────────────
// SECTION 2 — TRANSACTIONAL MOCK DATA
// Fake people, fake cases. Shapes mirror the future tables.
// ─────────────────────────────────────────────────────────────────────────

export type CaseStatus = "pending" | "confirmed" | "superseded";
export type CaseSource = "manual" | "merlin";

export interface Advisor {
  id: string;
  name: string;
  fc_code: string;
  banding_code: BandingCode;
  /** null for the manager; otherwise the manager's advisor id. */
  manager_id: string | null;
}

export interface Case {
  id: string;
  advisor_id: string;
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
}

export interface Goal {
  advisor_id: string;
  metric: MetricCode;
  year: number;
  target_value: number;
}

export const advisors: Advisor[] = [
  { id: "adv_mgr", name: "Jonathan Koh", fc_code: "FC000", banding_code: "B5", manager_id: null },
  { id: "adv_01", name: "Tan Wei Lun", fc_code: "FC001", banding_code: "B3", manager_id: "adv_mgr" },
  { id: "adv_02", name: "Nur Aisyah Rahim", fc_code: "FC002", banding_code: "B2", manager_id: "adv_mgr" },
  { id: "adv_03", name: "Rachel Lim", fc_code: "FC003", banding_code: "B4", manager_id: "adv_mgr" },
  { id: "adv_04", name: "Marcus Ong", fc_code: "FC004", banding_code: "B1", manager_id: "adv_mgr" },
  { id: "adv_05", name: "Devi Rajan", fc_code: "FC005", banding_code: "B3", manager_id: "adv_mgr" },
];

/** The signed-in FC for the mockup (a non-manager). The dev toggle switches to the manager. */
export const DEFAULT_USER_ID = "adv_01";
export const MANAGER_USER_ID = "adv_mgr";

/** "Today" for the mockup, so pace and week counts are stable in screenshots. */
export const TODAY = new Date("2026-09-05T00:00:00");

export const cases: Case[] = [
  { id: "case_001", advisor_id: "adv_01", client_name: "Ivan Lim", product_id: "prd_01", premium_amount: 3600, premium_term_years: 15, gross_revenue: 3268, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2025-01-14", confirmed_on: "2025-02-03" },
  { id: "case_002", advisor_id: "adv_03", client_name: "Terence Ho", product_id: "prd_10", premium_amount: 16600, premium_term_years: 20, gross_revenue: 16879, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2025-01-22", confirmed_on: "2025-02-11" },
  { id: "case_003", advisor_id: "adv_05", client_name: "Alicia Teo", product_id: "prd_08", premium_amount: 16500, premium_term_years: 30, gross_revenue: 7370, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2025-02-06", confirmed_on: "2025-02-16" },
  { id: "case_004", advisor_id: "adv_01", client_name: "Hui Ling Ong", product_id: "prd_02", premium_amount: 17800, premium_term_years: 25, gross_revenue: 17721, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2025-02-20", confirmed_on: "2025-03-05" },
  { id: "case_005", advisor_id: "adv_02", client_name: "Yusri Hamid", product_id: "prd_01", premium_amount: 3400, premium_term_years: 25, gross_revenue: 2899, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2025-03-04", confirmed_on: "2025-03-09" },
  { id: "case_006", advisor_id: "adv_mgr", client_name: "Patricia Neo", product_id: "prd_02", premium_amount: 16700, premium_term_years: 15, gross_revenue: 15376, banding_code_at_time: "B5", status: "confirmed", source: "merlin", submitted_on: "2025-03-19", confirmed_on: "2025-04-02" },
  { id: "case_007", advisor_id: "adv_01", client_name: "Owen Lim", product_id: "prd_06", premium_amount: 1300, premium_term_years: 15, gross_revenue: 690, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2025-04-03", confirmed_on: "2025-04-14" },
  { id: "case_008", advisor_id: "adv_03", client_name: "Qiu Ming", product_id: "prd_05", premium_amount: 95000, premium_term_years: 1, gross_revenue: 2786, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2025-04-17", confirmed_on: "2025-05-08" },
  { id: "case_009", advisor_id: "adv_04", client_name: "Benjamin Chua", product_id: "prd_11", premium_amount: 3500, premium_term_years: 25, gross_revenue: 3337, banding_code_at_time: "B1", status: "confirmed", source: "merlin", submitted_on: "2025-05-13", confirmed_on: "2025-05-23" },
  { id: "case_010", advisor_id: "adv_01", client_name: "Mei Fong Heng", product_id: "prd_05", premium_amount: 105000, premium_term_years: 1, gross_revenue: 2949, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2025-06-11", confirmed_on: "2025-06-26" },
  { id: "case_011", advisor_id: "adv_05", client_name: "Wan Ling Tan", product_id: "prd_04", premium_amount: 9600, premium_term_years: 20, gross_revenue: 7143, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2025-06-24", confirmed_on: "2025-07-09" },
  { id: "case_012", advisor_id: "adv_02", client_name: "Grace Tan", product_id: "prd_06", premium_amount: 2600, premium_term_years: 30, gross_revenue: 1379, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2025-07-15", confirmed_on: "2025-07-20" },
  { id: "case_013", advisor_id: "adv_mgr", client_name: "Daniel Wong", product_id: "prd_05", premium_amount: 95000, premium_term_years: 1, gross_revenue: 3250, banding_code_at_time: "B5", status: "confirmed", source: "merlin", submitted_on: "2025-08-07", confirmed_on: "2025-08-14" },
  { id: "case_014", advisor_id: "adv_01", client_name: "Elaine Ng", product_id: "prd_08", premium_amount: 21400, premium_term_years: 25, gross_revenue: 8355, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2025-08-22", confirmed_on: "2025-09-01" },
  { id: "case_015", advisor_id: "adv_03", client_name: "Priya Menon", product_id: "prd_02", premium_amount: 10700, premium_term_years: 15, gross_revenue: 9298, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2025-09-03", confirmed_on: "2025-09-23" },
  { id: "case_016", advisor_id: "adv_04", client_name: "Dinesh Kumar", product_id: "prd_06", premium_amount: 2700, premium_term_years: 30, gross_revenue: 1723, banding_code_at_time: "B1", status: "confirmed", source: "merlin", submitted_on: "2025-09-25", confirmed_on: "2025-10-06" },
  { id: "case_017", advisor_id: "adv_02", client_name: "Cheryl Goh", product_id: "prd_11", premium_amount: 2700, premium_term_years: 25, gross_revenue: 2357, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2025-10-09", confirmed_on: "2025-10-27" },
  { id: "case_018", advisor_id: "adv_01", client_name: "Natalie Koh", product_id: "prd_10", premium_amount: 14200, premium_term_years: 10, gross_revenue: 14222, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2025-11-05", confirmed_on: "2025-11-10" },
  { id: "case_019", advisor_id: "adv_05", client_name: "Jasmine Poh", product_id: "prd_12", premium_amount: 15400, premium_term_years: 15, gross_revenue: 6056, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2025-11-18", confirmed_on: "2025-12-08" },
  { id: "case_020", advisor_id: "adv_03", client_name: "Hafiz Osman", product_id: "prd_13", premium_amount: 60000, premium_term_years: 1, gross_revenue: 1076, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2025-12-10", confirmed_on: "2025-12-31" },
  { id: "case_021", advisor_id: "adv_01", client_name: "Amanda Soh", product_id: "prd_02", premium_amount: 10400, premium_term_years: 25, gross_revenue: 9671, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-01-09", confirmed_on: "2026-01-29" },
  { id: "case_022", advisor_id: "adv_mgr", client_name: "Melvin Toh", product_id: "prd_10", premium_amount: 16700, premium_term_years: 20, gross_revenue: 14813, banding_code_at_time: "B5", status: "confirmed", source: "merlin", submitted_on: "2026-01-15", confirmed_on: "2026-01-25" },
  { id: "case_023", advisor_id: "adv_03", client_name: "Liyana Yusof", product_id: "prd_09", premium_amount: 75000, premium_term_years: 1, gross_revenue: 3142, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2026-01-27", confirmed_on: "2026-02-16" },
  { id: "case_024", advisor_id: "adv_02", client_name: "Kevin Yap", product_id: "prd_04", premium_amount: 9100, premium_term_years: 25, gross_revenue: 6323, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2026-02-03", confirmed_on: "2026-02-13" },
  { id: "case_025", advisor_id: "adv_01", client_name: "Esther Quek", product_id: "prd_07", premium_amount: 5200, premium_term_years: 20, gross_revenue: 5129, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-02-17", confirmed_on: "2026-02-27" },
  { id: "case_026", advisor_id: "adv_05", client_name: "Rohan Pillai", product_id: "prd_03", premium_amount: 95000, premium_term_years: 1, gross_revenue: 1456, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-02-25", confirmed_on: "2026-03-05" },
  { id: "case_027", advisor_id: "adv_04", client_name: "Wesley Tay", product_id: "prd_01", premium_amount: 3600, premium_term_years: 25, gross_revenue: 3070, banding_code_at_time: "B1", status: "confirmed", source: "merlin", submitted_on: "2026-03-10", confirmed_on: "2026-03-25" },
  { id: "case_028", advisor_id: "adv_01", client_name: "Xin Yi Lim", product_id: "prd_04", premium_amount: 5400, premium_term_years: 25, gross_revenue: 4055, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-03-26", confirmed_on: "2026-04-11" },
  { id: "case_029", advisor_id: "adv_03", client_name: "Gwen Low", product_id: "prd_10", premium_amount: 12200, premium_term_years: 25, gross_revenue: 11554, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2026-04-14", confirmed_on: "2026-04-27" },
  { id: "case_030", advisor_id: "adv_01", client_name: "Karen Sim", product_id: "prd_10", premium_amount: 15000, premium_term_years: 30, gross_revenue: 14015, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-04-15", confirmed_on: "2026-05-04" },
  { id: "case_031", advisor_id: "adv_05", client_name: "Clement Ang", product_id: "prd_10", premium_amount: 13900, premium_term_years: 15, gross_revenue: 13492, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-05-05", confirmed_on: "2026-05-10" },
  { id: "case_032", advisor_id: "adv_01", client_name: "Xavier Chia", product_id: "prd_03", premium_amount: 150000, premium_term_years: 1, gross_revenue: 2515, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-05-08", confirmed_on: "2026-05-28" },
  { id: "case_033", advisor_id: "adv_02", client_name: "Valerie Kwek", product_id: "prd_07", premium_amount: 6200, premium_term_years: 25, gross_revenue: 5712, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2026-05-21", confirmed_on: "2026-05-29" },
  { id: "case_034", advisor_id: "adv_01", client_name: "Lydia Chng", product_id: "prd_05", premium_amount: 100000, premium_term_years: 1, gross_revenue: 2989, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-05-27", confirmed_on: "2026-06-08" },
  { id: "case_035", advisor_id: "adv_mgr", client_name: "Bella Seah", product_id: "prd_13", premium_amount: 95000, premium_term_years: 1, gross_revenue: 1147, banding_code_at_time: "B5", status: "confirmed", source: "merlin", submitted_on: "2026-06-09", confirmed_on: "2026-06-16" },
  { id: "case_036", advisor_id: "adv_01", client_name: "Yasmin Abdullah", product_id: "prd_11", premium_amount: 4700, premium_term_years: 30, gross_revenue: 4772, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-06-19", confirmed_on: "2026-06-30" },
  { id: "case_037", advisor_id: "adv_03", client_name: "Adrian Foo", product_id: "prd_08", premium_amount: 23500, premium_term_years: 20, gross_revenue: 11024, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2026-06-30", confirmed_on: "2026-07-05" },
  { id: "case_038", advisor_id: "adv_01", client_name: "Serene Wee", product_id: "prd_12", premium_amount: 6500, premium_term_years: 10, gross_revenue: 3231, banding_code_at_time: "B3", status: "superseded", source: "manual", submitted_on: "2026-07-02", confirmed_on: null },
  { id: "case_039", advisor_id: "adv_01", client_name: "Serene Wee", product_id: "prd_12", premium_amount: 6500, premium_term_years: 25, gross_revenue: 2611, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-07-02", confirmed_on: "2026-07-18" },
  { id: "case_040", advisor_id: "adv_04", client_name: "Irene Lau", product_id: "prd_07", premium_amount: 3400, premium_term_years: 25, gross_revenue: 3407, banding_code_at_time: "B1", status: "confirmed", source: "merlin", submitted_on: "2026-07-16", confirmed_on: "2026-07-23" },
  { id: "case_041", advisor_id: "adv_01", client_name: "Ravi Nathan", product_id: "prd_01", premium_amount: 4700, premium_term_years: 10, gross_revenue: 4367, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-07-28", confirmed_on: "2026-08-14" },
  { id: "case_042", advisor_id: "adv_03", client_name: "Zoe Ang", product_id: "prd_02", premium_amount: 17000, premium_term_years: 15, gross_revenue: 16156, banding_code_at_time: "B4", status: "confirmed", source: "merlin", submitted_on: "2026-08-05", confirmed_on: "2026-08-18" },
  { id: "case_043", advisor_id: "adv_02", client_name: "Jason Lee", product_id: "prd_01", premium_amount: 3400, premium_term_years: 30, gross_revenue: 3553, banding_code_at_time: "B2", status: "confirmed", source: "merlin", submitted_on: "2026-08-11", confirmed_on: "2026-08-21" },
  { id: "case_044", advisor_id: "adv_05", client_name: "Brandon Lau", product_id: "prd_01", premium_amount: 4400, premium_term_years: 30, gross_revenue: 3963, banding_code_at_time: "B3", status: "confirmed", source: "merlin", submitted_on: "2026-08-19", confirmed_on: "2026-09-09" },
  { id: "case_045", advisor_id: "adv_01", client_name: "Vanessa Loh", product_id: "prd_06", premium_amount: 2200, premium_term_years: 15, gross_revenue: 1152, banding_code_at_time: "B3", status: "pending", source: "manual", submitted_on: "2026-08-20", confirmed_on: null },
  { id: "case_046", advisor_id: "adv_01", client_name: "Oliver Yeo", product_id: "prd_02", premium_amount: 17000, premium_term_years: 25, gross_revenue: 17197, banding_code_at_time: "B3", status: "pending", source: "manual", submitted_on: "2026-08-28", confirmed_on: null },
  { id: "case_047", advisor_id: "adv_03", client_name: "Thomas Goh", product_id: "prd_11", premium_amount: 3200, premium_term_years: 15, gross_revenue: 3061, banding_code_at_time: "B4", status: "pending", source: "manual", submitted_on: "2026-09-01", confirmed_on: null },
  { id: "case_048", advisor_id: "adv_01", client_name: "Uma Shankar", product_id: "prd_09", premium_amount: 50000, premium_term_years: 1, gross_revenue: 1763, banding_code_at_time: "B3", status: "pending", source: "manual", submitted_on: "2026-09-02", confirmed_on: null },
];

/** Self-set targets for 2026. */
export const goals: Goal[] = [
  { advisor_id: "adv_01", metric: "commission", year: 2026, target_value: 45000 },
  { advisor_id: "adv_01", metric: "gross_revenue", year: 2026, target_value: 90000 },
  { advisor_id: "adv_01", metric: "mdrt_commission", year: 2026, target_value: 72400 },
  { advisor_id: "adv_01", metric: "mdrt_premium", year: 2026, target_value: 217200 },
  { advisor_id: "adv_01", metric: "wape", year: 2026, target_value: 150000 },
  { advisor_id: "adv_01", metric: "elite", year: 2026, target_value: 1 },
  { advisor_id: "adv_01", metric: "new_clients", year: 2026, target_value: 24 },
  { advisor_id: "adv_01", metric: "referrals", year: 2026, target_value: 12 },
  { advisor_id: "adv_01", metric: "testimonials", year: 2026, target_value: 6 },
  { advisor_id: "adv_02", metric: "commission", year: 2026, target_value: 15000 },
  { advisor_id: "adv_02", metric: "mdrt_commission", year: 2026, target_value: 72400 },
  { advisor_id: "adv_02", metric: "mdrt_premium", year: 2026, target_value: 120000 },
  { advisor_id: "adv_02", metric: "wape", year: 2026, target_value: 80000 },
  { advisor_id: "adv_02", metric: "new_clients", year: 2026, target_value: 15 },
  { advisor_id: "adv_03", metric: "commission", year: 2026, target_value: 35000 },
  { advisor_id: "adv_03", metric: "mdrt_commission", year: 2026, target_value: 72400 },
  { advisor_id: "adv_03", metric: "mdrt_premium", year: 2026, target_value: 300000 },
  { advisor_id: "adv_03", metric: "wape", year: 2026, target_value: 200000 },
  { advisor_id: "adv_03", metric: "new_clients", year: 2026, target_value: 30 },
  { advisor_id: "adv_04", metric: "commission", year: 2026, target_value: 5000 },
  { advisor_id: "adv_04", metric: "mdrt_commission", year: 2026, target_value: 72400 },
  { advisor_id: "adv_04", metric: "mdrt_premium", year: 2026, target_value: 90000 },
  { advisor_id: "adv_04", metric: "wape", year: 2026, target_value: 60000 },
  { advisor_id: "adv_04", metric: "new_clients", year: 2026, target_value: 12 },
  { advisor_id: "adv_05", metric: "commission", year: 2026, target_value: 12000 },
  { advisor_id: "adv_05", metric: "mdrt_commission", year: 2026, target_value: 72400 },
  { advisor_id: "adv_05", metric: "mdrt_premium", year: 2026, target_value: 180000 },
  { advisor_id: "adv_05", metric: "wape", year: 2026, target_value: 120000 },
  { advisor_id: "adv_05", metric: "new_clients", year: 2026, target_value: 20 },
  { advisor_id: "adv_mgr", metric: "commission", year: 2026, target_value: 15000 },
  { advisor_id: "adv_mgr", metric: "mdrt_commission", year: 2026, target_value: 72400 },
  { advisor_id: "adv_mgr", metric: "mdrt_premium", year: 2026, target_value: 400000 },
  { advisor_id: "adv_mgr", metric: "wape", year: 2026, target_value: 250000 },
  { advisor_id: "adv_mgr", metric: "new_clients", year: 2026, target_value: 20 },
];
