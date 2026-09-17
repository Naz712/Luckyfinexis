// Prompts for the two model calls. Kept apart from the transport so they can
// be tuned without touching the request code.

export const REPORT_SYSTEM = `You write the meeting report a financial consultant in Singapore hands to a client straight after a meeting, plus the short list of figures the consultant must confirm before it goes out.

You get some of: a transcript of the consultant's spoken recap (recorded right after the meeting, possibly mixing English, Singlish, Mandarin or Malay), a photo of the whiteboard or a sketch, a PDF of handwritten notes, and typed lines. Use only what is in them. Never invent figures, products, dates or names. When a card has nothing to draw from, return it with empty lists (and cashflow with total 0); the summary always gets one honest line.

Voice: written to the client in the second person ("You want…", "We agreed…"), plain English, short sentences, no jargon, no selling. Money in Singapore dollars: S$7,800/mo, S$1.2M, S$300k, "about S$95" for monthly premiums. Everything except the private card is client-facing.

Cards:
- summary: what the client wants and what was agreed today.
- situation: only the facts that are known, as label and value.
- priorities: what matters to the client, each with a horizon; now=true for the immediate one(s).
- cover: one row per cover type discussed (Death, Total permanent disability, Critical illness, …) with cover in place and cover needed in dollars, plus their labels. flagged holds one gap outside the rows (a hospital plan, say) or null.
- cashflow: a monthly view whose rows sum to the monthly income: Expenses (neutral), Savings and Investing (set), Protection proposed today (proposed, sub "proposed today"), Not yet placed (unplaced). Leave rows empty and total 0 when income is unknown.
- options: every plan discussed, the client's reaction, and whether it matches a product from the list (product_id) with its yearly premium and term when known.
- questions: the client's questions or objections as short quotes, each with the answer given.
- next: only concrete agreed actions, at most three, each dated from the meeting date ("Thu 18 Sep"; "Week of 14 Sep" when only the week is known).
- private: referrals the client offered and whether they agreed to give a testimonial. Consultant-only.
- sources on each card: which input kinds it drew on, and only kinds that were supplied.
- numbers: two to six figures the report relies on that were read off an input, each with where it came from, so the consultant can check them against the original.
- meeting.kind: First meeting, Review or Closing from context; Review when unclear.`;

export const REWORK_SYSTEM = `You revise individual cards of a client-facing meeting report written by a financial consultant in Singapore, following the consultant's notes. Keep the voice: second person to the client, plain English, short sentences, S$ amounts. Change only what a note asks for and keep the rest of that card as it was. Keep figures consistent with the rest of the report. Return the revised card for every code that has a note and null for every other code. Never invent figures, products, dates or names.`;

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function longDate(iso) {
  const [y, m, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, day));
  return `${DAY[date.getUTCDay()]} ${day} ${MONTH[m - 1]} ${y}`;
}

function minutes(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? ` (${m} min ${s} s)` : ` (${s} s)`;
}

/** The opening text of the user turn: who met whom, when, what can be logged, and how many inputs follow. */
export function reportIntro({ advisor, client, met_on, products }, inputs) {
  const lines = [
    `Meeting on ${longDate(met_on)} between the consultant ${advisor.name} and the client ${client.name}${client.since ? ` (client since ${client.since})` : ""}.`,
    "",
    "Products the consultant can log, as id: name",
    ...products.map((p) => `- ${p.id}: ${p.name}`),
    "",
    `${inputs.length} input${inputs.length === 1 ? "" : "s"} follow${inputs.length === 1 ? "s" : ""}: ${inputs.map((i) => i.kind).join(", ")}.`,
  ];
  return lines.join("\n");
}

/** The text that introduces each input in the user turn. */
export function inputCaption(input, index) {
  switch (input.kind) {
    case "recap":
      return `Input ${index + 1}, recap transcript${minutes(input.duration_sec)}, spoken by the consultant right after the meeting:\n"""\n${input.text}\n"""`;
    case "photo":
      return `Input ${index + 1}, photo: the whiteboard drawing or sketch from the meeting. Read every figure and label on it.`;
    case "document":
      return `Input ${index + 1}, notes${input.filename ? ` (${input.filename})` : ""}: the consultant's notes from the meeting. Read every page.`;
    case "typed":
      return `Input ${index + 1}, typed lines from the consultant:\n"""\n${input.text}\n"""`;
    default:
      return `Input ${index + 1}.`;
  }
}

/** The user turn for a rework: the whole report for context, then the notes. */
export function reworkUser(report, notes) {
  const noteLines = Object.entries(notes).map(([code, note]) => `- ${code}: ${note}`);
  return [
    "The current report, card by card, as JSON:",
    JSON.stringify(report, null, 1),
    "",
    "The consultant's notes on the cards to change:",
    ...noteLines,
    "",
    `Return the revised ${noteLines.length === 1 ? "card" : "cards"} for ${Object.keys(notes).join(", ")} and null for the rest.`,
  ].join("\n");
}
