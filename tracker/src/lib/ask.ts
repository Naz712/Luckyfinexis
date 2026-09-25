// The in-app assistant's tools. Every figure it can quote comes from these
// functions, which use the same calc.ts the screens use, over the same
// in-memory production entries. The model (or, with no server, the keyword
// router at the bottom) only decides which tool to call and how to phrase
// the result. The tools never see anything beyond this advisor's own
// production and, for a manager, their team's.
import { MDRT_MEMBERSHIP_YEAR, metric_definitions, TODAY, type Advisor, type Case, type Tier } from "../mock/data";
import { ELITE, elitePeriodText, eliteTiersFor, isNewFc, tiersInView } from "./elite";
import {
  aggregate,
  casesForAdvisor,
  effectiveDate,
  goalFor,
  inPeriod,
  mdrtSnapshot,
  metricDefinition,
  metricSnapshot,
  metricsForCase,
  pace,
  parseISODate,
  periodBounds,
  ROUTE_LABEL,
  toISODate,
  weeksLeftInYear,
  type GoalSet,
  type MdrtRoute,
} from "./calc";
import { CADENCE_PER, count, fmtMetric, paceText, sgd, shortDate } from "./format";
import { CATALOGUE, CATALOGUE_IS_PRIVATE, findPolicy, quote, variantForTerm } from "./policies";

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
  /** Everyone the import describes; team_status picks this advisor's reports out of it. */
  advisors: Advisor[];
  cases: Case[];
  goalSet: GoalSet;
}

export const SUGGESTIONS = ["How am I doing on my pace?", "If I sell a S$5,000 term plan next month, what's my pace?", "How are my Elite credits?"];

const TIER_LABEL: Record<Tier, string> = { mdrt: "MDRT", cot: "COT", tot: "TOT" };

// ── Tool definitions, in the OpenAI function-calling shape ──

export const TOOL_DEFS = [
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
          product: { type: "string", description: "Policy name as the adviser said it, or a kind of plan (term, critical illness, ILP, whole life). Empty when not said." },
          term_years: { type: "integer", description: "Premium term in years. 0 when not said." },
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
      name: "elite_status",
      description: "finexis Elite, the firm's own MDRT-style scheme with a trip as the prize: credits (first-year gross revenue) earned so far in the qualifying year, the next tier with the credits to go and the pace needed, whether the advisor qualifies at the lower new-FC tiers, the advisor's own Elite goal if set, and every tier with reached or to go. Use for 'Elite', 'credits', 'trip', 'tier', 'conference'.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "production_by_month",
      description: "The advisor's confirmed production this year, month by month from the monthly import, newest first: commission, premium and Elite credits per month, the best month and the year-to-date totals. Use for 'by month', 'monthly', a month by name, 'last month', 'best month'.",
      parameters: { type: "object", properties: { months: { type: "integer", description: "How many recent months, 12 when unsure." } }, required: ["months"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "goals_status",
      description: "Every goal the advisor has set this year (commission, gross revenue) with achieved, target and pace, plus the MDRT tier they aim for. Use for 'my goals', 'my targets', or any of those metrics by name.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "team_status",
      description: "For a manager: each advisor on their team with progress toward the MDRT tier they aim for, credit counted and pending, and pace. Says so when the user manages no team.",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    },
  },
] as const;

// ── Helpers ──

const mine = (ctx: AskContext) => casesForAdvisor(ctx.advisor.id, ctx.cases).filter((c) => c.status !== "superseded");
const clip = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** "14 Jan" this year, "14 Jan 2025" otherwise. */
const dayOf = (iso: string) => {
  const d = parseISODate(iso);
  return d.getFullYear() === TODAY.getFullYear() ? shortDate(d) : `${shortDate(d)} ${d.getFullYear()}`;
};

const routeOf = (snap: ReturnType<typeof mdrtSnapshot>): MdrtRoute => snap.routes.find((r) => r.metric === snap.closer) ?? snap.routes[0]!;
const pctOf = (r: MdrtRoute) => `${Math.round(Math.min(1, r.projected / r.goalThreshold) * 100)}%`;
const tierName = (tier: Tier) => `${TIER_LABEL[tier]} ${MDRT_MEMBERSHIP_YEAR}`;

// ── The tools ──

function paceStatus(ctx: AskContext): ToolResult {
  const cs = mine(ctx);
  const snap = mdrtSnapshot(ctx.advisor.id, cs, TODAY, ctx.goalSet);
  const route = routeOf(snap);
  const commission = metricSnapshot(ctx.advisor.id, cs, "commission", TODAY, ctx.goalSet);
  const toGo = Math.max(0, route.goalThreshold - route.projected);
  const weeks = weeksLeftInYear(TODAY);
  const rows: AnswerRow[] = [
    { label: "Aiming for", value: tierName(snap.goalTier), sub: `${ROUTE_LABEL[route.metric]} route, your closest` },
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
  const named = findPolicy(String(args.product ?? ""));
  const policy = named ?? CATALOGUE.policies.find((p) => p.category === "Term") ?? CATALOGUE.policies[0]!;
  const termArg = Number(args.term_years);
  const variant = variantForTerm(policy, Number.isFinite(termArg) && termArg > 0 ? termArg : null);
  const whenRaw = String(args.when ?? "");
  const when = /^\d{4}-\d{2}-\d{2}$/.test(whenRaw) ? whenRaw : toISODate(TODAY);
  const cs = mine(ctx);
  // The same quote the Calculator shows: the schedule's rate, running incentives, the FC's share at their band.
  const q = quote({ policy, variant, premium, band: ctx.advisor.banding_code, today: TODAY });
  const hypo: Case = {
    id: "case_what_if",
    advisor_id: ctx.advisor.id,
    client_name: "(what if)",
    product_id: policy.mdrt_category === "other" ? "import_other" : "import_risk",
    premium_amount: premium,
    premium_term_years: variant.term ?? 1,
    gross_revenue: q.gr,
    banding_code_at_time: ctx.advisor.banding_code,
    status: "confirmed",
    source: "manual",
    submitted_on: when,
    confirmed_on: when,
    metrics: { commission: q.earnings, gross_revenue: q.gr, premium, mdrt_commission: q.mdrtCommission, mdrt_premium: q.mdrtPremium, elite: q.elite },
  };
  const before = mdrtSnapshot(ctx.advisor.id, cs, TODAY, ctx.goalSet);
  const after = mdrtSnapshot(ctx.advisor.id, [...cs, hypo], TODAY, ctx.goalSet);
  const rb = routeOf(before);
  const ra = after.routes.find((r) => r.metric === rb.metric) ?? routeOf(after);
  const commission = q.earnings;
  const credit = Math.max(0, ra.projected - rb.projected);
  const toGo = Math.max(0, ra.goalThreshold - ra.projected);
  const lump = !!variant.single;
  return {
    label: `If you sell ${policy.name} at ${sgd(premium)}${lump ? "" : "/yr"}`,
    summary: ra.goalReached
      ? `That case would take you over the line for ${TIER_LABEL[after.goalTier]} on the ${ROUTE_LABEL[ra.metric].toLowerCase()} route.`
      : `It pays you ${sgd(commission)} and adds ${sgd(credit)} of ${ROUTE_LABEL[ra.metric].toLowerCase()}-route credit, taking you from ${pctOf(rb)} to ${pctOf(ra)} of ${TIER_LABEL[after.goalTier]} with ${sgd(toGo)} still to go. ${paceText(ra.pace, "sgd", false)} after it.`,
    rows: [
      { label: "Case", value: `${sgd(premium)}${lump ? " lump sum" : "/yr"}`, sub: `${policy.insurer} ${policy.name} · ${variant.label}${named ? "" : " · a term plan, as none was named"}` },
      { label: "Gross revenue, year 1", value: sgd(q.gr), sub: q.lines.length > 1 ? `incl. ${q.lines.filter((l) => l.kind !== "base").map((l) => l.label).join(", ")}` : `${Number((variant.years[0] ?? 0).toFixed(2))}% of premium` },
      { label: "Commission to you", value: sgd(commission), sub: `band ${ctx.advisor.banding_code}` },
      { label: `${ROUTE_LABEL[ra.metric]} credit added`, value: sgd(credit) },
      { label: "Progress", value: `${pctOf(rb)} → ${pctOf(ra)}`, sub: `of ${sgd(ra.goalThreshold)} for ${TIER_LABEL[after.goalTier]}` },
      { label: "Still to go", value: sgd(toGo) },
      { label: "Pace after", value: paceText(ra.pace, "sgd", ra.goalReached), sub: `before: ${paceText(rb.pace, "sgd", rb.goalReached)}` },
    ],
    note: `Assumes the case is confirmed on ${dayOf(when)}. Rates as in the Calculator${CATALOGUE_IS_PRIVATE ? "" : " (sample rates on this build)"}; MDRT credit leaves out cash incentives.`,
    facts: { policy: policy.name, insurer: policy.insurer, option: variant.label, premium, gross_revenue: Math.round(q.gr), confirmed_on: when, commission: Math.round(commission), route: ra.metric, credit_added: Math.round(credit), progress_before: rb.projected / rb.goalThreshold, progress_after: ra.projected / ra.goalThreshold, to_go_after: Math.round(toGo), goal_reached_after: ra.goalReached, required_per_week_after: ra.pace.requiredPerWeek === null ? null : Math.round(ra.pace.requiredPerWeek) },
  };
}

function eliteStatus(ctx: AskContext): ToolResult {
  const cs = mine(ctx);
  // Credits over the scheme's qualifying year; the FC's goal keeps its own cadence window. New FCs have lower tiers.
  const period = periodBounds(metricDefinition("elite").period_type, TODAY);
  const credits = aggregate(cs.filter((c) => c.status === "confirmed"), "elite", period.start, period.end);
  const goal = metricSnapshot(ctx.advisor.id, cs, "elite", TODAY, ctx.goalSet);
  const rungs = eliteTiersFor(ctx.advisor).sort((a, b) => a.credits - b.credits);
  const newFc = isNewFc(ctx.advisor);
  const reached = rungs.filter((r) => credits >= r.credits);
  const next = rungs.find((r) => credits < r.credits) ?? null;
  const nextPace = next ? pace(credits, next.credits, period.start, period.end, TODAY) : null;
  const rows: AnswerRow[] = [{ label: "Credits this year", value: count(credits), sub: reached.length > 0 ? `${reached[reached.length - 1]!.name} reached` : "no tier reached yet" }];
  if (next && nextPace) rows.push({ label: `Next tier: ${next.name}`, value: `${count(next.credits - credits)} to go`, sub: `${count(next.credits)} needed · ${paceText(nextPace, "count", false)}` });
  if (goal.target !== null) rows.push({ label: "Your Elite goal", value: `${count(goal.achieved)} of ${count(goal.target)}`, sub: `${goal.cadence ? CADENCE_PER[goal.cadence] : "per year"} · ${paceText(goal.pace, "count", goal.achieved >= goal.target)}` });
  for (const r of tiersInView(rungs, credits)) rows.push({ label: r.name, value: count(r.credits), sub: credits >= r.credits ? "reached" : `${count(r.credits - credits)} to go` });
  // The FC's own goal gets a sentence only when it is not simply the next tier.
  const goalWord = goal.target !== null && goal.target !== next?.credits ? ` Your own goal is ${count(goal.target)}: ${paceText(goal.pace, "count", goal.achieved >= goal.target).toLowerCase()}.` : "";
  return {
    label: "Your Elite credits",
    summary: next
      ? `${count(credits)} credits so far this year, ${count(next.credits - credits)} to go for ${next.name}${reached.length > 0 ? ` (${reached[reached.length - 1]!.name} already reached)` : ""}. ${paceText(nextPace, "count", false)}.${goalWord}`
      : `${count(credits)} credits so far this year; every tier is reached, up to ${rungs[rungs.length - 1]?.name ?? "the top"}.${goalWord}`,
    rows,
    note: `${ELITE.name}: first-year GR, ${elitePeriodText()}.${newFc ? ` As a new FC you qualify at the lower ${ELITE.new_fc_label} tiers.` : ""}${ELITE.tiers_confirmed ? "" : " The tiers are samples."} Credits are as the import counts them.`,
    facts: {
      credits: Math.round(credits),
      reached: reached.map((r) => r.name),
      next: next && nextPace ? { name: next.name, credits: next.credits, to_go: Math.round(next.credits - credits), required_per_month: nextPace.requiredPerMonth === null ? null : Math.round(nextPace.requiredPerMonth), on_track: nextPace.onTrack } : null,
      goal: goal.target === null ? null : { target: goal.target, achieved: Math.round(goal.achieved), cadence: goal.cadence, on_track: goal.achieved >= goal.target || !!goal.pace?.onTrack },
      tiers: rungs.map((r) => ({ name: r.name, credits: r.credits, perk: r.perk ?? null, reached: credits >= r.credits, to_go: Math.max(0, Math.round(r.credits - credits)) })),
      new_fc: newFc,
      qualifying_period: ELITE.period,
      tiers_confirmed: ELITE.tiers_confirmed,
    },
  };
}

function productionByMonth(ctx: AskContext, args: Record<string, unknown>): ToolResult {
  const months = clip(args.months, 1, 12, 12);
  const year = periodBounds("jan_dec", TODAY);
  // Confirmed import entries only: the month's pending production is a separate entry and stays out.
  const entries = mine(ctx).filter((c) => c.source === "import" && c.status === "confirmed" && c.label && inPeriod(effectiveDate(c), year.start, year.end));
  const byMonth = new Map<string, { label: string; at: string; commission: number; premium: number; elite: number }>();
  for (const c of entries) {
    const label = c.label!;
    const m = metricsForCase(c);
    const cur = byMonth.get(label) ?? { label, at: c.confirmed_on ?? c.submitted_on, commission: 0, premium: 0, elite: 0 };
    cur.commission += m.commission;
    cur.premium += m.premium;
    cur.elite += m.elite;
    byMonth.set(label, cur);
  }
  const all = [...byMonth.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
  const shown = all.slice(0, months);
  const best = all.reduce<(typeof all)[number] | null>((m, x) => (m === null || x.commission > m.commission ? x : m), null);
  const ytd = { commission: sum(all.map((x) => x.commission)), premium: sum(all.map((x) => x.premium)), elite: sum(all.map((x) => x.elite)) };
  const y = TODAY.getFullYear();
  return {
    label: shown.length < all.length ? `Production, last ${plural(shown.length, "month")}` : `Production by month, ${y}`,
    summary:
      all.length === 0 || !best
        ? `No imported production for ${y} yet.`
        : `${sgd(ytd.commission)} commission on ${sgd(ytd.premium)} premium and ${count(ytd.elite)} Elite credits so far in ${y}, over ${plural(all.length, "month")}. Best month: ${best.label} at ${sgd(best.commission)}.`,
    rows: shown.map((x) => ({ label: x.label, value: sgd(x.commission), sub: `premium ${sgd(x.premium)} · ${count(x.elite)} credits` })),
    note: all.length === 0 ? undefined : "Confirmed figures from the monthly import, each month being the change in the year-to-date row. Pending production is not included.",
    facts: {
      year: y,
      months: shown.map((x) => ({ label: x.label, as_of: x.at, commission: Math.round(x.commission), premium: Math.round(x.premium), elite: Math.round(x.elite) })),
      best_month: best ? { label: best.label, commission: Math.round(best.commission) } : null,
      year_to_date: { months: all.length, commission: Math.round(ytd.commission), premium: Math.round(ytd.premium), elite: Math.round(ytd.elite) },
    },
  };
}

function goalsStatus(ctx: AskContext): ToolResult {
  const cs = mine(ctx);
  const year = TODAY.getFullYear();
  const mdrt = mdrtSnapshot(ctx.advisor.id, cs, TODAY, ctx.goalSet);
  const route = routeOf(mdrt);
  const rows: AnswerRow[] = [{ label: "MDRT aim", value: tierName(mdrt.goalTier), sub: `${pctOf(route)} there on the ${ROUTE_LABEL[route.metric].toLowerCase()} route · ${paceText(route.pace, "sgd", route.goalReached)}` }];
  const facts: Record<string, unknown>[] = [];
  let onTrack = 0;
  let set = 0;
  for (const def of metric_definitions) {
    if (def.code === "mdrt_commission" || def.code === "mdrt_premium") continue;
    const goal = goalFor(ctx.advisor.id, def.code, year, ctx.goalSet.targets);
    if (!goal) continue;
    set++;
    const snap = metricSnapshot(ctx.advisor.id, cs, def.code, TODAY, ctx.goalSet);
    const reached = snap.target !== null && snap.achieved >= snap.target;
    if (reached || snap.pace?.onTrack) onTrack++;
    rows.push({
      label: def.label,
      value: `${fmtMetric(snap.achieved, def.unit)} of ${fmtMetric(snap.target ?? goal.target_value, def.unit)}`,
      sub: `${CADENCE_PER[goal.cadence]} · ${paceText(snap.pace, def.unit, reached)}`,
    });
    facts.push({ metric: def.code, label: def.label, cadence: goal.cadence, target: snap.target ?? goal.target_value, achieved: Math.round(snap.achieved), projected: Math.round(snap.projected), on_track: reached || !!snap.pace?.onTrack });
  }
  return {
    label: "Your goals",
    summary: set === 0 ? `Only the MDRT aim is set: ${TIER_LABEL[mdrt.goalTier]}, ${pctOf(route)} there on the ${ROUTE_LABEL[route.metric].toLowerCase()} route.` : `${plural(set, "goal")} set besides the MDRT aim; ${onTrack} on track or reached. MDRT: ${pctOf(route)} there on the ${ROUTE_LABEL[route.metric].toLowerCase()} route.`,
    rows,
    facts: { mdrt_tier: mdrt.goalTier, mdrt_route: route.metric, mdrt_progress: route.projected / route.goalThreshold, goals: facts },
  };
}

function teamStatus(ctx: AskContext): ToolResult {
  const team = ctx.advisors.filter((a) => a.manager_ids.includes(ctx.advisor.id));
  if (team.length === 0) return { label: "Team", summary: "You don't manage a team in this app, so there is no team view for you.", rows: [], facts: { manager: false } };
  const rows = team
    .map((a) => {
      const snap = mdrtSnapshot(a.id, ctx.cases, TODAY, ctx.goalSet);
      const route = routeOf(snap);
      return { name: a.name, tier: snap.goalTier, route: route.metric, progress: route.projected / route.goalThreshold, counted: route.achieved, pending: route.projected - route.achieved, pace: paceText(route.pace, "sgd", route.goalReached), onTrack: route.goalReached || route.pace.onTrack };
    })
    .sort((a, b) => b.progress - a.progress);
  const lead = rows[0]!;
  return {
    label: "Your team",
    summary: `${plural(rows.length, "advisor")}; ${lead.name} is furthest along at ${Math.round(Math.min(1, lead.progress) * 100)}% of ${TIER_LABEL[lead.tier]} on the ${ROUTE_LABEL[lead.route].toLowerCase()} route. ${rows.filter((r) => r.onTrack).length} on track.`,
    rows: rows.map((r) => ({ label: r.name, value: `${Math.round(Math.min(1, r.progress) * 100)}% of ${TIER_LABEL[r.tier]}`, sub: `${ROUTE_LABEL[r.route]} route · ${sgd(r.counted)} counted${r.pending > 0 ? ` + ${sgd(r.pending)} pending` : ""} · ${r.pace}` })),
    facts: { manager: true, advisors: rows.map((r) => ({ name: r.name, tier: r.tier, route: r.route, progress: r.progress, counted: Math.round(r.counted), pending: Math.round(r.pending), on_track: r.onTrack })) },
  };
}

export function runTool(name: string, args: Record<string, unknown>, ctx: AskContext): ToolResult {
  switch (name) {
    case "pace_status":
      return paceStatus(ctx);
    case "what_if":
      return whatIf(ctx, args);
    case "elite_status":
      return eliteStatus(ctx);
    case "production_by_month":
      return productionByMonth(ctx, args);
    case "goals_status":
      return goalsStatus(ctx);
    case "team_status":
      return teamStatus(ctx);
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

/** "last 3 months" → 3; null when no count of months is given. */
function parseMonths(q: string): number | null {
  const m = q.match(/(\d+)\s*months?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const MONTH_NAMES = /january|february|march|april|\bmay\b|june|july|august|september|october|november|december/;

export function localAnswer(question: string, ctx: AskContext): Answer {
  const q = question.trim();
  const ql = q.toLowerCase();
  const amount = parseAmount(q);
  if (/what if|if i (sell|close|log|write|bring)|would .* (get|take|bring)|one more/.test(ql) && amount) {
    const term = q.match(/(\d+)\s*(?:years?|yrs?)/i);
    return toAnswer(runTool("what_if", { premium: amount, product: ql, term_years: term ? Number(term[1]) : 0, when: "" }, ctx));
  }
  if (/elite|credits|trip|rung|conference/.test(ql)) return toAnswer(runTool("elite_status", {}, ctx));
  if (/\bteam\b|my advisors|my fcs/.test(ql)) return toAnswer(runTool("team_status", {}, ctx));
  if (/\bgoals\b|\btargets?\b/.test(ql)) return toAnswer(runTool("goals_status", {}, ctx));
  if (/by month|monthly|month by month|last month|best month|this month|\d+\s*months?/.test(ql) || MONTH_NAMES.test(ql)) return toAnswer(runTool("production_by_month", { months: parseMonths(q) ?? 12 }, ctx));
  if (/pace|on track|how am i|where am i|progress|mdrt|\bcot\b|\btot\b|how far|goal/.test(ql)) return toAnswer(runTool("pace_status", {}, ctx));
  return {
    title: "Not sure what to look up",
    summary: "Without the server I only understand a few kinds of question: your pace, what-ifs with an amount, your Elite credits, your goals, your production by month, or your team.",
    rows: [],
    note: "Connect the server below to ask anything in your own words.",
    basis: [],
  };
}
