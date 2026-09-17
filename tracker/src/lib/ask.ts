// The in-app assistant's tools. Every figure it can quote comes from these
// functions, which use the same calc.ts the screens use, over the same
// in-memory cases. The model (or, with no server, the keyword router at the
// bottom) only decides which tool to call and how to phrase the result. The
// tools never see anything beyond this advisor's own book.
import { TODAY, products, type Advisor, type Case, type Client, type Product, type Tier } from "../mock/data";
import {
  casesForAdvisor,
  casesForClient,
  clientsForAdvisor,
  commissionForCase,
  estimateGrossRevenue,
  mdrtSnapshot,
  metricSnapshot,
  metricsForCase,
  parseISODate,
  periodBounds,
  productById,
  ROUTE_LABEL,
  toISODate,
  weeksLeftInYear,
  type GoalSet,
  type MdrtRoute,
} from "./calc";
import { paceText, sgd, shortDate } from "./format";

export interface AnswerRow {
  label: string;
  value: string;
  sub?: string;
}

/** What the popup renders. `basis` names the tools the figures came from. */
export interface Answer {
  title: string;
  summary: string;
  rows: AnswerRow[];
  note?: string;
  basis: string[];
}

/** What a tool returns: presentable rows plus the raw facts, so the model can rephrase and the stand-in can show it as is. */
export interface ToolResult {
  label: string;
  summary: string;
  rows: AnswerRow[];
  note?: string;
  facts: Record<string, unknown>;
}

export interface AskContext {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
}

export const SUGGESTIONS = ["Who are my best clients?", "Who have I not talked to in a while?", "If I sell a S$5,000 term plan next month, what's my pace?"];

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };
const DAY = 86_400_000;

// ── Tool definitions, in the OpenAI function-calling shape ──

export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "top_clients",
      description: "The advisor's biggest clients, ranked by premium written, commission earned, MDRT credit or number of cases. Use for 'best', 'top', 'biggest' clients.",
      parameters: {
        type: "object",
        properties: {
          by: { type: "string", enum: ["premium", "commission", "mdrt", "cases"], description: "What to rank by. premium when unsure." },
          period: { type: "string", enum: ["year", "all"], description: "This calendar year, or the whole book." },
          limit: { type: "integer", description: "How many to list, 1 to 10." },
        },
        required: ["by", "period", "limit"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "quiet_clients",
      description: "Clients with no case logged for at least N days, longest silence first. Use for 'not talked to', 'haven't heard from', 'quiet', 'neglected'. The app has no call or meeting log, so the last logged case stands in for last contact.",
      parameters: {
        type: "object",
        properties: { days: { type: "integer", description: "Minimum days since the last case. 60 when unsure." }, limit: { type: "integer", description: "How many to list, 1 to 10." } },
        required: ["days", "limit"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "client_detail",
      description: "One client: their cases with product, premium, status and date, plus totals and last contact.",
      parameters: { type: "object", properties: { name: { type: "string", description: "The client's name, or part of it." } }, required: ["name"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "pace_status",
      description: "Where the advisor stands against their goal: the MDRT tier they aim for, the route they are closest on, credit counted and pending, what is still to go, the pace needed and the weeks left. Also the commission this year against its target if one is set.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "what_if",
      description: "What one more case would do: the commission it pays, the MDRT credit it adds on the closest route, the progress and pace before and after. Use for 'what if I sell…', 'if I close…', 'would a S$X case get me…'.",
      parameters: {
        type: "object",
        properties: {
          premium: { type: "number", description: "Annual premium in dollars (lump sum for single-premium products)." },
          product: { type: "string", description: "Product name or part of it (term, critical illness, ILP, endowment, hospital, whole life, fund). Empty when not said." },
          term_years: { type: "integer", description: "Policy term in years. 0 when not said." },
          when: { type: "string", description: "Confirmation date as YYYY-MM-DD, or empty for today." },
        },
        required: ["premium", "product", "term_years", "when"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pipeline",
      description: "Cases submitted but not yet confirmed, with the premium and commission waiting on them.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_cases",
      description: "Cases submitted in the last N days, newest first, with totals.",
      parameters: { type: "object", properties: { days: { type: "integer", description: "How far back to look. 30 when unsure." } }, required: ["days"], additionalProperties: false },
    },
  },
] as const;

// ── Helpers ──

const mine = (ctx: AskContext) => casesForAdvisor(ctx.advisor.id, ctx.cases).filter((c) => c.status !== "superseded");
const clip = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
};
const commissionOf = (c: Case) => commissionForCase(c.gross_revenue, c.banding_code_at_time);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const daysSince = (iso: string) => Math.max(0, Math.floor((TODAY.getTime() - parseISODate(iso).getTime()) / DAY));
const lastCaseOf = (cs: Case[]) => cs.reduce<string | null>((m, c) => (m === null || c.submitted_on > m ? c.submitted_on : m), null);
/** "14 Jan" this year, "14 Jan 2025" otherwise, so a long silence reads right. */
const dayOf = (iso: string) => {
  const d = parseISODate(iso);
  return d.getFullYear() === TODAY.getFullYear() ? shortDate(d) : `${shortDate(d)} ${d.getFullYear()}`;
};

/** Cases and clients are linked by name in the mock; a client with cases but no client row still counts. */
function book(ctx: AskContext): { name: string; client: Client | null; cases: Case[] }[] {
  const clients = clientsForAdvisor(ctx.advisor.id);
  const byName = new Map<string, { name: string; client: Client | null; cases: Case[] }>();
  for (const cl of clients) byName.set(cl.name, { name: cl.name, client: cl, cases: casesForClient(cl, ctx.cases) });
  for (const c of mine(ctx)) if (!byName.has(c.client_name)) byName.set(c.client_name, { name: c.client_name, client: null, cases: mine(ctx).filter((x) => x.client_name === c.client_name) });
  return [...byName.values()];
}

function findProduct(hint: string): Product | null {
  const h = hint.trim().toLowerCase();
  if (!h) return null;
  const exact = products.find((p) => p.id === h || p.name.toLowerCase() === h);
  if (exact) return exact;
  const byName = products.find((p) => p.name.toLowerCase().includes(h));
  if (byName) return byName;
  const kinds: [RegExp, (p: Product) => boolean][] = [
    [/critical|\bci\b/, (p) => /critical/i.test(p.name)],
    [/hospital|shield/, (p) => /hospital/i.test(p.name)],
    [/whole life/, (p) => /whole life/i.test(p.name)],
    [/\bterm\b/, (p) => /\bterm\b/i.test(p.name)],
    [/\bilp\b|investment.linked/, (p) => p.category === "ilp"],
    [/endowment|retirement|savings/, (p) => p.category === "endowment"],
    [/fund|unit trust|portfolio/, (p) => p.category === "fund"],
  ];
  for (const [re, pick] of kinds) if (re.test(h)) return products.find(pick) ?? null;
  return null;
}

/** The product this advisor writes most, for a what-if that names none. */
function usualProduct(ctx: AskContext): Product {
  const counts = new Map<string, number>();
  for (const c of mine(ctx)) counts.set(c.product_id, (counts.get(c.product_id) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (top && productById(top)) || products.find((p) => /\bterm\b/i.test(p.name)) || products[0]!;
}

const routeOf = (snap: ReturnType<typeof mdrtSnapshot>): MdrtRoute => snap.routes.find((r) => r.metric === snap.closer) ?? snap.routes[0]!;
const pctOf = (r: MdrtRoute) => `${Math.round(Math.min(1, r.projected / r.goalThreshold) * 100)}%`;

// ── The tools ──

function topClients(ctx: AskContext, args: Record<string, unknown>): ToolResult {
  const by = ["premium", "commission", "mdrt", "cases"].includes(String(args.by)) ? (String(args.by) as "premium" | "commission" | "mdrt" | "cases") : "premium";
  const period = args.period === "all" ? "all" : "year";
  const limit = clip(args.limit, 1, 10, 5);
  const year = periodBounds("jan_dec", TODAY);
  const inPeriod = (c: Case) => period === "all" || (parseISODate(c.submitted_on) >= year.start && parseISODate(c.submitted_on) <= year.end);
  const value = (cs: Case[]) => (by === "cases" ? cs.length : sum(cs.map((c) => (by === "premium" ? c.premium_amount : by === "commission" ? commissionOf(c) : metricsForCase(c).mdrt_commission))));
  const ranked = book(ctx)
    .map((b) => ({ ...b, cases: b.cases.filter(inPeriod) }))
    .filter((b) => b.cases.length > 0)
    .map((b) => ({ ...b, value: value(b.cases), pending: b.cases.filter((c) => c.status === "pending").length, last: lastCaseOf(b.cases)! }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const byLabel = { premium: "premium", commission: "commission", mdrt: "MDRT credit", cases: "cases" }[by];
  const periodLabel = period === "all" ? "whole book" : `this year`;
  return {
    label: `Top clients by ${byLabel}, ${periodLabel}`,
    summary: ranked.length === 0 ? `No cases ${periodLabel === "this year" ? "this year" : "on the book"} yet.` : `${ranked[0]!.name} leads on ${byLabel} with ${by === "cases" ? plural(ranked[0]!.value, "case") : sgd(ranked[0]!.value)}${ranked.length > 1 ? `, then ${ranked[1]!.name}` : ""}.`,
    rows: ranked.map((b) => ({ label: b.name, value: by === "cases" ? plural(b.value, "case") : sgd(b.value), sub: `${plural(b.cases.length, "case")}${b.pending ? ` · ${b.pending} pending` : ""} · last ${dayOf(b.last)}` })),
    note: by === "premium" ? "Premium is the annual premium as logged; lump sums count once." : by === "commission" ? "Commission at the band each case was logged under; pending cases included." : undefined,
    facts: { by, period, clients: ranked.map((b) => ({ name: b.name, value: Math.round(b.value), cases: b.cases.length, pending: b.pending, last_case: b.last })) },
  };
}

function quietClients(ctx: AskContext, args: Record<string, unknown>): ToolResult {
  const days = clip(args.days, 1, 3650, 60);
  const limit = clip(args.limit, 1, 10, 6);
  const rows = book(ctx)
    .map((b) => {
      const last = lastCaseOf(b.cases);
      const since = last ?? b.client?.since ?? toISODate(TODAY);
      return { name: b.name, last, since, days: daysSince(since), cases: b.cases.length };
    })
    .filter((b) => b.days >= days)
    .sort((a, b) => b.days - a.days);
  const shown = rows.slice(0, limit);
  return {
    label: `Quiet for ${days} days or more`,
    summary: rows.length === 0 ? `Everyone has a case logged within the last ${days} days.` : `${plural(rows.length, "client")} with nothing logged for ${days}+ days; ${shown[0]!.name} the longest at ${shown[0]!.days} days.`,
    rows: shown.map((b) => ({ label: b.name, value: `${b.days} days`, sub: b.last ? `last case ${dayOf(b.last)} · ${plural(b.cases, "case")}` : `no case yet · client since ${dayOf(b.since)}` })),
    note: "Contact here means the last case logged. The app has no call or meeting log yet, so a client you spoke to without a case still shows as quiet.",
    facts: { days, count: rows.length, clients: shown.map((b) => ({ name: b.name, days_since_last_case: b.days, last_case: b.last, cases: b.cases })) },
  };
}

function clientDetail(ctx: AskContext, args: Record<string, unknown>): ToolResult {
  const q = String(args.name ?? "").trim().toLowerCase();
  const all = book(ctx);
  const hit = all.find((b) => b.name.toLowerCase() === q) ?? all.find((b) => b.name.toLowerCase().startsWith(q)) ?? all.find((b) => b.name.toLowerCase().includes(q));
  if (!q || !hit) return { label: "Client", summary: `No client called “${args.name ?? ""}” in your book.`, rows: [], facts: { found: false, names: all.map((b) => b.name) } };
  const cs = hit.cases.slice().sort((a, b) => (a.submitted_on < b.submitted_on ? 1 : -1));
  const premium = sum(cs.map((c) => c.premium_amount));
  const commission = sum(cs.map(commissionOf));
  const last = lastCaseOf(cs);
  return {
    label: hit.name,
    summary: cs.length === 0 ? `${hit.name} has no case logged yet${hit.client ? `; client since ${dayOf(hit.client.since)}` : ""}.` : `${plural(cs.length, "case")}, ${sgd(premium)} premium and ${sgd(commission)} commission in total; last case ${dayOf(last!)}.`,
    rows: cs.map((c) => ({ label: productById(c.product_id)?.name ?? c.product_id, value: sgd(c.premium_amount), sub: `${c.status} · ${dayOf(c.submitted_on)}${c.premium_term_years > 1 ? ` · ${c.premium_term_years} yrs` : ""}` })),
    facts: { found: true, name: hit.name, since: hit.client?.since ?? null, cases: cs.length, premium: Math.round(premium), commission: Math.round(commission), last_case: last, days_since_last_case: last ? daysSince(last) : null },
  };
}

function paceStatus(ctx: AskContext): ToolResult {
  const cs = mine(ctx);
  const snap = mdrtSnapshot(ctx.advisor.id, cs, TODAY, ctx.goalSet);
  const route = routeOf(snap);
  const commission = metricSnapshot(ctx.advisor.id, cs, "commission", TODAY, ctx.goalSet);
  const toGo = Math.max(0, route.goalThreshold - route.projected);
  const weeks = weeksLeftInYear(TODAY);
  const rows: AnswerRow[] = [
    { label: "Aiming for", value: `${TIER_LABEL[snap.goalTier]} 2027`, sub: `${ROUTE_LABEL[route.metric]} route, your closest` },
    { label: "Counted so far", value: sgd(route.achieved), sub: route.projected > route.achieved ? `${sgd(route.projected - route.achieved)} more pending` : "nothing pending" },
    { label: "Threshold", value: sgd(route.goalThreshold), sub: `${pctOf(route)} there, pending included` },
    { label: "Still to go", value: sgd(toGo), sub: `${plural(weeks, "week")} left in the year` },
    { label: "Pace", value: paceText(route.pace, "sgd", route.goalReached) },
  ];
  if (commission.target) rows.push({ label: "Commission this year", value: sgd(commission.achieved), sub: `target ${sgd(commission.target)} · ${paceText(commission.pace, "sgd", commission.achieved >= commission.target)}` });
  return {
    label: "Your pace",
    summary: route.goalReached ? `${TIER_LABEL[snap.goalTier]} is reached on the ${ROUTE_LABEL[route.metric].toLowerCase()} route.` : `${pctOf(route)} of the way to ${TIER_LABEL[snap.goalTier]} on the ${ROUTE_LABEL[route.metric].toLowerCase()} route, ${sgd(toGo)} to go with ${weeks} weeks left. ${paceText(route.pace, "sgd", false)}.`,
    rows,
    facts: { tier: snap.goalTier, route: route.metric, counted: Math.round(route.achieved), projected: Math.round(route.projected), threshold: route.goalThreshold, to_go: Math.round(toGo), weeks_left: weeks, run_rate_projection: Math.round(route.pace.runRateProjection), required_per_week: route.pace.requiredPerWeek === null ? null : Math.round(route.pace.requiredPerWeek), on_track: route.pace.onTrack, commission_ytd: Math.round(commission.achieved), commission_target: commission.target },
  };
}

function whatIf(ctx: AskContext, args: Record<string, unknown>): ToolResult {
  const premium = Number(args.premium);
  if (!Number.isFinite(premium) || premium <= 0) return { label: "What if", summary: "I need the premium amount to work that out.", rows: [], facts: { error: "premium missing" } };
  const named = findProduct(String(args.product ?? ""));
  const product = named ?? usualProduct(ctx);
  const term = product.premium_type === "single" ? 1 : clip(args.term_years, 1, 60, 20);
  const whenRaw = String(args.when ?? "");
  const when = /^\d{4}-\d{2}-\d{2}$/.test(whenRaw) ? whenRaw : toISODate(TODAY);
  const cs = mine(ctx);
  const hypo: Case = {
    id: "case_what_if",
    advisor_id: ctx.advisor.id,
    client_name: "(what if)",
    product_id: product.id,
    premium_amount: premium,
    premium_term_years: term,
    gross_revenue: estimateGrossRevenue(premium, product),
    banding_code_at_time: ctx.advisor.banding_code,
    status: "confirmed",
    source: "manual",
    submitted_on: when,
    confirmed_on: when,
  };
  const before = mdrtSnapshot(ctx.advisor.id, cs, TODAY, ctx.goalSet);
  const after = mdrtSnapshot(ctx.advisor.id, [...cs, hypo], TODAY, ctx.goalSet);
  const rb = routeOf(before);
  const ra = after.routes.find((r) => r.metric === rb.metric) ?? routeOf(after);
  const commission = commissionOf(hypo);
  const credit = Math.max(0, ra.projected - rb.projected);
  const toGo = Math.max(0, ra.goalThreshold - ra.projected);
  const lump = product.premium_type === "single";
  return {
    label: `If you sell ${product.name} at ${sgd(premium)}${lump ? "" : "/yr"}`,
    summary: ra.goalReached
      ? `That case would take you over the line for ${TIER_LABEL[after.goalTier]} on the ${ROUTE_LABEL[ra.metric].toLowerCase()} route.`
      : `It pays you ${sgd(commission)} and adds ${sgd(credit)} of ${ROUTE_LABEL[ra.metric].toLowerCase()}-route credit, taking you from ${pctOf(rb)} to ${pctOf(ra)} of ${TIER_LABEL[after.goalTier]} with ${sgd(toGo)} still to go. ${paceText(ra.pace, "sgd", false)} after it.`,
    rows: [
      { label: "Case", value: `${sgd(premium)}${lump ? " lump sum" : "/yr"}`, sub: `${product.name}${lump ? "" : ` · ${term} years`}${named ? "" : " · your usual product, as none was named"}` },
      { label: "Commission to you", value: sgd(commission), sub: `band ${ctx.advisor.banding_code}` },
      { label: `${ROUTE_LABEL[ra.metric]} credit added`, value: sgd(credit) },
      { label: "Progress", value: `${pctOf(rb)} → ${pctOf(ra)}`, sub: `of ${sgd(ra.goalThreshold)} for ${TIER_LABEL[after.goalTier]}` },
      { label: "Still to go", value: sgd(toGo) },
      { label: "Pace after", value: paceText(ra.pace, "sgd", ra.goalReached), sub: `before: ${paceText(rb.pace, "sgd", rb.goalReached)}` },
    ],
    note: `Assumes the case is confirmed on ${dayOf(when)}. Revenue uses the product's placeholder rate, like the Calculator.`,
    facts: { product: product.name, product_id: product.id, premium, term_years: term, confirmed_on: when, commission: Math.round(commission), route: ra.metric, credit_added: Math.round(credit), progress_before: rb.projected / rb.goalThreshold, progress_after: ra.projected / ra.goalThreshold, to_go_after: Math.round(toGo), goal_reached_after: ra.goalReached, required_per_week_after: ra.pace.requiredPerWeek === null ? null : Math.round(ra.pace.requiredPerWeek) },
  };
}

function pipeline(ctx: AskContext): ToolResult {
  const pend = mine(ctx)
    .filter((c) => c.status === "pending")
    .sort((a, b) => (a.submitted_on < b.submitted_on ? 1 : -1));
  const premium = sum(pend.map((c) => c.premium_amount));
  const commission = sum(pend.map(commissionOf));
  return {
    label: "Pending cases",
    summary: pend.length === 0 ? "Nothing is waiting on confirmation." : `${plural(pend.length, "case")} pending, ${sgd(premium)} premium and ${sgd(commission)} commission waiting on them.`,
    rows: pend.map((c) => ({ label: c.client_name, value: sgd(c.premium_amount), sub: `${productById(c.product_id)?.name ?? c.product_id} · submitted ${dayOf(c.submitted_on)}` })),
    facts: { count: pend.length, premium: Math.round(premium), commission: Math.round(commission), cases: pend.map((c) => ({ client: c.client_name, product: productById(c.product_id)?.name, premium: c.premium_amount, submitted_on: c.submitted_on })) },
  };
}

function recentCases(ctx: AskContext, args: Record<string, unknown>): ToolResult {
  const days = clip(args.days, 1, 3650, 30);
  const cs = mine(ctx)
    .filter((c) => daysSince(c.submitted_on) <= days)
    .sort((a, b) => (a.submitted_on < b.submitted_on ? 1 : -1));
  const premium = sum(cs.map((c) => c.premium_amount));
  const commission = sum(cs.map(commissionOf));
  return {
    label: `Cases in the last ${days} days`,
    summary: cs.length === 0 ? `No case submitted in the last ${days} days.` : `${plural(cs.length, "case")}, ${sgd(premium)} premium, ${sgd(commission)} commission; ${cs.filter((c) => c.status === "pending").length} still pending.`,
    rows: cs.slice(0, 10).map((c) => ({ label: c.client_name, value: sgd(c.premium_amount), sub: `${productById(c.product_id)?.name ?? c.product_id} · ${c.status} · ${dayOf(c.submitted_on)}` })),
    facts: { days, count: cs.length, premium: Math.round(premium), commission: Math.round(commission), pending: cs.filter((c) => c.status === "pending").length },
  };
}

export function runTool(name: string, args: Record<string, unknown>, ctx: AskContext): ToolResult {
  switch (name) {
    case "top_clients":
      return topClients(ctx, args);
    case "quiet_clients":
      return quietClients(ctx, args);
    case "client_detail":
      return clientDetail(ctx, args);
    case "pace_status":
      return paceStatus(ctx);
    case "what_if":
      return whatIf(ctx, args);
    case "pipeline":
      return pipeline(ctx);
    case "recent_cases":
      return recentCases(ctx, args);
    default:
      return { label: "Unknown tool", summary: `There is no tool called ${name}.`, rows: [], facts: { error: "unknown tool" } };
  }
}

export function toAnswer(r: ToolResult): Answer {
  return { title: r.label, summary: r.summary, rows: r.rows, note: r.note, basis: [r.label] };
}

// ── Stand-in router: no server, so a few kinds of question are understood by keyword ──

/** "S$5,000", "$5000", "5k", "5,000" → 5000. Small bare numbers are left alone so "2 months" is not an amount. */
export function parseAmount(q: string): number | null {
  const m = q.match(/(?:s\$|\$)\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?|\b(\d[\d,]*(?:\.\d+)?)\s*(k)\b|\b(\d{1,3}(?:,\d{3})+|\d{3,})\b/i);
  if (!m) return null;
  const raw = m[1] ?? m[3] ?? m[5] ?? "";
  const k = !!(m[2] ?? m[4]);
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * (k ? 1000 : 1)) : null;
}

function parseDays(q: string): number | null {
  const m = q.match(/(\d+)\s*(day|week|month)s?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2]!.toLowerCase() === "day" ? n : m[2]!.toLowerCase() === "week" ? n * 7 : n * 30;
}

export function localAnswer(question: string, ctx: AskContext): Answer {
  const q = question.trim();
  const ql = q.toLowerCase();
  const amount = parseAmount(q);
  const names = book(ctx).map((b) => b.name);
  const named = names.find((n) => ql.includes(n.toLowerCase())) ?? names.find((n) => ql.includes(n.split(" ")[0]!.toLowerCase()) && n.split(" ")[0]!.length > 3);
  if (/what if|if i (sell|close|log|write|bring)|would .* (get|take|bring)|one more/.test(ql) && amount) {
    const term = q.match(/(\d+)\s*(?:years?|yrs?)/i);
    return toAnswer(runTool("what_if", { premium: amount, product: ql, term_years: term ? Number(term[1]) : 0, when: "" }, ctx));
  }
  if (/best|top|biggest|largest|most valuable|highest/.test(ql)) {
    const by = /commission/.test(ql) ? "commission" : /mdrt|credit/.test(ql) ? "mdrt" : /most cases|number of cases/.test(ql) ? "cases" : "premium";
    return toAnswer(runTool("top_clients", { by, period: /all time|ever|whole book|overall/.test(ql) ? "all" : "year", limit: 5 }, ctx));
  }
  if (/not talked|haven.?t talked|not spoken|haven.?t spoken|quiet|in a while|long time|not heard|haven.?t heard|neglect|not seen|haven.?t seen|no contact/.test(ql)) return toAnswer(runTool("quiet_clients", { days: parseDays(q) ?? 60, limit: 6 }, ctx));
  if (/pending|pipeline|waiting|unconfirmed|not confirmed/.test(ql)) return toAnswer(runTool("pipeline", {}, ctx));
  if (/this week|this month|recent|lately|last \d+ (day|week|month)/.test(ql)) return toAnswer(runTool("recent_cases", { days: /this week/.test(ql) ? 7 : (parseDays(q) ?? 30) }, ctx));
  if (/pace|on track|how am i|where am i|progress|mdrt|goal|cot|tot|how far/.test(ql)) return toAnswer(runTool("pace_status", {}, ctx));
  if (named) return toAnswer(runTool("client_detail", { name: named }, ctx));
  return {
    title: "Not sure what to look up",
    summary: "Without the server I only understand a few kinds of question: best clients, quiet clients, what-ifs with an amount, pace, pending and recent cases, or a client by name.",
    rows: [],
    note: "Connect the pipeline server on Packs → New pack to ask anything in your own words.",
    basis: [],
  };
}
