// PACKS_MOCK=1 (or --mock): canned answers with a short delay, so the
// assistant can be tried (and tested) without a key or spend.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  if (/what if|if i (sell|close|log)|one more/.test(q) && premium > 0) return call("what_if", { premium, product: /term|ci|critical|ilp|endowment|hospital|whole life/.exec(q)?.[0] ?? "", term_years: 0, when: "" });
  if (/elite|credits|trip|rung/.test(q)) return call("elite_status", {});
  if (/\bteam\b|my advisors/.test(q)) return call("team_status", {});
  if (/\bgoals\b|\btargets?\b|wape/.test(q)) return call("goals_status", {});
  if (/by month|monthly|month|january|february|march|april|\bmay\b|june|july|august|september|october|november|december|best month/.test(q)) return call("production_by_month", { months: 12 });
  if (/pace|track|progress|mdrt|goal/.test(q)) return call("pace_status", {});
  return { role: "assistant", content: JSON.stringify({ title: "Not in the app", summary: "I can only answer about the production, pace, Elite credits and goals in this app.", rows: [], note: null }) };
}
