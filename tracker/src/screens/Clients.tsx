import { useState } from "react";
import { insurers, type Advisor, type Case, type Client, type PassType } from "../mock/data";
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
import { shortDate, sgd } from "../lib/format";
import { Card, Label } from "../components/ui";

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Most recently opened clients per advisor. In memory only, like everything else in the mockup; survives tab switches, not reloads. */
const recentByAdvisor = new Map<string, string[]>();

/** "96634400" reads better as "9663 4400"; anything that is not 8 digits is shown as stored. */
const mobileOf = (m: string) => (/^\d{8}$/.test(m) ? `${m.slice(0, 4)} ${m.slice(4)}` : m);

const initialsOf = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");

/** Pass ticket glyph: rounded rect with side notches and a perforation dash. Colour comes from the parent. */
function Ticket({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4.8A1.8 1.8 0 0 1 3.8 3h8.4A1.8 1.8 0 0 1 14 4.8v1.4a1.8 1.8 0 0 0 0 3.6v1.4A1.8 1.8 0 0 1 12.2 13H3.8A1.8 1.8 0 0 1 2 11.2V9.8a1.8 1.8 0 0 0 0-3.6V4.8Z" fill="currentColor" />
      <path d="M6.4 6.1v3.8" stroke="var(--color-surface)" strokeWidth="1.1" strokeLinecap="round" strokeDasharray="1 1.4" />
    </svg>
  );
}

/** A count beside its ticket. Zero is a dash in muted ink on a neutral ticket, never a faded number. */
function PassCount({ type, n }: { type: PassType; n: number }) {
  const zero = n === 0;
  const icon = zero ? "text-dim" : type === "gold" ? "text-gold" : "text-accent";
  const ink = zero ? "text-muted" : type === "gold" ? "text-gold-ink" : "text-accent";
  return (
    <span className="flex items-center gap-1" aria-label={`${n} ${type} ${n === 1 ? "pass" : "passes"}`}>
      <span className={icon}>
        <Ticket />
      </span>
      <span className={`tnum min-w-[11px] text-[14px] font-bold ${ink}`}>{zero ? "–" : n}</span>
    </span>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`text-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function drawStatus(m: { draw_date: string; is_drawn: boolean }): string {
  return `${m.is_drawn ? "Drawn" : "Draw on"} ${shortDate(parseISODate(m.draw_date))}`;
}

/** "September draw · CURRENT" with the other draws one tap away. The chosen draw is simply the view. */
function DrawCard({ advisorId, month, current, onMonth }: { advisorId: string; month: string; current: string; onMonth: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const isCurrent = month === current;
  return (
    <Card className="overflow-hidden p-0">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2.5 px-3.5 py-3 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink">{month} draw</span>
          <span className={`rounded px-[5px] py-[3px] text-[9px] font-bold uppercase tracking-[.05em] ${isCurrent ? "bg-accent-soft text-accent" : "bg-canvas text-muted"}`}>
            {isCurrent ? "Current" : "Closed"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-[7px]">
          <span className="whitespace-nowrap text-[11px] text-muted">{open ? "Hide" : isCurrent ? "Past draws" : "Change"}</span>
          <Caret open={open} />
        </span>
      </button>
      {open && (
        <ul>
          {[...drawMonths()].reverse().map((d) => {
            const t = passTotals(passesForAdvisor(advisorId, d.monthly_draw));
            const selected = d.monthly_draw === month;
            return (
              <li key={d.monthly_draw}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onMonth(d.monthly_draw);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2.5 border-t border-line px-3.5 py-2.5 text-left ${selected ? "bg-accent-soft/50" : "bg-surface"}`}
                >
                  <span className="min-w-0">
                    <span className={`block text-[13px] ${selected ? "font-bold text-accent" : "font-semibold text-ink"}`}>
                      {d.monthly_draw}
                      {d.monthly_draw === current && " · current"}
                    </span>
                    <span className="tnum mt-0.5 block text-[11px] text-muted">
                      {drawStatus(d)} · {t.gold} gold, {t.blue} blue
                    </span>
                  </span>
                  {selected && (
                    <span className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden="true">
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function planTerms(c: Case): string {
  const p = productById(c.product_id);
  if (!p) return "";
  if (p.category === "fund") return p.premium_type === "single" ? "invested" : "/yr · RSP";
  return p.premium_type === "single" ? "single premium" : `/yr · ${c.premium_term_years} yrs`;
}

function ClientDetail({
  summary,
  month,
  current,
  onBack,
  onLogCase,
}: {
  summary: ClientSummary;
  month: string;
  current: string;
  onBack: () => void;
  onLogCase?: (client: Client) => void;
}) {
  const { client, plans, prizes, allTime } = summary;
  const rows = [...passesForClient(client.id, month)].sort((a, b) => (a.awarded_on < b.awarded_on ? 1 : -1));
  const totals = passTotals(rows);
  const draw = drawMonths().find((m) => m.monthly_draw === month)!;
  const firstMonth = drawMonths()[0].monthly_draw;
  const since = parseISODate(client.since);
  const prize = prizes.find((p) => p.monthly_draw === month);
  const validCaption = month === current ? "valid for this draw" : `counted in the ${month} draw`;
  const action = "flex flex-1 items-center justify-center gap-1.5 rounded-[11px] bg-white/16 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/26 active:bg-white/30";
  return (
    <div className="slide-in">
      <div className="rounded-b-[26px] bg-brand px-4 pb-[22px] pt-2 text-white">
        <div className="flex items-center justify-between gap-2.5">
          <button type="button" onClick={onBack} className="flex items-center gap-[3px] text-[12px] font-bold text-white/92">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All clients
          </button>
          <span className="tnum whitespace-nowrap text-[11px] text-white/78">{month} draw</span>
        </div>
        <div className="mt-4 flex items-center gap-[13px]">
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white/18 text-[17px] font-bold" aria-hidden="true">
            {initialsOf(client.name)}
          </span>
          <div className="min-w-0">
            <div className="text-[21px] font-bold leading-[1.15] tracking-[-.015em]">{client.name}</div>
            <div className="tnum mt-1 text-[12px] text-white/80">
              Client since {MONTH_LONG[since.getMonth()]} {since.getFullYear()} · {plans.length} {plans.length === 1 ? "plan" : "plans"}
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <a href={`tel:${client.mobile.replace(/\s+/g, "")}`} className={action}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3.8c0-.6.5-1.1 1.1-1.1h1.4c.5 0 .9.3 1 .8l.5 1.9c.1.4 0 .8-.4 1l-.9.6c.7 1.5 1.9 2.7 3.4 3.4l.6-.9c.2-.3.6-.5 1-.4l1.9.5c.5.1.8.5.8 1v1.4c0 .6-.5 1.1-1.1 1.1C7.2 14.1 3 9.9 3 3.8Z" fill="currentColor" />
            </svg>
            Call
          </a>
          <a href={`mailto:${client.email}`} className={action}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.8" y="3.2" width="12.4" height="9.6" rx="1.6" fill="currentColor" />
              <path d="M2.6 4.4 8 8.4l5.4-4" stroke="var(--color-brand)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Email
          </a>
          <button type="button" onClick={() => onLogCase?.(client)} disabled={!onLogCase} className={`${action} disabled:opacity-60`}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2.6v10.8M2.6 8h10.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Case
          </button>
        </div>
        <div className="tnum mt-2.5 truncate text-[11px] text-white/75">
          {client.email} · {mobileOf(client.mobile)}
        </div>
      </div>

      <div className="space-y-3 px-4 pb-5 pt-3">
        <div className="grid grid-cols-2 gap-2.5">
          {(["gold", "blue"] as const).map((type) => (
            <Card key={type} className="p-3.5">
              <div className={`flex items-center gap-[7px] ${type === "gold" ? "text-gold" : "text-accent"}`}>
                <Ticket size={18} />
                <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">{type}</span>
              </div>
              <div className="tnum mt-2 text-[30px] font-bold leading-none tracking-[-.025em] text-ink">{totals[type]}</div>
              <div className="mt-[5px] text-[11px] leading-[1.4] text-muted">{validCaption}</div>
              <div className="tnum mt-[7px] border-t border-well pt-[7px] text-[11px] text-muted">
                {allTime[type]} {type} since {firstMonth}
              </div>
            </Card>
          ))}
        </div>

        {prize && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-gold/15 px-3.5 py-[13px]">
            <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-gold text-white" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 2.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.7l-3.2 1.7.6-3.6L2.8 6.3l3.6-.5L8 2.5Z" fill="currentColor" />
              </svg>
            </span>
            <span className="min-w-0 text-[12px] leading-[1.5] text-gold-ink">
              <span className="font-bold">
                Won in the {prize.monthly_draw} {prize.pass_type} draw:
              </span>{" "}
              {prize.prize_won}
            </span>
          </div>
        )}

        <Card>
          <div className="flex items-baseline justify-between gap-2.5">
            <Label>How they earned it</Label>
            <span className="tnum shrink-0 whitespace-nowrap text-[11px] text-muted">{drawStatus(draw)}</span>
          </div>
          {rows.length === 0 ? (
            <p className="mt-[9px] text-[13px] leading-[1.5] text-muted">No passes in the {month} draw. Anything they do this month lands here.</p>
          ) : (
            <ol>
              {rows.map((r) => {
                const ct = challengeByCode(r.challenge_code);
                const gold = r.pass_type === "gold";
                const noun = ct ? (r.units === 1 ? ct.unit_noun : `${ct.unit_noun}s`) : "units";
                const per = ct?.passes_per_unit ?? 1;
                return (
                  <li key={r.id} className="mt-[13px] flex gap-[11px]">
                    <div className="flex w-[38px] shrink-0 flex-col items-center">
                      <span className="tnum whitespace-nowrap text-[10px] font-bold text-muted">{shortDate(parseISODate(r.awarded_on))}</span>
                      <span className={`mt-[5px] h-[9px] w-[9px] rounded-full ${gold ? "bg-gold" : "bg-accent"}`} aria-hidden="true" />
                      <span className="mt-[3px] w-px flex-1 bg-well" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1 pb-0.5">
                      <div className="flex items-baseline justify-between gap-[9px]">
                        <span className="min-w-0 text-[14px] font-semibold text-ink">{ct?.label ?? r.challenge_code}</span>
                        <span className={`tnum shrink-0 whitespace-nowrap rounded-md px-[7px] py-[3px] text-[12px] font-bold ${gold ? "bg-gold/18 text-gold-ink" : "bg-accent-soft text-accent"}`}>+{r.passes}</span>
                      </div>
                      <div className="tnum mt-[3px] text-[12px] text-muted">
                        {r.units} {noun} × {per} {per === 1 ? "pass" : "passes"}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <Card>
          <div className="flex items-baseline justify-between gap-2.5">
            <Label>Plans</Label>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">{plans.length === 0 ? "none yet" : `${plans.length} in force or pending`}</span>
          </div>
          {plans.length === 0 ? (
            <p className="mt-[9px] text-[13px] leading-[1.5] text-muted">No plans logged for this client. Their passes came from activities.</p>
          ) : (
            plans.map((c) => {
              const p = productById(c.product_id);
              const ins = insurers.find((i) => i.id === p?.insurer_id);
              return (
                <div key={c.id} className="mt-3 rounded-xl bg-canvas px-[13px] py-3">
                  <div className="flex items-start justify-between gap-2.5">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-semibold text-ink">{p?.name}</span>
                        {c.status === "pending" && (
                          <span className="shrink-0 rounded bg-warn/14 px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-warn">Pending</span>
                        )}
                      </span>
                      <span className="mt-[3px] block text-[12px] text-muted">{ins?.name}</span>
                    </span>
                    <span className="tnum shrink-0 text-right">
                      <span className="block text-[15px] font-bold text-ink">{sgd(c.premium_amount)}</span>
                      <span className="mt-px block whitespace-nowrap text-[11px] text-muted">{planTerms(c)}</span>
                    </span>
                  </div>
                  <div className="tnum mt-2 border-t border-well pt-2 text-[11px] text-muted">
                    Submitted {shortDate(parseISODate(c.submitted_on))}
                    {c.confirmed_on ? ` · confirmed ${shortDate(parseISODate(c.confirmed_on))}` : " · awaiting Merlin"}
                  </div>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
}

export default function Clients({ advisor, cases, onLogCase }: { advisor: Advisor; cases: Case[]; onLogCase?: (client: Client) => void }) {
  const current = currentDrawMonth();
  const [month, setMonth] = useState<string>(current);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => recentByAdvisor.get(advisor.id) ?? []);

  const mine = clientsForAdvisor(advisor.id);
  const summaries = mine.map((c) => clientSummary(c, cases, month));

  const openClient = (id: string) => {
    const next = [id, ...recent.filter((x) => x !== id)].slice(0, 12);
    recentByAdvisor.set(advisor.id, next);
    setRecent(next);
    setOpenId(id);
  };

  const open = summaries.find((s) => s.client.id === openId);
  if (open) return <ClientDetail summary={open} month={month} current={current} onBack={() => setOpenId(null)} onLogCase={onLogCase} />;

  const q = query.trim().toLowerCase();
  const rank = (id: string) => {
    const i = recent.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const visible = summaries
    .filter((s) => !q || s.client.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a.client.id) - rank(b.client.id) || (a.client.since < b.client.since ? 1 : a.client.since > b.client.since ? -1 : a.client.name.localeCompare(b.client.name)));

  const subtitle = (s: ClientSummary): string => {
    const rows = passesForClient(s.client.id, month);
    const last = rows.reduce<(typeof rows)[number] | null>((acc, r) => (!acc || r.awarded_on > acc.awarded_on ? r : acc), null);
    if (last) return `${challengeByCode(last.challenge_code)?.label ?? last.challenge_code} · ${shortDate(parseISODate(last.awarded_on))}`;
    if (s.plans.length > 0) return `${s.plans.length} ${s.plans.length === 1 ? "plan" : "plans"} · ${productById(s.plans[0].product_id)?.name}`;
    return "No passes this draw";
  };

  return (
    <div className="space-y-2.5 px-4 pb-5 pt-3">
      <DrawCard advisorId={advisor.id} month={month} current={current} onMonth={setMonth} />

      <div className="relative flex items-center">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="absolute left-3 text-faint">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients"
          aria-label="Search clients"
          className="w-full rounded-xl border border-line bg-surface py-[11px] pl-9 pr-[38px] text-[14px] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
        />
        {query !== "" && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-[11px] grid h-5 w-5 place-items-center rounded-full bg-canvas text-muted">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-baseline justify-between gap-2.5 px-4 pb-[9px] pt-3">
          <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[.08em] text-muted">{q ? `${visible.length} ${visible.length === 1 ? "match" : "matches"}` : "All clients"}</span>
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">Recently viewed first</span>
        </div>
        <div className="flex items-center justify-end gap-[9px] pb-2 pl-4 pr-3.5" aria-hidden="true">
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.06em] text-muted">
            <span className="h-2 w-2 rounded-[2px] bg-gold" /> Gold
          </span>
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.06em] text-muted">
            <span className="h-2 w-2 rounded-[2px] bg-accent" /> Blue
          </span>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 pb-5 pt-3.5 text-center text-[13px] text-muted">No clients match that search.</p>
        ) : (
          <ul>
            {visible.map((s) => (
              <li key={s.client.id}>
                <button
                  type="button"
                  onClick={() => openClient(s.client.id)}
                  className="flex w-full items-center gap-[11px] border-t border-line bg-surface py-[11px] pl-4 pr-3.5 text-left hover:bg-canvas focus:outline-none focus-visible:bg-accent-soft"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent" aria-hidden="true">
                    {initialsOf(s.client.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{s.client.name}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">{subtitle(s)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-[9px]">
                    <PassCount type="gold" n={s.month.gold} />
                    <PassCount type="blue" n={s.month.blue} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="px-1 text-center text-[11px] leading-[1.5] text-muted">Passes come from the campaign ledger the mastersheet importer fills. Tap a client for the breakdown and their plans.</p>
    </div>
  );
}
