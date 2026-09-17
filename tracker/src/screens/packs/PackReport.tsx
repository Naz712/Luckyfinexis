// Screen 4: the report the consultant reads through with the client. One
// report, no view switch: the blue header, the source legend, the cards with
// their element markers, "Just for you" in its ink frame, then the footer
// actions. Card notes, flags and "Rework all" are client-side state here — a
// stand-in until there is a backend to send the flagged cards to; the content
// itself never changes.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { CARD_TITLE, type Attachment, type CardCode, type PackKind, type PackSource } from "../../mock/packs";
import { Label } from "../../components/ui";
import { sgd, shortDate } from "../../lib/format";
import { initials, SourceGlyph, SourceLegend, SourceMarker } from "./shared";
import AttachmentViewer from "./AttachmentViewer";
import type { PackReportProps } from "./types";

/** Attachment paths are relative to the app's base URL (which ends with "/"). */
const BASE = import.meta.env.BASE_URL;

/** Cards that take a note. Attachments and "Just for you" do not. */
type NoteCode = Exclude<CardCode, "attachments" | "private">;
const NOTE_ORDER: NoteCode[] = ["summary", "situation", "priorities", "cover", "cashflow", "options", "questions", "next"];
const SOURCE_ORDER: PackSource[] = ["recap", "photo", "document", "typed"];

type WorkState = "running" | "done";

const KIND_LABEL: Record<PackKind, string> = { Review: "Review meeting", "First meeting": "First meeting", Closing: "Closing meeting" };
/** Header chips, one per input. */
const INPUT_CHIP: Record<PackSource, string> = { recap: "Recap", photo: "Whiteboard photo", document: "Notes PDF", typed: "Typed lines" };
/** The retained inputs as the small print names them. */
const RETAINED_WORD: Record<PackSource, string> = { recap: "recording", photo: "whiteboard photo", document: "notes PDF", typed: "typed lines" };
const REACTION_CHIP = { liked: "bg-ok/10 text-ok", compare: "bg-warn/12 text-warn", declined: "bg-canvas text-muted" } as const;
const CASHFLOW_BAR = {
  neutral: "bg-hairline",
  set: "bg-accent",
  proposed: "box-border min-w-[22px] border-[1.5px] border-dashed border-warn bg-gold/22",
  unplaced: "bg-line",
} as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "Tue 15 Sep 2026" from an ISO date, parsed as a local date so the weekday never shifts. */
function meetingDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${shortDate(date)} ${date.getFullYear()}`;
}

/** "2:14" from seconds. */
function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** "HH:MM" from an ISO datetime. */
function clockTime(iso: string): string {
  return iso.slice(11, 16);
}

/** "a", "a and b", "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ───────────────────────── Glyphs ─────────────────────────

function Tick({ size = 10, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function FlagGlyph() {
  return (
    <svg width="11" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 1.4v9.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.9 2.2h5.2L7.9 4.5l1.2 2.3H3.9V2.2Z" fill="currentColor" />
    </svg>
  );
}

function EyeGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.6c-2.6 0-4.8 1.7-5.8 4.4 1 2.7 3.2 4.4 5.8 4.4s4.8-1.7 5.8-4.4C12.8 5.3 10.6 3.6 8 3.6Z" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" />
    </svg>
  );
}

function ExclaimGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 4.6v4.2M8 11.2v.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CompareGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 10.4V2.6M5.2 5.4 8 2.6l2.8 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10.2v2.2a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ───────────────────────── Card chrome ─────────────────────────

/** The meta row (state chip, then the element markers) at the top right, with the title beneath at full width. */
function CardHead({ title, sources, chip }: { title: string; sources: PackSource[]; chip?: ReactNode }) {
  return (
    <>
      {(chip || sources.length > 0) && (
        <div className="mb-2 flex items-center justify-end gap-[7px]">
          {chip}
          {sources.length > 0 && (
            <span className="flex items-center gap-1">
              {sources.map((s) => (
                <SourceMarker key={s} source={s} />
              ))}
            </span>
          )}
        </div>
      )}
      <Label>{title}</Label>
    </>
  );
}

/** Flagged / Reworking / Reworked, 9px uppercase on a tinted chip. */
function StateChip({ kind }: { kind: "flagged" | WorkState }) {
  const base = "flex items-center gap-1 rounded px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[.05em]";
  if (kind === "running") {
    return (
      <span className={`${base} bg-accent-soft text-accent`}>
        <span className="spin block h-2.5 w-2.5 rounded-full border-2 border-accent/28 border-t-accent" aria-hidden="true" />
        Reworking
      </span>
    );
  }
  if (kind === "done") {
    return (
      <span className={`${base} bg-ok/12 text-ok`}>
        <Tick size={9} />
        Reworked
      </span>
    );
  }
  return <span className={`${base} bg-flag/12 text-flag`}>Flagged</span>;
}

/** The note box that opens in place at the bottom of a card. Enter saves, Escape closes without saving; Tab stays inside. */
function NoteBox({
  code,
  title,
  value,
  onChange,
  onSave,
  onRemove,
  onCancel,
}: {
  code: NoteCode;
  title: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // The card around the box also listens for Enter and Space; keep those here.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      onSave();
    } else if (e.key === "Tab" && ref.current) {
      const stops = Array.from(ref.current.querySelectorAll<HTMLElement>("input, button"));
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div ref={ref} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()} className="mt-3.5 cursor-default border-t border-line pt-3">
      <label htmlFor={`pack-note-${code}`} className="block text-[12px] font-semibold text-ink">
        What should change on “{title}”?
      </label>
      <input
        id={`pack-note-${code}`}
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 block w-full rounded-[10px] border border-accent bg-surface px-3 py-[11px] text-[14px] text-ink focus:outline-none focus:ring-[3px] focus:ring-accent/16"
      />
      <div className="mt-2.5 flex items-center justify-between gap-2.5">
        <span className="min-w-0 text-[11px] text-muted">Enter saves and closes</span>
        <span className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onRemove} className="rounded-[9px] bg-flag/8 px-[11px] py-2 text-[12px] font-semibold text-flag">
            Remove note
          </button>
          <button type="button" onClick={onSave} className="rounded-[9px] bg-brand px-3 py-2 text-[12px] font-semibold text-white">
            Save note
          </button>
        </span>
      </div>
    </div>
  );
}

/** The 52×68 page preview with a PDF badge that stands in for a document thumbnail. */
function PagePreview() {
  return (
    <span className="relative grid h-[92px] w-full place-items-center rounded-[11px] border border-line bg-canvas">
      <span className="flex h-[68px] w-[52px] flex-col justify-center gap-1.5 rounded-[3px] border border-line bg-surface px-1.5" aria-hidden="true">
        {[100, 80, 92, 64, 88, 72].map((w, i) => (
          <span key={i} className="block h-0.5 rounded-sm bg-line" style={{ width: `${w}%` }} />
        ))}
      </span>
      <span className="absolute bottom-[7px] right-[7px] rounded bg-ink px-1 py-[3px] text-[8px] font-bold tracking-[.06em] text-surface">PDF</span>
    </span>
  );
}

// ───────────────────────── The report ─────────────────────────

export default function PackReport({ pack, content, inputs, numbersConfirmed, unconfirmedCount, onApprove, onLogCase, onShare, onClose, notify }: PackReportProps) {
  const approved = pack.status === "approved";

  // Notes and flags: a card is flagged while it holds a note. Rework moves a
  // card through "running" to "done" and drops its note on the way.
  const [notes, setNotes] = useState<Partial<Record<NoteCode, string>>>({});
  const [work, setWork] = useState<Partial<Record<NoteCode, WorkState>>>({});
  const [editing, setEditing] = useState<{ code: NoteCode; text: string } | null>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const cardRefs = useRef<Partial<Record<NoteCode, HTMLElement | null>>>({});
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const schedule = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /** Saves the open box (an empty note removes it) and closes it. */
  const commit = () => {
    const e = editingRef.current;
    if (!e) return;
    const text = e.text.trim();
    setNotes((n) => {
      const next = { ...n };
      if (text) next[e.code] = text;
      else delete next[e.code];
      return next;
    });
    setEditing(null);
  };
  const removeNote = () => {
    const e = editingRef.current;
    if (!e) return;
    setNotes((n) => {
      const next = { ...n };
      delete next[e.code];
      return next;
    });
    setEditing(null);
  };
  const openNote = (code: NoteCode) => {
    if (work[code] === "running") return;
    if (editing?.code === code) return;
    if (editing) commit();
    setEditing({ code, text: notes[code] ?? "" });
  };

  // A tap anywhere outside the open card saves and closes its box.
  const editingCode = editing?.code ?? null;
  useEffect(() => {
    if (editingCode === null) return;
    const onDown = (ev: PointerEvent) => {
      const el = cardRefs.current[editingCode];
      if (el && ev.target instanceof Node && el.contains(ev.target)) return;
      commit();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // commit reads the box through a ref, so only the open card matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCode]);

  const flagCount = Object.keys(notes).length;

  const clearAll = () => {
    setNotes({});
    setEditing(null);
  };
  /** Stand-in for sending every flagged card at once: staggered 400 ms apart, each "done" 1.4–2 s later, the tick shown for 6 s. */
  const reworkAll = () => {
    const current: Partial<Record<NoteCode, string>> = { ...notes };
    const e = editingRef.current;
    if (e) {
      const text = e.text.trim();
      if (text) current[e.code] = text;
      else delete current[e.code];
      commit();
    }
    const flagged = NOTE_ORDER.filter((c) => current[c] !== undefined && work[c] !== "running");
    if (flagged.length === 0) return;
    notify(`Reworking ${flagged.length} card${flagged.length === 1 ? "" : "s"}. In the app this sends your notes to be redone.`);
    flagged.forEach((code, i) => {
      const start = i * 400;
      const finish = start + 1400 + Math.round(Math.random() * 600);
      schedule(start, () => setWork((w) => ({ ...w, [code]: "running" })));
      schedule(finish, () => {
        setWork((w) => ({ ...w, [code]: "done" }));
        setNotes((n) => {
          const next = { ...n };
          delete next[code];
          return next;
        });
      });
      schedule(finish + 6000, () =>
        setWork((w) => {
          if (w[code] !== "done") return w;
          const next = { ...w };
          delete next[code];
          return next;
        }),
      );
    });
  };

  /** A tappable card: meta row, title, body, and the note box when open. */
  const noteCard = (code: NoteCode, sources: PackSource[], body: ReactNode, title = CARD_TITLE[code]) => {
    const note = notes[code];
    const state = work[code];
    const chip = state === "running" ? <StateChip kind="running" /> : note !== undefined ? <StateChip kind="flagged" /> : state === "done" ? <StateChip kind="done" /> : null;
    const isOpen = editing?.code === code;
    return (
      <section
        ref={(el) => {
          cardRefs.current[code] = el;
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => openNote(code)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openNote(code);
          }
        }}
        className={`rounded-2xl bg-surface p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${state === "running" ? "cursor-default" : "cursor-pointer"}`}
      >
        <CardHead title={title} sources={sources} chip={chip} />
        <div className="mt-[9px]">{body}</div>
        {isOpen && editing && (
          <NoteBox code={code} title={title} value={editing.text} onChange={(text) => setEditing({ code, text })} onSave={commit} onRemove={removeNote} onCancel={() => setEditing(null)} />
        )}
      </section>
    );
  };

  // ── Header pieces ──
  const meta = [KIND_LABEL[pack.kind], meetingDate(pack.met_on), pack.duration_min !== null ? `${pack.duration_min} min` : null].filter(Boolean).join(" · ");
  const chips = inputs.map((i) => ({ id: i.id, kind: i.kind, text: i.kind === "recap" && i.duration_sec !== null ? `Recap ${mmss(i.duration_sec)}` : INPUT_CHIP[i.kind] }));

  // ── Legend: every element any card drew on, in a fixed order ──
  const cardSources = [
    content.summary.sources,
    content.attachments.sources,
    content.situation.sources,
    content.priorities.sources,
    content.cover.sources,
    content.cashflow.sources,
    content.options.sources,
    content.questions.sources,
    content.next.sources,
  ];
  const legend = SOURCE_ORDER.filter((s) => cardSources.some((list) => list.includes(s)));

  // ── Footer pieces ──
  const logOption = content.options.items.find((o) => o.log);
  const logLabel = logOption ? (/\bterm\b/i.test(logOption.name) ? "Log the term case" : `Log the ${logOption.name.split(/\s+/)[0]} case`) : "";
  const retained = joinAnd(Array.from(new Set(inputs.filter((i) => i.retained).map((i) => RETAINED_WORD[i.kind]))));
  const smallPrint =
    (approved ? "Approved. Saved with its attachments." : "Draft. Nothing is saved until you approve.") +
    " Sharing sends the report as a PDF and leaves out “Just for you”." +
    (pack.recording_deleted_at ? ` Recording deleted at ${pack.recording_deleted_at}.` : "") +
    (retained ? ` ${retained.charAt(0).toUpperCase()}${retained.slice(1)} kept with this report.` : "");

  const hasPrivate = content.private.referrals.length > 0 || content.private.testimonial !== null;

  return (
    <>
      <header className="rounded-b-[24px] bg-brand px-4 pb-5 pt-[max(6px,env(safe-area-inset-top))] text-white">
        <div className="flex items-start justify-between gap-2.5 pt-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[.13em] text-white/75">Meeting report</div>
            <h1 className="mt-1 text-[24px] font-bold leading-[1.15] tracking-[-.015em]">{pack.client_name}</h1>
            <div className="tnum mt-1 text-[12px] leading-[1.5] text-white/85">{meta}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="relative grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-white/16 text-white before:absolute before:-inset-2 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <CloseGlyph />
          </button>
        </div>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c.id} className="tnum flex items-center gap-[5px] whitespace-nowrap rounded-full bg-white/16 px-2.5 py-[5px] text-[11px] font-semibold">
                <SourceGlyph source={c.kind} size={11} />
                {c.text}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2.5">
          {approved ? (
            <span className="tnum inline-flex items-center gap-[7px] rounded-full border border-ok/50 bg-ok/28 px-[13px] py-[7px] text-[12px] font-semibold text-white">
              <Tick size={11} strokeWidth={1.9} />
              Approved · saved{pack.approved_at ? ` ${clockTime(pack.approved_at)}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-[7px] rounded-full border border-gold/50 bg-warn/28 px-[13px] py-[7px] text-[12px] font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
              Draft · waiting for your approval
            </span>
          )}
        </div>
      </header>

      <div className={`flex flex-col gap-3 px-4 pt-3.5 ${flagCount > 0 ? "pb-[76px]" : "pb-5"}`}>
        {legend.length > 0 && <SourceLegend sources={legend} />}

        {/* 1. In one line */}
        {noteCard("summary", content.summary.sources, <p className="text-pretty text-[15px] leading-[1.55] text-ink">{content.summary.text}</p>)}

        {/* 2. Attached — not flaggable; each thumbnail opens the original */}
        {content.attachments.items.length > 0 && (
          <section className="rounded-2xl bg-surface p-4">
            <CardHead title={CARD_TITLE.attachments} sources={content.attachments.sources} />
            <div className="mt-[9px] grid grid-cols-2 gap-2.5">
              {content.attachments.items.map((a) => (
                <button
                  key={a.title}
                  type="button"
                  onClick={() => setViewing(a)}
                  className="btn-lift block min-w-0 rounded-[11px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  {a.kind === "photo" ? <img src={BASE + (a.urls[0] ?? "")} alt="" className="block h-[92px] w-full rounded-[11px] bg-canvas object-cover" /> : <PagePreview />}
                  <span className="mt-[7px] block text-[12px] font-semibold text-ink">{a.title}</span>
                  <span className="tnum mt-0.5 block text-[11px] leading-[1.4] text-muted">{a.caption}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 3. Your situation */}
        {noteCard(
          "situation",
          content.situation.sources,
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line">
            {content.situation.facts.map((f) => (
              <div key={f.label} className="bg-canvas px-3 py-[10px]">
                <div className="text-[11px] text-muted">{f.label}</div>
                <div className="tnum mt-0.5 text-[15px] font-semibold text-ink">{f.value}</div>
              </div>
            ))}
            {content.situation.facts.length % 2 === 1 && <div className="bg-canvas" aria-hidden="true" />}
          </div>,
        )}

        {/* 4. What matters to you */}
        {noteCard(
          "priorities",
          content.priorities.sources,
          <div>
            {content.priorities.items.map((p, i) => (
              <div key={p.text} className="flex items-center justify-between gap-2.5 border-t border-well py-[11px] last:pb-0">
                <span className="flex min-w-0 items-center gap-[9px]">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${p.now ? "bg-brand text-white" : "bg-accent-soft text-accent"}`}>{i + 1}</span>
                  <span className="min-w-0 text-[14px] font-semibold text-ink">{p.text}</span>
                </span>
                <span className={`tnum shrink-0 whitespace-nowrap rounded-[5px] px-[7px] py-1 text-[11px] font-bold ${p.now ? "bg-accent-soft text-accent" : "bg-canvas text-muted"}`}>{p.horizon}</span>
              </div>
            ))}
          </div>,
        )}

        {/* 5. Cover today vs what we agreed you need */}
        {noteCard(
          "cover",
          content.cover.sources,
          <div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
              <span className="flex items-center gap-[5px] text-[11px] text-muted">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" aria-hidden="true" />
                You have
              </span>
              <span className="flex items-center gap-[5px] text-[11px] text-muted">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-gold" aria-hidden="true" />
                Short by
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-3.5">
              {content.cover.rows.map((r) => {
                const have = r.need > 0 ? Math.max(0, Math.min(1, r.have / r.need)) : 0;
                return (
                  <div key={r.label}>
                    <div className="flex items-baseline justify-between gap-2.5">
                      <span className="min-w-0 text-[14px] font-semibold text-ink">{r.label}</span>
                      <span className="tnum shrink-0 text-[12px] text-muted">{r.haveLabel}</span>
                    </div>
                    <div className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-canvas" role="img" aria-label={`${r.haveLabel}, ${r.shortLabel}`}>
                      {have > 0 && <span className="h-full shrink-0 rounded-full bg-accent" style={{ width: `${have * 100}%` }} />}
                      {have < 1 && <span className="h-full flex-1 rounded-full bg-gold" />}
                    </div>
                    <div className="tnum mt-1 text-[12px] font-semibold text-warn">{r.shortLabel}</div>
                  </div>
                );
              })}
              {content.cover.flagged && (
                <div className="flex items-start gap-[9px] rounded-xl bg-warn/10 px-3 py-[11px]">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-warn text-surface" aria-hidden="true">
                    <ExclaimGlyph />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">{content.cover.flagged.label}</span>
                    <span className="mt-0.5 block text-pretty text-[12px] leading-[1.45] text-gold-ink">{content.cover.flagged.text}</span>
                  </span>
                </div>
              )}
            </div>
          </div>,
        )}

        {/* 6. Where the money goes each month */}
        {noteCard(
          "cashflow",
          content.cashflow.sources,
          <div className="flex flex-col gap-[11px]">
            {content.cashflow.rows.map((r) => {
              const width = content.cashflow.total > 0 ? Math.min(100, (r.amount / content.cashflow.total) * 100) : 0;
              const unplaced = r.kind === "unplaced";
              return (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className={`min-w-0 text-[13px] font-semibold ${unplaced ? "text-muted" : "text-ink"}`}>
                      {r.label}
                      {r.sub && <span className="font-medium text-muted"> {r.sub}</span>}
                    </span>
                    <span className={`tnum shrink-0 text-[13px] font-semibold ${r.kind === "proposed" ? "text-warn" : unplaced ? "text-muted" : "text-body"}`}>{sgd(r.amount)}</span>
                  </div>
                  <div className="mt-1.5 h-[9px] overflow-hidden rounded-full bg-canvas" role="img" aria-label={`${r.label}: ${sgd(r.amount)} of ${content.cashflow.totalLabel}`}>
                    <span className={`block h-full rounded-full ${CASHFLOW_BAR[r.kind]}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>,
          `Where the ${content.cashflow.totalLabel} goes each month`,
        )}

        {/* 7. Options we looked at */}
        {noteCard(
          "options",
          content.options.sources,
          <div>
            {content.options.items.map((o) => (
              <div key={o.name} className="border-t border-well py-3 last:pb-0">
                <div className="flex items-start justify-between gap-2.5">
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">{o.name}</span>
                    <span className="tnum mt-0.5 block text-[12px] text-muted">{o.detail}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-right">
                    <span className="tnum text-[15px] font-bold text-ink">{o.premium}</span>
                    <span className="text-[11px] text-muted">/month</span>
                  </span>
                </div>
                <span className={`mt-2 inline-flex items-center gap-[5px] rounded-md px-2 py-1 text-[11px] font-bold ${REACTION_CHIP[o.reaction]}`}>
                  {o.reaction === "liked" && <Tick />}
                  {o.reaction === "compare" && <CompareGlyph />}
                  {o.reactionText}
                </span>
              </div>
            ))}
            {content.options.note && <div className="mt-3 border-t border-line pt-[11px] text-pretty text-[12px] leading-[1.5] text-muted">{content.options.note}</div>}
          </div>,
        )}

        {/* 8. What you asked about — the client's own words, verbatim */}
        {noteCard(
          "questions",
          content.questions.sources,
          <div className="flex flex-col gap-3">
            {content.questions.items.map((q) => (
              <div key={q.quote} className="border-l-2 border-accent-soft pl-3">
                <p className="text-pretty text-[14px] italic leading-[1.5] text-ink">“{q.quote}”</p>
                <p className="mt-1.5 text-pretty text-[13px] leading-[1.55] text-body">{q.answer}</p>
              </div>
            ))}
          </div>,
        )}

        {/* 9. Next */}
        {noteCard(
          "next",
          content.next.sources,
          <div>
            {content.next.items.map((n) => (
              <div key={`${n.date} ${n.text}`} className="flex items-start gap-3 border-t border-well py-3 last:pb-0">
                <span className="tnum min-w-[58px] shrink-0 whitespace-nowrap text-[12px] font-bold leading-[1.45] text-accent">{n.date}</span>
                <span className="min-w-0 text-pretty text-[14px] leading-[1.45] text-ink">{n.text}</span>
              </div>
            ))}
          </div>,
        )}

        {/* 10. Just for you — consultant-only, not flaggable, left out of the shared PDF */}
        {hasPrivate && (
          <section className="rounded-2xl bg-ink p-0.5" aria-label={CARD_TITLE.private}>
            <div className="rounded-[14px] bg-surface p-4">
              <div className="flex items-center justify-between gap-2.5">
                <span className="flex min-w-0 items-center gap-[7px]">
                  <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ink text-surface" aria-hidden="true">
                    <EyeGlyph />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[.08em] text-ink">{CARD_TITLE.private}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">not in the shared PDF</span>
              </div>
              {content.private.referrals.length > 0 && (
                <div className="mt-3 border-t border-well pt-3">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[13px] font-bold text-ink">Referrals</span>
                    <span className="tnum text-[11px] text-muted">{content.private.referrals.length} named</span>
                  </div>
                  {content.private.referrals.map((r) => (
                    <div key={r.name} className="mt-2.5 flex items-start gap-2.5">
                      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent" aria-hidden="true">
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-ink">{r.name}</span>
                        <span className="mt-0.5 block text-pretty text-[12px] leading-[1.45] text-muted">{r.text}</span>
                      </span>
                    </div>
                  ))}
                  <span className="mt-2.5 inline-block rounded-md bg-accent-soft px-[9px] py-[5px] text-[11px] font-bold text-accent">Counts toward Referrals once logged</span>
                </div>
              )}
              {content.private.testimonial && (
                <div className="mt-3 border-t border-well pt-3">
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-[13px] font-bold text-ink">Testimonial</span>
                    {content.private.testimonial.agreed ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-ok">
                        <Tick size={11} strokeWidth={1.9} />
                        Agreed
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-muted">Not asked</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-pretty text-[12px] leading-[1.5] text-muted">{content.private.testimonial.text}</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="mt-1 flex flex-col gap-[9px]">
          {approved ? (
            <button type="button" disabled className="flex w-full items-center justify-center gap-[7px] rounded-xl bg-ok/12 py-[15px] text-[15px] font-semibold text-ok">
              <Tick size={12} strokeWidth={1.9} />
              Approved
            </button>
          ) : (
            <button type="button" onClick={onApprove} className="btn-primary block w-full rounded-xl py-[15px] text-center text-[15px] font-semibold text-white">
              Approve and save
            </button>
          )}
          {!approved && !numbersConfirmed && (
            <p className="tnum -mt-0.5 px-1 text-center text-[11px] text-muted">
              Check {unconfirmedCount} number{unconfirmedCount === 1 ? "" : "s"} first — tap Approve to go there.
            </p>
          )}
          {logOption?.log && (
            <button
              type="button"
              onClick={() => onLogCase({ client_name: pack.client_name, product_id: logOption.log!.product_id, premium: logOption.log!.premium, term_years: logOption.log!.term_years })}
              className="block w-full rounded-xl border border-line bg-surface py-[15px] text-center text-[15px] font-semibold text-accent"
            >
              {logLabel}
            </button>
          )}
          <button type="button" onClick={onShare} className="flex w-full items-center justify-center gap-[7px] rounded-xl border border-line bg-surface py-[15px] text-[15px] font-semibold text-accent">
            <UploadGlyph />
            Share as PDF
          </button>
          <p className="tnum mt-0.5 px-1 text-center text-pretty text-[11px] leading-[1.55] text-muted">{smallPrint}</p>
        </div>
      </div>

      {flagCount > 0 && (
        <div className="drop-in fixed inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom))] z-10 mx-auto flex w-full max-w-[430px] items-center justify-between gap-2.5 bg-ink px-3.5 py-[11px] text-canvas">
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-flag/22 text-[#ff8a93]" aria-hidden="true">
              <FlagGlyph />
            </span>
            <span className="min-w-0">
              <span className="tnum block text-[13px] font-semibold" role="status">
                {flagCount} card{flagCount === 1 ? "" : "s"} flagged
              </span>
              <span className="block text-[11px] opacity-75">Notes are kept until you rework</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={clearAll} className="rounded-[9px] bg-canvas/12 px-[11px] py-[9px] text-[12px] font-semibold text-canvas/85">
              Clear
            </button>
            <button type="button" onClick={reworkAll} className="whitespace-nowrap rounded-[9px] bg-canvas px-[13px] py-[9px] text-[12px] font-bold text-ink">
              Rework all
            </button>
          </span>
        </div>
      )}

      <AttachmentViewer open={viewing !== null} attachment={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
