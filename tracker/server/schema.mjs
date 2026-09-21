// The answer card the assistant must return, as a strict JSON schema. Every
// object closes additionalProperties and lists every property as required
// (nullable where the app treats it as optional), which is what OpenAI's
// strict structured outputs need. The shape mirrors the card the app's Ask
// sheet renders.

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const arr = (items) => ({ type: "array", items });
const obj = (properties, description) => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const d = (schema, description) => ({ ...schema, description });

/** What the assistant answers with once it has what it needs from the tools: a card the app renders. */
export const ANSWER_SCHEMA = obj({
  title: d(str, "Short heading, e.g. 'Top clients by premium, this year' or 'If you sell FWD Term at S$5,000/yr'."),
  summary: d(str, "One or two sentences with the figures that matter, to the advisor in the second person."),
  rows: d(arr(obj({ label: str, value: d(str, "The figure or short value, e.g. S$12,400 or 84 days."), sub: d(nstr, "Optional one-line detail under the label, else null.") })), "Up to eight rows. Empty when a sentence is enough."),
  note: d(nstr, "A caveat worth stating (what 'contact' means, an assumption), else null."),
});
