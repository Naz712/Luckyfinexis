// Meeting Pack, screen 2: New pack. Pick the client, drop in what you have
// (recap, photo, PDF, typed lines), then "Make report" ticks the inputs off
// in the processing state. Pure view: the container owns the draft and the
// pipeline. With a server connected the four tiles really record, open the
// camera, pick a file and take typed lines; without one they add samples.
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Client } from "../../mock/data";
import type { PackInput, PackSource } from "../../mock/packs";
import { parseISODate } from "../../lib/calc";
import { shortDate } from "../../lib/format";
import { canRecord, checkHealth, clock, downscaleImage, formatBytes, formatDuration, hostLabel, normaliseUrl, pickRecorderMime, recapFilename, type ApiSettings } from "../../lib/packsApi";
import { Card, Label } from "../../components/ui";
import Sheet from "../../components/Sheet";
import { PackHeader, PinnedBar, SourceGlyph, Spinner, initials } from "./shared";
import type { DraftInput, NewPackProps } from "./types";

/** The four tiles, in the handoff's order. */
const TILES: { kind: PackSource; line1: string; line2: string }[] = [
  { kind: "recap", line1: "Record", line2: "recap" },
  { kind: "photo", line1: "Take", line2: "photo" },
  { kind: "document", line1: "Attach PDF", line2: "or notes" },
  { kind: "typed", line1: "Type a", line2: "few lines" },
];

/** What the processing footnote calls each retained input. */
const KEPT_NAME: Record<Exclude<PackSource, "recap">, string> = { photo: "whiteboard photo", document: "notes PDF", typed: "typed lines" };
const KEPT_ORDER = ["photo", "document", "typed"] as const;

/** Stand-in for the time the backend would report; the container stamps the same value on the pack. */
const DELETED_AT = "12:41";

/** "a", "a and b", "a, b and c" */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Recording deleted at 12:41, right after transcription. The whiteboard photo, notes PDF and typed lines stay with the report." — only the kinds present. */
function processingNote(inputs: PackInput[], live: boolean): string {
  const sentences: string[] = [];
  if (inputs.some((i) => i.kind === "recap")) sentences.push(live ? "The recording is deleted the moment it is transcribed; only the transcript comes back." : `Recording deleted at ${DELETED_AT}, right after transcription.`);
  const kept = KEPT_ORDER.filter((k) => inputs.some((i) => i.kind === k));
  if (kept.length > 0) {
    const plural = kept.length > 1 || kept[0] === "typed";
    sentences.push(`The ${listJoin(kept.map((k) => KEPT_NAME[k]))} ${plural ? "stay" : "stays"} with the report.`);
  }
  return sentences.join(" ");
}

function doneDetail(i: PackInput): string {
  return i.kind === "recap" ? "Transcribed, recording deleted" : "Read, kept as attachment";
}

function runningDetail(i: PackInput): string {
  switch (i.kind) {
    case "recap":
      return "Transcribing…";
    case "photo":
      return "Reading the numbers off it";
    case "document":
      return i.pages === 1 ? "Reading 1 page" : `Reading ${i.pages ?? 0} pages`;
    case "typed":
      return "Pulling the lines in";
  }
}

function Plus({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.4v9.2M3.4 8h9.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function Tick({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Avatar({ name, size }: { name: string | null; size: 30 | 36 }) {
  const dim = size === 30 ? "h-[30px] w-[30px] text-[11px]" : "h-9 w-9 text-[12px]";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-accent-soft font-bold ${dim} ${name ? "text-accent" : "text-muted"}`} aria-hidden="true">
      {name ? initials(name) : "?"}
    </span>
  );
}

/** Bottom sheet listing the FC's clients by name, with a search for longer books. */
function ClientPicker({ open, clients, selected, onPick, onClose }: { open: boolean; clients: Client[]; selected: Client | null; onPick: (c: Client) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const close = () => {
    setQuery("");
    onClose();
  };
  const q = query.trim().toLowerCase();
  const shown = clients
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Sheet open={open} onClose={close} label="Choose a client">
      <div className="shrink-0 px-5">
        <div className="mt-[9px] flex items-baseline justify-between gap-2.5">
          <span className="text-[17px] font-bold tracking-[-.01em] text-ink">Choose a client</span>
          <button type="button" onClick={close} className="shrink-0 py-1 text-[13px] font-semibold text-accent">
            Cancel
          </button>
        </div>
        <div className="mt-[11px] border-b border-line pb-[11px]">
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
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-[38px] text-[14px] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
            />
            {query !== "" && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2.5 grid h-5 w-5 place-items-center rounded-full bg-canvas text-muted">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto px-5 pb-[26px] pt-1">
        {shown.map((c) => {
          const since = parseISODate(c.since);
          const on = c.id === selected?.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setQuery("");
                  onPick(c);
                }}
                className={`flex w-full items-center gap-[11px] border-b border-line py-[11px] text-left ${on ? "bg-accent-soft/55" : "bg-surface hover:bg-canvas"}`}
              >
                <Avatar name={c.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{c.name}</span>
                  <span className="tnum mt-0.5 block text-[11px] text-muted">
                    Client since {shortDate(since)} {since.getFullYear()}
                  </span>
                </span>
                {on && (
                  <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden="true">
                    <Tick size={11} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-6 text-center text-[13px] text-muted">No client matches that search.</li>}
      </ul>
    </Sheet>
  );
}

const newId = () => `draft_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Live capture: the microphone, the camera and file pickers, and a typing box. Everything lands in onCapture as a DraftInput. */
function useCapture(onCapture: (input: DraftInput) => void) {
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const [recording, setRecording] = useState<{ start: number; elapsed: number } | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRecording((r) => (r ? { ...r, elapsed: (Date.now() - r.start) / 1000 } : r)), 500);
    return () => window.clearInterval(t);
  }, [recording?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracks = () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  useEffect(() => () => stopTracks(), []);

  const startRecording = async () => {
    if (!canRecord()) {
      setHint("The microphone needs HTTPS or localhost, so pick a recording from your phone instead.");
      audioRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      const start = Date.now();
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setRecording(null);
        if (discardRef.current) return;
        const type = rec.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const sec = Math.max(1, Math.round((Date.now() - start) / 1000));
        if (blob.size === 0) {
          setHint("Nothing was recorded. Try again.");
          return;
        }
        onCapture({
          id: newId(),
          pack_id: "draft",
          kind: "recap",
          label: "Recap",
          detail: `${formatDuration(sec)} · ready to transcribe`,
          duration_sec: sec,
          pages: null,
          file_url: null,
          body: null,
          retained: false,
          blob,
          media_type: type.split(";")[0],
          filename: recapFilename(type),
        });
      };
      recorderRef.current = rec;
      rec.start(1000);
      setHint(null);
      setRecording({ start, elapsed: 0 });
    } catch (e) {
      setHint(`Microphone not available${e instanceof Error && e.name ? ` (${e.name})` : ""}. Pick a recording instead.`);
      audioRef.current?.click();
    }
  };
  const stopRecording = () => recorderRef.current?.stop();
  const cancelRecording = () => {
    discardRef.current = true;
    recorderRef.current?.stop();
  };

  const onAudioFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onCapture({ id: newId(), pack_id: "draft", kind: "recap", label: "Recap", detail: `${formatBytes(file.size)} · ready to transcribe`, duration_sec: null, pages: null, file_url: null, body: null, retained: false, blob: file, media_type: file.type || "audio/mp4", filename: file.name || recapFilename(file.type) });
  };
  const onPhotoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const small = await downscaleImage(file);
    onCapture({ id: newId(), pack_id: "draft", kind: "photo", label: "Sketch · photo", detail: `${small.type === "image/png" ? "PNG" : "JPEG"} · ${formatBytes(small.size)}`, duration_sec: null, pages: null, file_url: URL.createObjectURL(small), body: null, retained: true, blob: small, media_type: small.type, filename: file.name || "photo.jpg" });
  };
  const onDocFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const blob = pdf ? file : await downscaleImage(file);
    onCapture({
      id: newId(),
      pack_id: "draft",
      kind: "document",
      label: pdf ? "Notes · PDF" : "Notes · photo",
      detail: `${pdf ? "PDF" : "Image"} · ${formatBytes(blob.size)}`,
      duration_sec: null,
      pages: null,
      file_url: URL.createObjectURL(blob),
      body: null,
      retained: true,
      blob,
      media_type: pdf ? "application/pdf" : blob.type,
      filename: file.name || (pdf ? "notes.pdf" : "notes.jpg"),
    });
  };
  const addTyped = () => {
    const body = (typing ?? "").trim();
    if (!body) return setTyping(null);
    const lines = body.split(/\n+/).filter((l) => l.trim()).length;
    onCapture({ id: newId(), pack_id: "draft", kind: "typed", label: "Typed", detail: lines === 1 ? "1 line" : `${lines} lines`, duration_sec: null, pages: null, file_url: null, body, retained: true });
    setTyping(null);
  };

  const capture = (kind: PackSource) => {
    switch (kind) {
      case "recap":
        return void startRecording();
      case "photo":
        return photoRef.current?.click();
      case "document":
        return docRef.current?.click();
      case "typed":
        return setTyping("");
    }
  };

  const inputs = (
    <>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhotoFile} aria-label="Take a photo" />
      <input ref={docRef} type="file" accept="application/pdf,image/*" hidden onChange={onDocFile} aria-label="Attach notes" />
      <input ref={audioRef} type="file" accept="audio/*" hidden onChange={onAudioFile} aria-label="Pick a recording" />
    </>
  );
  return { capture, inputs, recording, stopRecording, cancelRecording, typing, setTyping, addTyped, hint, setHint };
}

/** "Pipeline · live · 192.168.1.20:8787" with a Connect/Change box for the server URL and access code. */
function ApiBox({ api, onApiChange }: { api: ApiSettings; onApiChange: (api: ApiSettings) => void }) {
  const live = api.url !== "";
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(api.url);
  const [code, setCode] = useState(api.code);
  const [status, setStatus] = useState<string | null>(null);
  const save = async () => {
    const next = { url: normaliseUrl(url), code: code.trim() };
    onApiChange(next);
    if (!next.url) {
      setStatus(null);
      setOpen(false);
      return;
    }
    setStatus("Checking…");
    try {
      const h = await checkHealth(next);
      setStatus(h.mock ? "Connected · mock mode (canned answers, no keys used)" : `Connected · recap: ${h.transcribe ?? "not set"} · report: ${h.report ?? "not set"}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not reach the server.");
    }
  };
  const disconnect = () => {
    setUrl("");
    setCode("");
    setStatus(null);
    onApiChange({ url: "", code: "" });
    setOpen(false);
  };
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[11.5px] leading-[1.5] text-muted">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          <span className="font-bold text-body">Pipeline</span> · {live ? `live · ${hostLabel(api.url)}` : "stand-in · sample report"}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 font-semibold text-accent">
          {open ? "Close" : live ? "Change" : "Connect"}
        </button>
      </div>
      {open && (
        <div className="mt-2.5 flex flex-col gap-2">
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.1.20:8787"
            aria-label="Server URL"
            className="tnum w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <input
            type="password"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code, if the server has one"
            aria-label="Access code"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} className="btn-primary rounded-lg px-3.5 py-2 text-[12.5px] font-semibold">
              Save
            </button>
            {live && (
              <button type="button" onClick={disconnect} className="rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-semibold text-body">
                Disconnect
              </button>
            )}
          </div>
          {status && <p role="status">{status}</p>}
          <p>
            On the laptop: put the keys in <span className="tnum">tracker/server/.env</span>, run <span className="tnum">npm run api</span>, and enter the laptop's address here. Details in the README.
          </p>
        </div>
      )}
    </div>
  );
}

export default function NewPack({ clients, draft, onChange, stage, processingIndex, onMakeReport, onAddInput, onCapture, api, onApiChange, onBack, extra }: NewPackProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const tilesRef = useRef<HTMLDivElement>(null);
  const processing = stage === "processing";
  const live = api.url !== "";
  const added = new Set(draft.inputs.map((i) => i.kind));
  const cap = useCapture(onCapture);

  const remove = (id: string) => {
    const gone = draft.inputs.find((i) => i.id === id);
    if (gone?.file_url?.startsWith("blob:")) URL.revokeObjectURL(gone.file_url);
    onChange({ ...draft, inputs: draft.inputs.filter((i) => i.id !== id) });
  };
  // "Add another" brings the tiles back into view and hands focus to the first one still available.
  const focusTiles = () => {
    const tiles = tilesRef.current;
    if (!tiles) return;
    tiles.scrollIntoView({ behavior: "smooth", block: "center" });
    tiles.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  };

  return (
    <>
      <PackHeader
        title="New pack"
        extra={extra}
        onBack={{ label: "Packs", onClick: onBack }}
        note={
          <>
            Nothing saved
            <br />
            until you approve
          </>
        }
      />

      <div className="flex flex-col gap-3 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3.5">
        <Card className="px-4 pb-4 pt-3.5">
          <Label>Client</Label>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={processing}
            aria-haspopup="dialog"
            className="mt-2 flex w-full items-center gap-2.5 rounded-full border border-line bg-surface py-[7px] pl-[7px] pr-3 text-left hover:bg-canvas disabled:hover:bg-surface"
          >
            <Avatar name={draft.client?.name ?? null} size={30} />
            <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${draft.client ? "text-ink" : "text-muted"}`}>{draft.client?.name ?? "Choose a client"}</span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-faint">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </Card>

        {processing ? (
          <Card className="px-4 pb-4 pt-5">
            <div className="flex items-center gap-[11px]">
              <Spinner />
              <div className="min-w-0">
                <div className="text-[17px] font-bold tracking-[-.01em] text-ink">Making your report…</div>
                <div className="mt-0.5 text-[12px] text-muted">{live ? "Up to a minute or two. Stay on this screen." : "About 20 seconds. Stay on this screen."}</div>
              </div>
            </div>
            <ul className="mt-3.5" aria-live="polite">
              {draft.inputs.map((i, n) => {
                const state = n < processingIndex ? "done" : n === processingIndex ? "running" : "queued";
                return (
                  <li key={i.id} className="flex items-center gap-[11px] border-t border-line py-[11px]">
                    {state === "done" ? (
                      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ok text-white" aria-hidden="true">
                        <Tick />
                      </span>
                    ) : (
                      <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full ${state === "running" ? "bg-accent-soft text-accent" : "bg-canvas text-faint"}`} aria-hidden="true">
                        <span className={`block h-[7px] w-[7px] rounded-full bg-current ${state === "running" ? "pulse-dot" : ""}`} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[13px] font-semibold ${state === "queued" ? "text-muted" : "text-ink"}`}>{i.label}</span>
                      <span className="tnum mt-0.5 block text-[11.5px] text-muted">
                        {state === "done" ? doneDetail(i) : state === "running" ? runningDetail(i) : `Queued · ${i.detail}`}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 rounded-xl bg-canvas px-[13px] py-[11px] text-[11.5px] leading-[1.5] text-muted">{processingNote(draft.inputs, live)}</p>
          </Card>
        ) : (
          <>
            <Card className="px-4 pb-4 pt-3.5">
              <div className="flex items-baseline justify-between gap-2.5">
                <Label>Drop in what you have</Label>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-muted">any one is enough</span>
              </div>
              <div ref={tilesRef} className="mt-3 grid grid-cols-2 gap-2">
                {TILES.map((t) => {
                  const done = added.has(t.kind);
                  return (
                    <button
                      key={t.kind}
                      type="button"
                      disabled={done || cap.recording !== null}
                      aria-label={done ? `${t.line1} ${t.line2}, already added` : undefined}
                      onClick={() => (live ? cap.capture(t.kind) : onAddInput(t.kind))}
                      className="flex flex-col items-center gap-[7px] rounded-[14px] border border-line bg-surface px-1.5 pb-3 pt-3.5 text-center hover:bg-canvas disabled:opacity-45 disabled:hover:bg-surface"
                    >
                      <span className="grid h-[34px] w-[34px] place-items-center rounded-[11px] bg-accent-soft text-accent" aria-hidden="true">
                        <SourceGlyph source={t.kind} size={16} />
                      </span>
                      <span className="text-[12px] font-semibold leading-[1.3] text-ink">
                        {t.line1}
                        <br />
                        {t.line2}
                      </span>
                    </button>
                  );
                })}
              </div>
              {live && cap.inputs}
              {cap.recording && (
                <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-line bg-canvas px-3.5 py-3" role="status" aria-live="polite">
                  <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-flag/12 text-flag" aria-hidden="true">
                    <span className="pulse-dot block h-[9px] w-[9px] rounded-full bg-current" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">Recording recap</span>
                    <span className="tnum mt-0.5 block text-[11.5px] text-muted">{clock(cap.recording.elapsed)} · say what was discussed and agreed</span>
                  </span>
                  <button type="button" onClick={cap.cancelRecording} className="shrink-0 rounded-lg px-2 py-2 text-[12.5px] font-semibold text-muted">
                    Cancel
                  </button>
                  <button type="button" onClick={cap.stopRecording} className="btn-primary shrink-0 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold">
                    Stop
                  </button>
                </div>
              )}
              {cap.typing !== null && (
                <div className="mt-3 rounded-[14px] border border-line bg-canvas p-3">
                  <textarea
                    autoFocus
                    value={cap.typing}
                    onChange={(e) => cap.setTyping(e.target.value)}
                    rows={4}
                    placeholder={"budget 400/mth\ncompare CI with FWD\nwants to retire at 60"}
                    aria-label="Typed lines"
                    className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[14px] leading-[1.45] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button type="button" onClick={() => cap.setTyping(null)} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-muted">
                      Cancel
                    </button>
                    <button type="button" onClick={cap.addTyped} className="btn-primary rounded-lg px-3.5 py-2 text-[12.5px] font-semibold">
                      Add lines
                    </button>
                  </div>
                </div>
              )}
              {cap.hint && (
                <p className="mt-2.5 text-[11.5px] leading-[1.5] text-warn" role="status">
                  {cap.hint}
                </p>
              )}
            </Card>

            {draft.inputs.length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className="flex items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[13px]">
                  <Label>Added</Label>
                  <span className="tnum shrink-0 text-[11px] text-muted">{draft.inputs.length === 1 ? "1 input" : `${draft.inputs.length} inputs`}</span>
                </div>
                <ul>
                  {draft.inputs.map((i) => (
                    <li key={i.id} className="flex items-center gap-[11px] border-t border-line px-4 py-3">
                      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-canvas text-accent" aria-hidden="true">
                        <SourceGlyph source={i.kind} size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{i.label}</span>
                        <span className="tnum mt-0.5 block text-[12px] leading-[1.45] text-muted">{i.detail}</span>
                        <span className={`mt-1.5 inline-block rounded-[5px] px-1.5 py-[3px] text-[10px] font-bold ${i.retained ? "bg-canvas text-muted" : "bg-ok/10 text-ok"}`}>
                          {i.retained ? "kept as attachment" : "recording deleted"}
                        </span>
                      </span>
                      {/* 26px control on a 44px hit target. */}
                      <button type="button" onClick={() => remove(i.id)} aria-label={`Remove ${i.label}`} className="-m-[9px] grid h-11 w-11 shrink-0 place-items-center">
                        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-canvas text-muted">
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                          </svg>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <p className="px-1 text-[11px] leading-[1.5] text-muted [text-wrap:pretty]">
              The recording is deleted as soon as it is transcribed. Everything else — photo, PDF, typed lines — stays attached, so any number can be checked against its original.
            </p>
            <ApiBox api={api} onApiChange={onApiChange} />
          </>
        )}
      </div>

      <PinnedBar>
        <div className="flex gap-[9px]">
          <button
            type="button"
            disabled={processing}
            onClick={focusTiles}
            className={`flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-4 py-3.5 text-[14px] font-semibold ${processing ? "text-faint" : "text-accent"}`}
          >
            <Plus />
            Add another
          </button>
          <button
            type="button"
            disabled={processing || cap.recording !== null}
            onClick={onMakeReport}
            className={`flex-1 rounded-xl py-3.5 text-center text-[15px] font-semibold ${processing ? "bg-accent-soft text-accent" : "btn-primary"}`}
          >
            {processing ? "Making report…" : "Make report"}
          </button>
        </div>
      </PinnedBar>

      <ClientPicker
        open={pickerOpen}
        clients={clients}
        selected={draft.client}
        onPick={(client) => {
          onChange({ ...draft, client });
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
