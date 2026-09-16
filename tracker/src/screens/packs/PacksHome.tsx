// Meeting Pack, screen 1: the Packs dashboard. Recent packs newest first, a
// reminder while a draft is waiting, and an empty state for a consultant with
// no packs yet. Pure view: the container owns the list and the navigation.
import { TODAY } from "../../mock/data";
import type { Pack, PackSource } from "../../mock/packs";
import { parseISODate } from "../../lib/calc";
import { shortDate } from "../../lib/format";
import { Card, Label } from "../../components/ui";
import { PackHeader, PinnedBar, SourceGlyph, initials } from "./shared";
import type { PacksHomeProps } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

/** "Tue 15 Sep" */
function dayDate(iso: string): string {
  const d = parseISODate(iso);
  return `${WEEKDAYS[d.getDay()]} ${shortDate(d)}`;
}

/** Met today or on one of the six days before it. */
function metThisWeek(p: Pack): boolean {
  const days = Math.round((TODAY.getTime() - parseISODate(p.met_on).getTime()) / DAY_MS);
  return days >= 0 && days < 7;
}

/** "Review · Tue 15 Sep · 47 min" — the duration is left out until the pack has one. */
function metaOf(p: Pack): string {
  const parts = [p.kind, dayDate(p.met_on)];
  if (p.duration_min !== null) parts.push(`${p.duration_min} min`);
  return parts.join(" · ");
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** What a consultant can drop in, for the empty state. */
const DROP_INS: { source: PackSource; text: string }[] = [
  { source: "recap", text: "Record a recap and it is transcribed, then deleted" },
  { source: "photo", text: "Photograph the whiteboard and the numbers are read off it" },
  { source: "document", text: "Attach a fact-find PDF and it is kept with the report" },
];

/** The Packs tab glyph: a report sheet with a stacked edge above it. */
function PacksGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="6.6" width="16" height="13.8" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 3.8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeOpacity=".5" />
      <path d="M8 11.4h8M8 15.4h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** The "i" in a brand circle that opens a reminder. */
function InfoDot() {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M8 3.2v6.4M8 12.3v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Tick({ size = 9 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-faint">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PacksHome({ packs, onOpen, onNew, extra }: PacksHomeProps) {
  const thisWeek = packs.filter(metThisWeek).length;
  const drafts = packs.filter((p) => p.status === "draft");
  // Newest first, so the first draft is the newest one.
  const newestDraft = drafts[0];
  const empty = packs.length === 0;

  return (
    <>
      <PackHeader
        title="Meeting packs"
        extra={extra}
        note={
          empty ? (
            "No packs yet"
          ) : (
            <>
              This week {thisWeek}
              <br />
              {drafts.length} to approve
            </>
          )
        }
      />

      {empty ? (
        <div className="flex flex-col items-center px-8 pb-[calc(96px+env(safe-area-inset-bottom))] pt-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <PacksGlyph />
          </span>
          <h2 className="mt-4 text-[18px] font-bold tracking-[-.01em] text-ink">No packs yet</h2>
          <p className="mt-2 text-[13px] leading-[1.55] text-muted [text-wrap:pretty]">
            After your next consultation, drop in a two-minute recap, a photo of the whiteboard, your fact-find notes or a few typed lines. One report comes out.
          </p>
          <ul className="mt-5 flex w-full flex-col gap-2.5 border-t border-line pt-4 text-left">
            {DROP_INS.map((d) => (
              <li key={d.source} className="flex items-center gap-2.5">
                <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg bg-canvas text-accent" aria-hidden="true">
                  <SourceGlyph source={d.source} size={15} />
                </span>
                <span className="min-w-0 text-[12px] leading-[1.45] text-body">{d.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3.5">
          {newestDraft && (
            <div className="flex items-start gap-2.5 rounded-[14px] bg-accent-soft px-3.5 py-3">
              <InfoDot />
              <p className="min-w-0 text-[12px] leading-[1.5] text-ink [text-wrap:pretty]">
                {firstName(newestDraft.client_name)}’s pack is still a draft. Go through it with them before you approve — nothing is saved until you do.
              </p>
            </div>
          )}

          <Card className="overflow-hidden p-0">
            <div className="flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[13px]">
              <Label>Recent packs</Label>
              <span className="tnum shrink-0 whitespace-nowrap text-[11px] text-muted">Newest first</span>
            </div>
            <ul>
              {packs.map((p) => {
                const draft = p.status === "draft";
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(p.id)}
                      className="flex w-full items-center gap-[11px] border-t border-line bg-surface px-4 py-3 text-left hover:bg-canvas focus:outline-none focus-visible:bg-accent-soft"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-bold text-accent" aria-hidden="true">
                        {initials(p.client_name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{p.client_name}</span>
                        <span className="tnum mt-0.5 block truncate text-[12px] text-muted">{metaOf(p)}</span>
                        {p.cases_logged > 0 && (
                          <span className="mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-[5px] bg-ok/10 px-1.5 py-[3px] text-[10px] font-bold text-ok">
                            <Tick />
                            {p.cases_logged === 1 ? "1 case logged" : `${p.cases_logged} cases logged`}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-[7px]">
                        <span className={`whitespace-nowrap rounded-[5px] px-1.5 py-1 text-[9px] font-bold uppercase tracking-[.05em] ${draft ? "bg-warn/14 text-warn" : "bg-ok/12 text-ok"}`}>
                          {draft ? "Draft" : "Approved"}
                        </span>
                        <Chevron />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          <p className="px-1 text-center text-[11px] leading-[1.5] text-muted [text-wrap:pretty]">
            A pack turns your recap, photos and notes into one report you read through with the client, then share as a PDF if they want a copy.
          </p>
        </div>
      )}

      <PinnedBar>
        <button type="button" onClick={onNew} className="btn-primary flex w-full items-center justify-center gap-[7px] rounded-xl py-3.5 text-[15px] font-semibold">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New pack
        </button>
      </PinnedBar>
    </>
  );
}
