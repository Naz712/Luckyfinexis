// A generic stand-in for the policy catalogue, used when the confidential
// one (src/private/policies.local.json) is not present, as on the public
// site. Insurers, plans and every rate here are made up: round numbers in
// the right shape so the Calculator can be tried. Nothing here is real.
import type { Catalogue } from "../lib/policies";

const SRC = "Sample schedule (made up)";
const SRC_Q = "Sample quarterly incentives (made up)";

export const SAMPLE_CATALOGUE: Catalogue = {
  version: "sample",
  sources: [SRC, SRC_Q],
  // A neutral stand-in for the firm's payout formula: the FC keeps the banding rate of GR.
  fc_formula: { share: 1, band_deduction: 0 },
  policies: [
    {
      id: "sample_term",
      insurer: "Insurer A",
      name: "Sample term plan",
      category: "Term",
      mdrt_category: "risk_protection",
      variant_label: "Premium term",
      typical_premium: 2400,
      variants: [
        { id: "5", label: "5 years", years: [40, 20, 10, 3, 3], term: 5 },
        { id: "10", label: "10 to 19 years", years: [60, 30, 15, 3, 3, 3], term: 10 },
        { id: "20", label: "20 years or more", years: [70, 40, 20, 3, 3, 3], term: 20 },
      ],
      source: SRC,
    },
    {
      id: "sample_ci",
      insurer: "Insurer A",
      name: "Sample critical illness plan",
      category: "Critical illness",
      mdrt_category: "risk_protection",
      variant_label: "Premium term",
      typical_premium: 1800,
      variants: [
        { id: "10", label: "10 to 24 years", years: [65, 35, 15, 3, 3, 3], term: 10 },
        { id: "25", label: "25 years or more", years: [75, 45, 15, 3, 3, 3], term: 25 },
      ],
      source: SRC,
    },
    {
      id: "sample_ilp",
      insurer: "Insurer B",
      name: "Sample regular-premium ILP",
      category: "Investment-linked",
      mdrt_category: "risk_protection",
      variant_label: "Premium term",
      typical_premium: 6000,
      variants: [
        { id: "10", label: "10 years", years: [20, 2], term: 10 },
        { id: "20", label: "20 years", years: [60, 2], term: 20 },
        { id: "25", label: "25 years", years: [80, 2], term: 25 },
      ],
      onwards: "Year 2 onwards",
      notes: ["Sample only: later years pay a small renewal on the premium."],
      source: SRC,
    },
    {
      id: "sample_single",
      insurer: "Insurer B",
      name: "Sample single-premium plan",
      category: "Investment-linked (single premium)",
      mdrt_category: "risk_protection",
      variant_label: "Premium type",
      typical_premium: 50000,
      variants: [{ id: "sp", label: "Single premium", years: [4], single: true }],
      source: SRC,
    },
    {
      id: "sample_hospital",
      insurer: "Insurer A",
      name: "Sample hospital plan",
      category: "Hospital",
      mdrt_category: "other",
      variant_label: "Plan",
      typical_premium: 600,
      variants: [{ id: "all", label: "All plans", years: [30, 10] }],
      onwards: "Year 2 onwards",
      source: SRC,
    },
  ],
  incentives: [
    {
      id: "sample_uplift",
      insurer: "Insurer A",
      name: "Sample commission uplift",
      kind: "uplift",
      period: ["2026-07-01", "2026-09-30"],
      source: SRC_Q,
      targets: [{ policy: "sample_term", variants: ["20"] }],
      uplift: { "20": [5] },
      detail: "Sample: +5% of year-1 premium on 20-year terms this quarter.",
    },
    {
      id: "sample_ape_cash",
      insurer: "Insurer B",
      name: "Sample adviser cash incentive",
      kind: "ape_cash",
      period: ["2026-07-01", "2026-09-30"],
      source: SRC_Q,
      targets: [{ policy: "sample_ilp" }],
      ape: {
        basis: "cumulative",
        gst: true,
        share: { sample_ilp: { min_term_full: 10, full: 1, short: 0 } },
        multiplier: { sample_ilp: 1.5 },
        tiers: [
          { min: 10000, pct: 3 },
          { min: 30000, pct: 6 },
        ],
      },
      quarter_input: "Your other Insurer B ILP APE credits this quarter",
      detail: "Sample: 3% of APE credits from S$10,000 in the quarter, 6% from S$30,000; ILPs count 1.5×.",
    },
  ],
};
