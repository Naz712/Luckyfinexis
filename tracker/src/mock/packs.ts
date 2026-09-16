// Meeting Pack mock data. Shapes mirror the tables the feature would use
// (see tracker/README.md "Meeting Pack"); values are fixed sample data for
// one draft pack (Serene Wee, 5 Sep 2026, the day before the pinned TODAY) and
// two approved ones earlier that week.
//
// Everything here is PLACEHOLDER content: in the app it would come from the
// pack record and the extractions the backend produces from the recap,
// photos and notes. The recording is never stored; only its transcript is.

export type PackKind = "First meeting" | "Review" | "Closing";
export type PackStatus = "draft" | "approved";
/** The four kinds of thing a consultant can drop into a pack. */
export type PackSource = "recap" | "photo" | "document" | "typed";

export interface Pack {
  id: string;
  advisor_id: string;
  client_id: string;
  client_name: string;
  kind: PackKind;
  /** ISO date. */
  met_on: string;
  duration_min: number | null;
  status: PackStatus;
  /** ISO datetime, or null while a draft. */
  approved_at: string | null;
  /** "12:41" — shown in the footer small print. null while nothing has been recorded. */
  recording_deleted_at: string | null;
  /** Cases logged from this pack (the "1 case logged" chip). */
  cases_logged: number;
}

export interface PackInput {
  id: string;
  pack_id: string;
  kind: PackSource;
  /** "Sketch · whiteboard" */
  label: string;
  /** "Read · 3 numbers found" */
  detail: string;
  duration_sec: number | null;
  pages: number | null;
  /** null for typed input and for a deleted recording. */
  file_url: string | null;
  /** The typed lines, or the transcript. */
  body: string | null;
  /** false for recordings (deleted once transcribed), true for everything else. */
  retained: boolean;
}

/** One extracted figure the consultant confirms against its original before the pack can be approved. */
export interface PackNumber {
  id: string;
  pack_id: string;
  /** "Income" */
  label: string;
  /** "S$7,800 / month" */
  value: string;
  source: PackSource;
  /** "read off the whiteboard" */
  source_note: string;
  /** Crop of the original the figure was read from. */
  crop_url: string;
  confirmed: boolean;
}

export type CardCode = "summary" | "attachments" | "situation" | "priorities" | "cover" | "cashflow" | "options" | "questions" | "next" | "private";

export interface Attachment {
  kind: "photo" | "document";
  /** "Whiteboard photo" */
  title: string;
  /** "15 Sep, 12:38 · read, 3 numbers" */
  caption: string;
  /** Full-size original (the page images for a PDF). */
  urls: string[];
  /** Chips under the viewer: "3 numbers read", "Kept with this report". */
  chips: string[];
}

export interface CoverRow {
  label: string;
  /** In dollars. */
  have: number;
  need: number;
  /** "S$300k of S$1.2M" */
  haveLabel: string;
  /** "S$900k short" */
  shortLabel: string;
}

export interface CashflowRow {
  label: string;
  amount: number;
  /** neutral = spending, set = already set aside, proposed = proposed today, unplaced = not yet placed */
  kind: "neutral" | "set" | "proposed" | "unplaced";
  /** "proposed today" */
  sub?: string;
}

export interface OptionRow {
  name: string;
  /** "S$1.2M · 30 years" */
  detail: string;
  /** "about S$95" */
  premium: string;
  reaction: "liked" | "compare" | "declined";
  /** "You liked this" / "Want to compare against FWD" */
  reactionText: string;
  /** For "Log the term case": the product and premium to prefill. */
  log?: { product_id: string; premium: number; term_years: number };
}

/** Everything the report renders, card by card. `sources` per card drive the element markers. */
export interface ReportContent {
  summary: { text: string; sources: PackSource[] };
  attachments: { items: Attachment[]; sources: PackSource[] };
  situation: { facts: { label: string; value: string }[]; sources: PackSource[] };
  priorities: { items: { text: string; horizon: string; now: boolean }[]; sources: PackSource[] };
  cover: { rows: CoverRow[]; flagged: { label: string; text: string } | null; sources: PackSource[] };
  cashflow: { total: number; totalLabel: string; rows: CashflowRow[]; sources: PackSource[] };
  options: { items: OptionRow[]; note: string | null; sources: PackSource[] };
  questions: { items: { quote: string; answer: string }[]; sources: PackSource[] };
  next: { items: { date: string; text: string }[]; sources: PackSource[] };
  /** Consultant-only. Left out of the shared PDF. */
  private: {
    referrals: { name: string; text: string }[];
    testimonial: { agreed: boolean; text: string } | null;
  };
}

/** Card titles as the report shows them. */
export const CARD_TITLE: Record<CardCode, string> = {
  summary: "In one line",
  attachments: "Attached",
  situation: "Your situation",
  priorities: "What matters to you",
  cover: "Cover today vs what we agreed you need",
  cashflow: "Where the money goes each month",
  options: "Options we looked at",
  questions: "What you asked about",
  next: "Next",
  private: "Just for you",
};

export const SOURCE_LABEL: Record<PackSource, string> = { recap: "Recap", photo: "Drawing", document: "Notes", typed: "Typed" };
/** "From the whiteboard drawing" — the accessible name of an icon-only marker. */
export const SOURCE_LONG: Record<PackSource, string> = {
  recap: "From the recap",
  photo: "From the whiteboard drawing",
  document: "From the notes",
  typed: "From the typed lines",
};

/** Where the placeholder attachment images live (relative to the app's base URL). */
export const PACK_ASSET = {
  whiteboard: "packs/whiteboard.jpg",
  notes1: "packs/notes-p1.jpg",
  notes2: "packs/notes-p2.jpg",
  cropIncome: "packs/crop-income.jpg",
  cropCi: "packs/crop-ci.jpg",
  cropRetire: "packs/crop-retire.jpg",
} as const;

export const packs: Pack[] = [
  { id: "pack_03", advisor_id: "adv_01", client_id: "cli_014", client_name: "Serene Wee", kind: "Review", met_on: "2026-09-05", duration_min: 47, status: "draft", approved_at: null, recording_deleted_at: "12:41", cases_logged: 0 },
  { id: "pack_02", advisor_id: "adv_01", client_id: "cli_019", client_name: "Oliver Yeo", kind: "First meeting", met_on: "2026-09-02", duration_min: 38, status: "approved", approved_at: "2026-09-02T15:20:00", recording_deleted_at: "14:52", cases_logged: 0 },
  { id: "pack_01", advisor_id: "adv_01", client_id: "cli_015", client_name: "Ravi Nathan", kind: "Closing", met_on: "2026-08-31", duration_min: 25, status: "approved", approved_at: "2026-08-31T11:05:00", recording_deleted_at: "10:44", cases_logged: 1 },
];

export const pack_inputs: PackInput[] = [
  { id: "in_01", pack_id: "pack_03", kind: "recap", label: "Recap", detail: "2 min 14 s · Transcribed", duration_sec: 134, pages: null, file_url: null, body: "(transcript held by the backend until approval)", retained: false },
  { id: "in_02", pack_id: "pack_03", kind: "photo", label: "Sketch · whiteboard", detail: "Read · 3 numbers found", duration_sec: null, pages: null, file_url: PACK_ASSET.whiteboard, body: null, retained: true },
  { id: "in_03", pack_id: "pack_03", kind: "document", label: "Notes · PDF", detail: "2 pages · Read", duration_sec: null, pages: 2, file_url: PACK_ASSET.notes1, body: null, retained: true },
  { id: "in_04", pack_id: "pack_02", kind: "recap", label: "Recap", detail: "1 min 48 s · Transcribed", duration_sec: 108, pages: null, file_url: null, body: null, retained: false },
  { id: "in_05", pack_id: "pack_02", kind: "typed", label: "Typed", detail: "4 lines", duration_sec: null, pages: null, file_url: null, body: "first child due Dec · no cover · budget 250 · wants term", retained: true },
  { id: "in_06", pack_id: "pack_01", kind: "recap", label: "Recap", detail: "1 min 05 s · Transcribed", duration_sec: 65, pages: null, file_url: null, body: null, retained: false },
];

export const pack_numbers: PackNumber[] = [
  { id: "num_01", pack_id: "pack_03", label: "Income", value: "S$7,800 / month", source: "photo", source_note: "read off the whiteboard", crop_url: PACK_ASSET.cropIncome, confirmed: true },
  { id: "num_02", pack_id: "pack_03", label: "CI cover", value: "S$300,000", source: "recap", source_note: "heard “three hundred” in the recap", crop_url: PACK_ASSET.cropCi, confirmed: true },
  { id: "num_03", pack_id: "pack_03", label: "Retire at", value: "60", source: "document", source_note: "from the notes PDF", crop_url: PACK_ASSET.cropRetire, confirmed: false },
];

const sereneReport: ReportContent = {
  summary: {
    text: "You want your income protected before Kai starts school. Today we agreed to start with a term plan, and to look at critical illness and a hospital plan once the budget is confirmed.",
    sources: ["recap"],
  },
  attachments: {
    items: [
      { kind: "photo", title: "Whiteboard photo", caption: "5 Sep, 12:38 · read, 3 numbers", urls: [PACK_ASSET.whiteboard], chips: ["3 numbers read", "Kept with this report"] },
      { kind: "document", title: "Fact-find notes", caption: "PDF · 2 pages", urls: [PACK_ASSET.notes1, PACK_ASSET.notes2], chips: ["2 pages", "Kept with this report"] },
    ],
    sources: ["photo", "document"],
  },
  situation: {
    facts: [
      { label: "Age", value: "34" },
      { label: "Family", value: "Married, Kai 3" },
      { label: "Work", value: "Marketing manager" },
      { label: "Income", value: "S$7,800/mo" },
      { label: "Expenses", value: "S$5,100/mo" },
      { label: "Employer cover", value: "S$300k death" },
    ],
    sources: ["document", "photo"],
  },
  priorities: {
    items: [
      { text: "Protect the family income", horizon: "Now", now: true },
      { text: "University fund for Kai", horizon: "By 2041", now: false },
      { text: "Retire at 60", horizon: "2052", now: false },
    ],
    sources: ["recap"],
  },
  cover: {
    rows: [
      { label: "Death", have: 300000, need: 1200000, haveLabel: "S$300k of S$1.2M", shortLabel: "S$900k short" },
      { label: "Total permanent disability", have: 300000, need: 1200000, haveLabel: "S$300k of S$1.2M", shortLabel: "S$900k short" },
      { label: "Critical illness", have: 0, need: 300000, haveLabel: "none of S$300k", shortLabel: "S$300k short · nothing in place" },
    ],
    flagged: { label: "Hospital", text: "MediShield Life only, no Integrated Shield Plan" },
    sources: ["photo"],
  },
  cashflow: {
    total: 7800,
    totalLabel: "S$7,800",
    rows: [
      { label: "Expenses", amount: 5100, kind: "neutral" },
      { label: "Savings", amount: 1300, kind: "set" },
      { label: "Investing", amount: 500, kind: "set" },
      { label: "Protection", amount: 400, kind: "proposed", sub: "proposed today" },
      { label: "Not yet placed", amount: 500, kind: "unplaced" },
    ],
    sources: ["photo"],
  },
  options: {
    items: [
      { name: "Tokio Marine Term", detail: "S$1.2M · 30 years", premium: "about S$95", reaction: "liked", reactionText: "You liked this", log: { product_id: "prd_11", premium: 1140, term_years: 30 } },
      { name: "HSBC Life Critical Illness", detail: "S$300k", premium: "about S$210", reaction: "compare", reactionText: "Want to compare against FWD" },
      { name: "Manulife Hospital Plan", detail: "Integrated Shield Plan", premium: "about S$35", reaction: "liked", reactionText: "You liked this" },
    ],
    note: "Not covered today: retirement top-up. Parked for the next review.",
    sources: ["recap"],
  },
  questions: {
    items: [
      {
        quote: "I can only do about four hundred a month for now.",
        answer: "The term plan at about S$95 a month fits inside that, and the hospital plan at about S$35 leaves room. Critical illness is the one we revisit once the budget is confirmed.",
      },
      {
        quote: "My company already covers me.",
        answer: "Your employer cover is S$300k for death only, with no critical illness, and it ends when you leave the job. That is the S$900k gap on the chart above.",
      },
    ],
    sources: ["recap"],
  },
  next: {
    items: [
      { date: "Thu 18 Sep", text: "I send the term quote and the CI comparison" },
      { date: "Fri 26 Sep", text: "We meet again, 4 pm, Tampines" },
    ],
    sources: ["recap", "document"],
  },
  private: {
    referrals: [{ name: "Priya", text: "A colleague, expecting her first child. Intro after 26 Sep." }],
    testimonial: { agreed: true, text: "She is happy to give one. Ask at the December review." },
  },
};

const oliverReport: ReportContent = {
  summary: { text: "Your first child is due in December and you have no cover of your own yet. Today we agreed that a term plan comes first, sized to clear the mortgage.", sources: ["recap"] },
  attachments: { items: [], sources: [] },
  situation: {
    facts: [
      { label: "Age", value: "31" },
      { label: "Family", value: "Married, first child due Dec" },
      { label: "Work", value: "Software engineer" },
      { label: "Income", value: "S$9,200/mo" },
      { label: "Mortgage", value: "S$620k left" },
      { label: "Employer cover", value: "None" },
    ],
    sources: ["typed", "recap"],
  },
  priorities: {
    items: [
      { text: "Cover the mortgage if anything happens", horizon: "Now", now: true },
      { text: "Start a fund for the baby", horizon: "2027", now: false },
    ],
    sources: ["recap"],
  },
  cover: {
    rows: [{ label: "Death", have: 0, need: 900000, haveLabel: "none of S$900k", shortLabel: "S$900k short · nothing in place" }],
    flagged: null,
    sources: ["typed"],
  },
  cashflow: {
    total: 9200,
    totalLabel: "S$9,200",
    rows: [
      { label: "Expenses", amount: 6400, kind: "neutral" },
      { label: "Savings", amount: 1800, kind: "set" },
      { label: "Protection", amount: 250, kind: "proposed", sub: "proposed today" },
      { label: "Not yet placed", amount: 750, kind: "unplaced" },
    ],
    sources: ["typed"],
  },
  options: {
    items: [{ name: "Singlife Whole Life (par)", detail: "S$900k · 25 years", premium: "about S$1,430", reaction: "liked", reactionText: "You liked this", log: { product_id: "prd_02", premium: 17000, term_years: 25 } }],
    note: null,
    sources: ["recap"],
  },
  questions: { items: [{ quote: "Is term enough, or should it be whole life?", answer: "Term covers the mortgage years for the least premium. Whole life was the one you preferred for the cash value, so that is the quote I sent." }], sources: ["recap"] },
  next: { items: [{ date: "Fri 4 Sep", text: "Proposal signed · pending with Merlin" }], sources: ["recap"] },
  private: { referrals: [], testimonial: null },
};

const raviReport: ReportContent = {
  summary: { text: "You signed the Singlife Term plan today. Cover starts once underwriting clears, which should be inside two weeks.", sources: ["recap"] },
  attachments: { items: [], sources: [] },
  situation: {
    facts: [
      { label: "Age", value: "41" },
      { label: "Family", value: "Married, two children" },
      { label: "Work", value: "Operations manager" },
      { label: "Income", value: "S$8,100/mo" },
    ],
    sources: ["recap"],
  },
  priorities: { items: [{ text: "Income protection until the children finish school", horizon: "Now", now: true }], sources: ["recap"] },
  cover: { rows: [{ label: "Death", have: 400000, need: 800000, haveLabel: "S$400k of S$800k", shortLabel: "S$400k short" }], flagged: null, sources: ["recap"] },
  cashflow: { total: 8100, totalLabel: "S$8,100", rows: [{ label: "Expenses", amount: 5900, kind: "neutral" }, { label: "Savings", amount: 1400, kind: "set" }, { label: "Protection", amount: 392, kind: "set" }], sources: ["recap"] },
  options: { items: [{ name: "Singlife Term", detail: "S$400k · 10 years", premium: "S$392", reaction: "liked", reactionText: "Signed today", log: { product_id: "prd_01", premium: 4700, term_years: 10 } }], note: null, sources: ["recap"] },
  questions: { items: [], sources: [] },
  next: { items: [{ date: "Mon 14 Sep", text: "Underwriting decision expected" }], sources: ["recap"] },
  private: { referrals: [], testimonial: null },
};

export const pack_reports: Record<string, ReportContent> = { pack_03: sereneReport, pack_02: oliverReport, pack_01: raviReport };

/** The three inputs a brand-new pack starts with in the mockup, so "Make report" has something to process. */
export function sampleInputsFor(packId: string): PackInput[] {
  return pack_inputs.filter((i) => i.pack_id === "pack_03").map((i, n) => ({ ...i, id: `${packId}_in_${n + 1}`, pack_id: packId }));
}
