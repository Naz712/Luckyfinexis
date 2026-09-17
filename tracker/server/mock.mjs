// PACKS_MOCK=1: canned answers with a short delay, so the whole flow can be
// tried (and tested) without keys or spend. The report changes with the
// inputs it is given, so the app's markers and numbers stay honest.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const only = (kinds, ...wanted) => wanted.filter((k) => kinds.has(k));

export async function make({ client, inputs }) {
  const kinds = new Set(inputs.map((i) => i.kind));
  await wait(900 * inputs.length + 400);
  const name = client?.name ?? "the client";
  const first = name.split(" ")[0];
  const evidence = only(kinds, "photo", "document", "recap", "typed");
  const numbers = [];
  if (kinds.has("photo")) numbers.push({ label: "Income", value: "S$6,400 / month", source: "photo", source_note: "read off the whiteboard" });
  if (kinds.has("recap")) numbers.push({ label: "Term cover", value: "S$800,000", source: "recap", source_note: "heard “eight hundred” in the recap" });
  if (kinds.has("document")) numbers.push({ label: "Budget", value: "S$350 / month", source: "document", source_note: "from the notes, page 1" });
  if (kinds.has("typed")) numbers.push({ label: "Retire at", value: "62", source: "typed", source_note: "from the typed lines" });
  const recap = inputs.find((i) => i.kind === "recap");
  return {
    meeting: { kind: "Review" },
    recording_deleted_at: recap ? new Date().toTimeString().slice(0, 5) : null,
    transcript: recap ? `Mock transcript for ${name}: ${Math.round((recap.bytes ?? 0) / 1024)} KB of audio received and dropped.` : null,
    pages: Object.fromEntries(inputs.filter((i) => i.kind === "document").map((i) => [i.id, i.pages ?? 1])),
    timings: { transcribe_ms: recap ? 900 : 0, report_ms: 900 * inputs.length },
    numbers,
    report: {
      summary: { text: `${first}, you want the mortgage covered and a critical illness plan in place this year. Today we agreed to start with term cover and look at critical illness once the budget is confirmed.`, sources: only(kinds, "recap", "typed") },
      situation: {
        facts: [
          { label: "Age", value: "41" },
          { label: "Family", value: "Married, two children" },
          { label: "Income", value: "S$6,400/mo" },
          { label: "Mortgage", value: "S$480k outstanding" },
        ],
        sources: only(kinds, "photo", "document", "recap", "typed"),
      },
      priorities: {
        items: [
          { text: "Cover the mortgage", horizon: "Now", now: true },
          { text: "Critical illness plan", horizon: "This year", now: false },
          { text: "Retire at 62", horizon: "2047", now: false },
        ],
        sources: only(kinds, "recap", "typed"),
      },
      cover: {
        rows: [
          { label: "Death", have: 200000, need: 800000, haveLabel: "S$200k of S$800k", shortLabel: "S$600k short" },
          { label: "Critical illness", have: 0, need: 200000, haveLabel: "none of S$200k", shortLabel: "S$200k short · nothing in place" },
        ],
        flagged: kinds.has("photo") ? { label: "Hospital", text: "Integrated Shield Plan in place, rider lapsed" } : null,
        sources: evidence,
      },
      cashflow: kinds.has("photo")
        ? {
            total: 6400,
            totalLabel: "S$6,400",
            rows: [
              { label: "Expenses", amount: 4300, kind: "neutral" },
              { label: "Savings", amount: 1000, kind: "set" },
              { label: "Protection", amount: 350, kind: "proposed", sub: "proposed today" },
              { label: "Not yet placed", amount: 750, kind: "unplaced" },
            ],
            sources: ["photo"],
          }
        : { total: 0, totalLabel: "", rows: [], sources: [] },
      options: {
        items: [
          { name: "FWD Term", detail: "S$800k · 25 years", premium: "about S$70", reaction: "liked", reactionText: "You liked this", log: { product_id: "prd_14", premium: 840, term_years: 25 } },
          { name: "FWD Critical Illness", detail: "S$200k", premium: "about S$160", reaction: "compare", reactionText: "Want to compare against HSBC Life" },
        ],
        note: "Not covered today: the children's education fund. Parked for the next review.",
        sources: only(kinds, "recap", "typed", "document"),
      },
      questions: {
        items: [{ quote: "Is S$350 a month enough for both?", answer: "The term plan at about S$70 fits inside it. Critical illness at about S$160 fits too, with S$120 to spare; we confirm the exact figure once the quotes are in." }],
        sources: only(kinds, "recap"),
      },
      next: {
        items: [
          { date: "Fri 11 Sep", text: "Quotes for FWD Term and the two critical illness plans" },
          { date: "Wed 16 Sep", text: "We meet again, 7 pm, video call" },
        ],
        sources: only(kinds, "recap", "typed"),
      },
      private: { referrals: [{ name: "Daniel", text: "Colleague, just bought a flat" }], testimonial: null },
    },
  };
}

/** Prefixes the first string in each noted card so the change is visible. */
function markFirst(card, note) {
  const copy = JSON.parse(JSON.stringify(card));
  const visit = (o) => {
    if (!o || typeof o !== "object") return false;
    for (const k of Object.keys(o)) {
      if (k === "sources") continue;
      if (typeof o[k] === "string" && o[k].length > 0) {
        o[k] = `Reworked (${note}): ${o[k]}`;
        return true;
      }
      if (visit(o[k])) return true;
    }
    return false;
  };
  visit(copy);
  return copy;
}

export async function rework({ report, notes }) {
  await wait(1200);
  const cards = {};
  for (const [code, note] of Object.entries(notes)) if (report?.[code]) cards[code] = markFirst(report[code], note);
  return cards;
}

/** The assistant in mock mode: a keyword router that returns one tool call, then turns the tool's result into the answer card. */
export async function ask({ messages }) {
  await wait(500);
  const last = messages[messages.length - 1];
  if (last?.role === "tool") {
    let r = null;
    try {
      r = JSON.parse(last.content);
    } catch {}
    const rows = Array.isArray(r?.rows) ? r.rows.map((x) => ({ label: String(x.label), value: String(x.value), sub: x.sub ? String(x.sub) : null })) : [];
    return { role: "assistant", content: JSON.stringify({ title: r?.label ?? "Answer", summary: r?.summary ?? "", rows, note: r?.note ?? null }) };
  }
  const q = String(last?.content ?? "").toLowerCase();
  const amount = q.match(/(?:s\$|\$)\s*(\d[\d,]*)\s*(k)?|\b(\d[\d,]*)\s*(k)\b|\b(\d{3,})\b/);
  const premium = amount ? Number((amount[1] ?? amount[3] ?? amount[5] ?? "0").replace(/,/g, "")) * (amount[2] || amount[4] ? 1000 : 1) : 0;
  const call = (name, args) => ({ role: "assistant", content: null, tool_calls: [{ id: `call_mock_${Date.now()}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
  if (/\bpass(es)?\b|\bdraws?\b|lucky|prize/.test(q)) return /prize|when|next|status/.test(q) ? call("draw_status", {}) : call("draw_passes", { month: /all|whole|campaign/.test(q) ? "all" : "current", limit: 6 });
  if (/\bteam\b|my advisors/.test(q)) return call("team_status", {});
  if (/\bgoals\b|\btargets?\b|wape|referral|testimonial/.test(q)) return call("goals_status", {});
  if (/what if|if i (sell|close|log)|one more/.test(q) && premium > 0) return call("what_if", { premium, product: /term|ci|critical|ilp|endowment|hospital|whole life|fund/.exec(q)?.[0] ?? "", term_years: 0, when: "" });
  if (/best|top|biggest/.test(q)) return call("top_clients", { by: /commission/.test(q) ? "commission" : "premium", period: "year", limit: 5 });
  if (/not talked|haven|quiet|while|long time/.test(q)) return call("quiet_clients", { days: 60, limit: 6 });
  if (/pending|pipeline/.test(q)) return call("pipeline", {});
  if (/recent|this month|this week/.test(q)) return call("recent_cases", { days: 30 });
  if (/pace|track|progress|mdrt|goal/.test(q)) return call("pace_status", {});
  return { role: "assistant", content: JSON.stringify({ title: "Not in the app", summary: "I can only answer about the clients, cases and pace in this app.", rows: [], note: null }) };
}
