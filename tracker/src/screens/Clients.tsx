import { useState } from "react";
import { insurers, TODAY, type Advisor, type Case, type PassType } from "../mock/data";
import {
  challengeByCode,
  clientSummary,
  clientsForAdvisor,
  currentDrawMonth,
  drawMonths,
  parseISODate,
  passTotals,
  passesForAdvisor,
  passesForClient,
  productById,
  type ClientSummary,
} from "../lib/calc";
import { longDate, shortDate, sgd } from "../lib/format";
import { Card, Label } from "../components/ui";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function PassChip({ type, n, size = "sm" }: { type: PassType; n: number; size?: "sm" | "lg" }) {
  const tone = type === "gold" ? "bg-gold/15 text-gold-ink" : "bg-accent-soft text-accent";
  const dot = type === "gold" ? "bg-gold" : "bg-accent";
  const muted = n === 0 ? "opacity-40" : "";
  return (
    <span className={`tnum inline-flex items-center gap-1 rounded-md font-semibold ${tone} ${muted} ${size === "lg" ? "px-2 py-1 text-[14px]" : "px-1.5 py-0.5 text-[12px]"}`}>
      <span className={`inline-block rounded-full ${dot} ${size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2"}`} aria-hidden="true" />
      {n}
    </span>
  );
}

function MonthPills({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Draw month">
      {drawMonths().map((m) => {
        const active = m.monthly_draw === value;
        return (
          <button
            key={m.monthly_draw}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.monthly_draw)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${active ? "bg-accent text-white" : "border border-line bg-white text-muted"}`}
          >
            {m.monthly_draw.slice(0, 3)}
            {m.is_drawn && <span className={`ml-1 text-[10px] font-normal ${active ? "text-white/70" : "text-muted"}`}>drawn</span>}
          </button>
        );
      })}
    </div>
  );
}

function ClientDetail({ summary, month, onMonth, onBack }: { summary: ClientSummary; month: string; onMonth: (m: string) => void; onBack: () => void }) {
  const { client, plans, prizes } = summary;
  const rows = passesForClient(client.id, month);
  const totals = passTotals(rows);
  const draw = drawMonths().find((m) => m.monthly_draw === month)!;
  const since = parseISODate(client.since);
  return (
    <div>
      <div className="sticky top-[61px] z-[5] flex items-center justify-between border-b border-line bg-accent-soft px-4 py-2 text-[12px] text-accent">
        <button type="button" onClick={onBack} className="font-semibold">
          ‹ All clients
        </button>
        <span className="font-semibold">{client.name}</span>
      </div>
      <div className="space-y-3 px-4 pb-6 pt-3">
        <Card>
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent" aria-hidden="true">
              {client.name
                .split(" ")
                .slice(0, 2)
                .map((s) => s[0])
                .join("")}
            </div>
            <div className="min-w-0">
              <div className="text-[18px] font-semibold leading-tight text-ink">{client.name}</div>
              <div className="mt-0.5 truncate text-[12px] text-muted">
                {client.email} · {client.mobile}
              </div>
              <div className="tnum mt-0.5 text-[12px] text-muted">
                Client since {MONTH_LONG[since.getMonth()]} {since.getFullYear()} · {plans.length} {plans.length === 1 ? "plan" : "plans"}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-baseline justify-between">
            <Label>Draw passes</Label>
            <span className="tnum text-[11px] text-muted">
              {draw.is_drawn ? "Drawn" : "Draw on"} {shortDate(parseISODate(draw.draw_date))}
            </span>
          </div>
          <div className="mt-2">
            <MonthPills value={month} onChange={onMonth} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <PassChip type="gold" n={totals.gold} size="lg" />
            <span className="text-[12px] text-muted">gold</span>
            <PassChip type="blue" n={totals.blue} size="lg" />
            <span className="text-[12px] text-muted">blue</span>
            <span className="tnum ml-auto text-[11px] text-muted">
              all time {summary.allTime.gold} · {summary.allTime.blue}
            </span>
          </div>
          {rows.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">No passes for the {month} draw yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {rows.map((r) => {
                const ct = challengeByCode(r.challenge_code);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-ink">{ct?.label ?? r.challenge_code}</div>
                      <div className="tnum text-[12px] text-muted">
                        {r.units} {ct ? (r.units === 1 ? ct.unit_noun : `${ct.unit_noun}s`) : "units"} × {ct?.passes_per_unit ?? 1} · {shortDate(parseISODate(r.awarded_on))}
                      </div>
                    </div>
                    <PassChip type={r.pass_type} n={r.passes} />
                  </li>
                );
              })}
            </ul>
          )}
          {prizes.filter((p) => p.monthly_draw === month).map((p) => (
            <div key={p.prize_won} className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-[13px] text-gold-ink">
              <span className="font-semibold">Won in the {p.monthly_draw} {p.pass_type} draw:</span> {p.prize_won}
            </div>
          ))}
        </Card>

        <Card>
          <div className="flex items-baseline justify-between">
            <Label>Current plans</Label>
            <span className="text-[11px] text-muted">{plans.length === 0 ? "none yet" : `${plans.length} in force or pending`}</span>
          </div>
          {plans.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">No plans logged for this client. Passes so far came from activities.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {plans.map((c) => {
                const p = productById(c.product_id);
                const ins = insurers.find((i) => i.id === p?.insurer_id);
                return (
                  <li key={c.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-ink">{p?.name}</span>
                          {c.status === "pending" && <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">Pending</span>}
                        </div>
                        <div className="text-[12px] text-muted">{ins?.name}</div>
                      </div>
                      <div className="tnum shrink-0 text-right">
                        <div className="text-[14px] font-semibold text-body">{sgd(c.premium_amount)}</div>
                        <div className="text-[11px] text-muted">{p?.premium_type === "single" ? "single premium" : `/yr · ${c.premium_term_years} yrs`}</div>
                      </div>
                    </div>
                    <div className="tnum mt-1 text-[11px] text-muted">
                      Submitted {shortDate(parseISODate(c.submitted_on))}
                      {c.confirmed_on ? ` · confirmed ${shortDate(parseISODate(c.confirmed_on))}` : " · awaiting Merlin"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function Clients({ advisor, cases }: { advisor: Advisor; cases: Case[] }) {
  const [month, setMonth] = useState<string>(currentDrawMonth());
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const mine = clientsForAdvisor(advisor.id);
  const summaries = mine.map((c) => clientSummary(c, cases, month));
  const advisorTotals = passTotals(passesForAdvisor(advisor.id, month));
  const withPasses = summaries.filter((s) => s.month.gold + s.month.blue > 0).length;
  const draw = drawMonths().find((m) => m.monthly_draw === month)!;

  const open = summaries.find((s) => s.client.id === openId);
  if (open) return <ClientDetail summary={open} month={month} onMonth={setMonth} onBack={() => setOpenId(null)} />;

  const q = query.trim().toLowerCase();
  const visible = summaries
    .filter((s) => !q || s.client.name.toLowerCase().includes(q))
    .sort((a, b) => b.month.gold + b.month.blue - (a.month.gold + a.month.blue) || a.client.name.localeCompare(b.client.name));

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <Card tone="accent">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Around The World</div>
          <div className="tnum whitespace-nowrap text-[11px] text-white/70">
            {draw.is_drawn ? "Drawn" : "Draw on"} {shortDate(parseISODate(draw.draw_date))}
          </div>
        </div>
        <div className="mt-0.5 text-[18px] font-semibold leading-tight">{month} draw</div>
        <div className="mt-3 flex items-end gap-6">
          <div className="flex items-baseline gap-2">
            <span className="tnum text-[34px] font-semibold leading-none">{advisorTotals.gold}</span>
            <span className="flex items-center gap-1 text-[12px] text-white/80">
              <span className="h-2 w-2 rounded-full bg-gold" aria-hidden="true" /> gold
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="tnum text-[34px] font-semibold leading-none">{advisorTotals.blue}</span>
            <span className="flex items-center gap-1 text-[12px] text-white/80">
              <span className="h-2 w-2 rounded-full bg-white/80" aria-hidden="true" /> blue
            </span>
          </div>
          <div className="tnum ml-auto whitespace-nowrap text-right text-[11px] leading-tight text-white/80">
            <span className="text-[16px] font-semibold text-white">{withPasses}</span> of {mine.length}
            <br />
            clients hold passes
          </div>
        </div>
        <div className="mt-3 border-t border-white/20 pt-2 text-[11px] text-white/90">
          <span className="font-semibold">Passes as of {longDate(TODAY)}.</span> Activities after this date count toward the next draw.
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients"
          aria-label="Search clients"
          className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] text-body placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
      </div>
      <MonthPills value={month} onChange={setMonth} />

      <Card className="p-0">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted">No clients match.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((s) => {
              const latest = s.plans[0];
              const product = latest ? productById(latest.product_id) : undefined;
              return (
                <li key={s.client.id}>
                  <button type="button" onClick={() => setOpenId(s.client.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas focus:outline-none focus-visible:bg-accent-soft">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent" aria-hidden="true">
                      {s.client.name
                        .split(" ")
                        .slice(0, 2)
                        .map((x) => x[0])
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink">{s.client.name}</div>
                      <div className="truncate text-[12px] text-muted">
                        {s.plans.length === 0 ? "No plans yet" : `${s.plans.length} ${s.plans.length === 1 ? "plan" : "plans"} · ${product?.name}`}
                        {s.prizes.length > 0 && <span className="ml-1 font-medium text-gold-ink">· prize winner</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <PassChip type="gold" n={s.month.gold} />
                      <PassChip type="blue" n={s.month.blue} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="px-1 text-center text-[11px] text-muted">Passes come from the campaign ledger the mastersheet importer fills. Tap a client for the breakdown and their plans.</p>
    </div>
  );
}
