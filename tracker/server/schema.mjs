// The report the model must return, as a strict JSON schema shared by both
// report providers. Every object closes additionalProperties and lists every
// property as required (nullable where the app treats it as optional), which
// is what OpenAI's strict structured outputs and Claude's json_schema format
// both need. The shape mirrors ReportContent in the app (src/mock/packs.ts)
// minus the attachments card, which the app builds itself from the files.

const str = { type: "string" };
const num = { type: "number" };
const bool = { type: "boolean" };
const nstr = { type: ["string", "null"] };
const nnum = { type: ["number", "null"] };
const en = (...values) => ({ type: "string", enum: values });
const arr = (items) => ({ type: "array", items });
const obj = (properties, description) => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const d = (schema, description) => ({ ...schema, description });

export const SOURCE = en("recap", "photo", "document", "typed");
const sources = d(arr(SOURCE), "Which inputs this card drew on. Only kinds that were actually supplied.");

/** The eight cards a consultant can flag for rework, in report order. */
export const REWORKABLE = ["summary", "situation", "priorities", "cover", "cashflow", "options", "questions", "next"];

export const CARDS = {
  summary: obj({ text: d(str, "One or two sentences to the client: what they want and what was agreed today."), sources }),
  situation: obj({ facts: arr(obj({ label: d(str, "Age, Family, Work, Income, Expenses, Employer cover, …"), value: d(str, "34 · Married, Kai 3 · S$7,800/mo") })), sources }),
  priorities: obj({
    items: arr(obj({ text: str, horizon: d(str, "Now · By 2041 · 2052"), now: d(bool, "true for the immediate priority") })),
    sources,
  }),
  cover: obj({
    rows: arr(
      obj({
        label: d(str, "Death · Total permanent disability · Critical illness"),
        have: d(num, "Cover in place, in dollars. 0 when nothing is in place."),
        need: d(num, "Cover agreed as needed, in dollars."),
        haveLabel: d(str, "S$300k of S$1.2M · none of S$300k"),
        shortLabel: d(str, "S$900k short · S$300k short · nothing in place · Covered"),
      }),
    ),
    flagged: d(nullable(obj({ label: str, text: str })), "One gap outside the rows worth flagging, e.g. Hospital: MediShield Life only, no Integrated Shield Plan. Null if none."),
    sources,
  }),
  cashflow: obj({
    total: d(num, "Monthly income in dollars. 0 when unknown (then rows is empty)."),
    totalLabel: d(str, "S$7,800"),
    rows: arr(
      obj({
        label: d(str, "Expenses · Savings · Investing · Protection · Not yet placed"),
        amount: d(num, "Dollars per month. Rows sum to total."),
        kind: d(en("neutral", "set", "proposed", "unplaced"), "neutral = spending · set = already set aside · proposed = proposed today · unplaced = not yet placed"),
        sub: d(nstr, "Short qualifier such as 'proposed today', else null."),
      }),
    ),
    sources,
  }),
  options: obj({
    items: arr(
      obj({
        name: d(str, "Insurer and plan as discussed, e.g. Tokio Marine Term"),
        detail: d(str, "S$1.2M · 30 years"),
        premium: d(str, "Monthly, as 'about S$95'"),
        reaction: en("liked", "compare", "declined"),
        reactionText: d(str, "You liked this · Want to compare against FWD · Not for now"),
        product_id: d(nstr, "The id from the product list when the plan matches one of them, else null."),
        annual_premium: d(nnum, "Yearly premium in dollars when known (monthly × 12), else null."),
        term_years: d(nnum, "Policy term in years when known, else null."),
      }),
    ),
    note: d(nstr, "Anything parked for the next review, else null."),
    sources,
  }),
  questions: obj({ items: arr(obj({ quote: d(str, "The client's question or objection, as a short quote."), answer: d(str, "The answer given or the position agreed.") })), sources }),
  next: obj({ items: arr(obj({ date: d(str, "Thu 18 Sep · Week of 14 Sep"), text: d(str, "One concrete agreed action.") })), sources }),
  private: obj(
    {
      referrals: arr(obj({ name: str, text: d(str, "Who they are and why the client mentioned them.") })),
      testimonial: nullable(obj({ agreed: bool, text: str })),
    },
    "Consultant-only. Never shown to the client.",
  ),
};

export const REPORT_SCHEMA = obj({
  meeting: obj({ kind: d(en("First meeting", "Review", "Closing"), "From context; Review when unclear.") }),
  ...CARDS,
  numbers: d(
    arr(
      obj({
        label: d(str, "Income · CI cover · Retire at · Budget"),
        value: d(str, "As it should be checked: S$7,800 / month · S$300,000 · 60"),
        source: SOURCE,
        source_note: d(str, "read off the whiteboard · heard “three hundred” in the recap · from the notes PDF, page 1"),
      }),
    ),
    "Two to six figures the report relies on that were read off an input. The consultant confirms each against its original before approving.",
  ),
});

export const REWORK_SCHEMA = obj(Object.fromEntries(REWORKABLE.map((code) => [code, d(nullable(CARDS[code]), `The revised ${code} card, or null when it was not asked for.`)])));

/** What the assistant answers with once it has what it needs from the tools: a card the app renders. */
export const ANSWER_SCHEMA = obj({
  title: d(str, "Short heading, e.g. 'Top clients by premium, this year' or 'If you sell FWD Term at S$5,000/yr'."),
  summary: d(str, "One or two sentences with the figures that matter, to the advisor in the second person."),
  rows: d(arr(obj({ label: str, value: d(str, "The figure or short value, e.g. S$12,400 or 84 days."), sub: d(nstr, "Optional one-line detail under the label, else null.") })), "Up to eight rows. Empty when a sentence is enough."),
  note: d(nstr, "A caveat worth stating (what 'contact' means, an assumption), else null."),
});
