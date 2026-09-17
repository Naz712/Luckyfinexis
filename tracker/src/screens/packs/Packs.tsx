// Meeting Pack: the Packs tab. Owns the sub-navigation (list → new pack →
// report → check numbers) and the in-memory pack list; the screens are pure
// views. Two pipelines: with a server connected (see src/lib/packsApi.ts)
// "Make report" sends the real recap, photo, PDF and lines and renders what
// comes back, and "Rework all" sends the notes; without one, both are
// stand-ins on a timer that open the sample report.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TODAY, products, type Advisor } from "../../mock/data";
import { clientsForAdvisor, toISODate } from "../../lib/calc";
import { shortDate } from "../../lib/format";
import { blobToBase64, loadApiSettings, makePack, reworkPack, saveApiSettings, type ApiInput, type ApiSettings } from "../../lib/packsApi";
import {
  pack_inputs as seedInputs,
  pack_numbers as seedNumbers,
  pack_reports,
  packs as seedPacks,
  sampleInputsFor,
  type Attachment,
  type Pack,
  type PackInput,
  type PackNumber,
  type PackSource,
  type ReportContent,
} from "../../mock/packs";
import { Toast } from "./shared";
import type { DraftInput, NewPackDraft, ReworkNotes } from "./types";
import PacksHome from "./PacksHome";
import NewPack from "./NewPack";
import CheckNumbers from "./CheckNumbers";
import PackReport from "./PackReport";

type View = { kind: "list" } | { kind: "new" } | { kind: "check"; packId: string } | { kind: "report"; packId: string };

export interface LogPrefill {
  clientName: string;
  productId: string;
  premium: number;
  termYears: number;
}

let newSeq = 1;

const byNewest = (a: Pack, b: Pack) => (a.met_on < b.met_on ? 1 : a.met_on > b.met_on ? -1 : 0);

/** Strips the draft-only fields so a PackInput is what the pack record holds. */
function toPackInput(i: DraftInput, packId: string): PackInput {
  const { blob: _blob, media_type: _mt, filename: _fn, ...rest } = i;
  return { ...rest, pack_id: packId };
}

export default function Packs({
  advisor,
  extra,
  resetKey = 0,
  onLogCase,
}: {
  advisor: Advisor;
  extra?: ReactNode;
  /** Bumped by the shell when the Packs tab is tapped while already active: return to the list. */
  resetKey?: number;
  onLogCase: (p: LogPrefill) => void;
}) {
  const [packs, setPacks] = useState<Pack[]>(() => seedPacks.filter((p) => p.advisor_id === advisor.id).sort(byNewest));
  const [inputs, setInputs] = useState<Record<string, PackInput[]>>(() => {
    const m: Record<string, PackInput[]> = {};
    for (const i of seedInputs) (m[i.pack_id] ??= []).push(i);
    return m;
  });
  const [numbers, setNumbers] = useState<Record<string, PackNumber[]>>(() => {
    const m: Record<string, PackNumber[]> = {};
    for (const n of seedNumbers) (m[n.pack_id] ??= []).push(n);
    return m;
  });
  const [reports, setReports] = useState<Record<string, ReportContent>>(pack_reports);
  const [view, setView] = useState<View>({ kind: "list" });
  const [draft, setDraft] = useState<NewPackDraft>({ client: null, inputs: [] });
  const [stage, setStage] = useState<"adding" | "processing">("adding");
  const [processingIndex, setProcessingIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [api, setApi] = useState<ApiSettings>(loadApiSettings);
  const live = api.url !== "";
  const inFlight = useRef(false);
  const toastTimer = useRef(0);
  const clients = clientsForAdvisor(advisor.id);

  const notify = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const firstReset = useRef(true);
  useEffect(() => {
    if (firstReset.current) {
      firstReset.current = false;
      return;
    }
    setView({ kind: "list" });
  }, [resetKey]);

  const onApiChange = (next: ApiSettings) => {
    saveApiSettings(next);
    setApi(next);
  };

  // ── New pack ──
  const startNew = () => {
    setDraft({ client: null, inputs: [] });
    setStage("adding");
    setView({ kind: "new" });
  };
  /** Stand-in: a sample input of this kind. */
  const addInput = (kind: PackSource) => {
    setDraft((d) => {
      if (d.inputs.some((i) => i.kind === kind)) return d;
      const id = `draft_${d.inputs.length + 1}`;
      const sample = sampleInputsFor("draft").find((i) => i.kind === kind);
      const input: PackInput =
        sample ??
        ({ id, pack_id: "draft", kind: "typed", label: "Typed", detail: "2 lines", duration_sec: null, pages: null, file_url: null, body: "budget 400/mth · compare CI with FWD", retained: true } satisfies PackInput);
      return { ...d, inputs: [...d.inputs, { ...input, id, pack_id: "draft" }] };
    });
  };
  /** Live: something the FC just captured. One input per kind. */
  const capture = (input: DraftInput) => {
    setDraft((d) => ({ ...d, inputs: [...d.inputs.filter((i) => i.kind !== input.kind), input] }));
  };
  const makeReport = () => {
    if (!draft.client) return notify("Choose the client first.");
    if (draft.inputs.length === 0) return notify("Drop in at least one thing first.");
    if (live) return void makeLive();
    setStage("processing");
    setProcessingIndex(0);
  };

  /** Live pipeline: send everything to the server, then build the pack from what comes back. */
  const makeLive = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const client = draft.client!;
    const snapshot = draft.inputs;
    setStage("processing");
    setProcessingIndex(0);
    // No progress comes back from the server, so the list ticks on a timer and holds the last input until the reply.
    const ticker = window.setInterval(() => setProcessingIndex((i) => Math.min(i + 1, Math.max(snapshot.length - 1, 0))), 4000);
    try {
      const apiInputs: ApiInput[] = await Promise.all(
        snapshot.map(async (i): Promise<ApiInput> => {
          if (i.kind === "typed") return { id: i.id, kind: i.kind, text: i.body ?? "" };
          if (!i.blob) throw new Error(`The ${i.label} has no file behind it. Remove it and add it again.`);
          return { id: i.id, kind: i.kind, filename: i.filename, media_type: i.media_type ?? i.blob.type, data: await blobToBase64(i.blob), duration_sec: i.duration_sec ?? undefined };
        }),
      );
      const res = await makePack(api, {
        client: { name: client.name, since: client.since },
        advisor: { name: advisor.name },
        met_on: toISODate(TODAY),
        products: products.map((p) => ({ id: p.id, name: p.name })),
        inputs: apiInputs,
      });
      window.clearInterval(ticker);
      setProcessingIndex(snapshot.length);

      const id = `pack_live_${newSeq++}`;
      const countBy = (source: PackSource) => res.numbers.filter((n) => n.source === source).length;
      const found = (n: number) => (n === 1 ? "1 number found" : `${n} numbers found`);
      const packInputs: PackInput[] = snapshot.map((i) => {
        const base = toPackInput(i, id);
        switch (i.kind) {
          case "recap":
            return { ...base, detail: `${i.duration_sec ? `${Math.floor(i.duration_sec / 60)} min ${String(i.duration_sec % 60).padStart(2, "0")} s` : "Recording"} · Transcribed`, body: res.transcript, retained: false };
          case "photo":
            return { ...base, detail: `Read · ${found(countBy("photo"))}` };
          case "document": {
            const pages = res.pages[i.id] ?? base.pages;
            return { ...base, pages, detail: `${pages ? `${pages} page${pages === 1 ? "" : "s"}` : "Read"} · ${pages ? "Read" : found(countBy("document"))}` };
          }
          case "typed":
            return base;
        }
      });
      // A number read off a photo, or off notes that are an image, can show its original; a PDF, the recap and typed lines cannot.
      const cropFor = (source: PackSource) => {
        const from = snapshot.find((i) => i.kind === source);
        return from?.file_url && (from.media_type ?? "").startsWith("image/") ? from.file_url : "";
      };
      const packNumbers: PackNumber[] = res.numbers.map((n, k) => ({
        id: `${id}_num_${k + 1}`,
        pack_id: id,
        label: n.label,
        value: n.value,
        source: n.source,
        source_note: n.source_note,
        crop_url: cropFor(n.source),
        confirmed: false,
      }));
      const when = `${shortDate(TODAY)}, ${res.recording_deleted_at ?? new Date().toTimeString().slice(0, 5)}`;
      const attachments: Attachment[] = snapshot
        .filter((i): i is DraftInput & { kind: "photo" | "document" } => (i.kind === "photo" || i.kind === "document") && !!i.file_url)
        .map((i) => {
          const pages = res.pages[i.id];
          const pdf = i.media_type === "application/pdf";
          return i.kind === "photo"
            ? { kind: "photo" as const, title: "Whiteboard photo", caption: `${when} · read, ${countBy("photo")} number${countBy("photo") === 1 ? "" : "s"}`, urls: [i.file_url!], chips: [found(countBy("photo")), "Kept with this report"], mime: i.media_type }
            : { kind: "document" as const, title: "Notes", caption: pdf ? `PDF · ${pages ?? 1} page${(pages ?? 1) === 1 ? "" : "s"}` : `Photo · ${when}`, urls: [i.file_url!], chips: [pdf ? `${pages ?? 1} page${(pages ?? 1) === 1 ? "" : "s"}` : found(countBy("document")), "Kept with this report"], mime: i.media_type };
        });
      const content: ReportContent = { ...res.report, attachments: { items: attachments, sources: attachments.map((a) => a.kind) } };
      const pack: Pack = {
        id,
        advisor_id: advisor.id,
        client_id: client.id,
        client_name: client.name,
        kind: res.meeting?.kind ?? "Review",
        met_on: toISODate(TODAY),
        duration_min: null,
        status: "draft",
        approved_at: null,
        recording_deleted_at: res.recording_deleted_at,
        cases_logged: 0,
      };
      setPacks((ps) => [pack, ...ps]);
      setInputs((m) => ({ ...m, [id]: packInputs }));
      setNumbers((m) => ({ ...m, [id]: packNumbers }));
      setReports((r) => ({ ...r, [id]: content }));
      setDraft({ client: null, inputs: [] });
      setStage("adding");
      setView({ kind: "report", packId: id });
    } catch (e) {
      window.clearInterval(ticker);
      setStage("adding");
      notify(e instanceof Error ? e.message : "The report could not be made.");
    } finally {
      inFlight.current = false;
    }
  };

  // Stand-in pipeline: one input "finishes" every second or so, then the pack exists.
  useEffect(() => {
    if (live || view.kind !== "new" || stage !== "processing") return;
    if (processingIndex < draft.inputs.length) {
      const t = window.setTimeout(() => setProcessingIndex((i) => i + 1), 1100);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      const client = draft.client!;
      const id = `pack_new_${newSeq++}`;
      const pack: Pack = {
        id,
        advisor_id: advisor.id,
        client_id: client.id,
        client_name: client.name,
        kind: "Review",
        met_on: toISODate(TODAY),
        duration_min: null,
        status: "draft",
        approved_at: null,
        recording_deleted_at: draft.inputs.some((i) => i.kind === "recap") ? "12:41" : null,
        cases_logged: 0,
      };
      const packInputs = draft.inputs.map((i) => toPackInput(i, id));
      const hasEvidence = draft.inputs.some((i) => i.kind === "photo" || i.kind === "recap" || i.kind === "document");
      setPacks((ps) => [pack, ...ps]);
      setInputs((m) => ({ ...m, [id]: packInputs }));
      setNumbers((m) => ({ ...m, [id]: hasEvidence ? seedNumbers.map((n) => ({ ...n, id: `${id}_${n.id}`, pack_id: id, confirmed: false })) : [] }));
      setReports((r) => ({ ...r, [id]: pack_reports.pack_03 }));
      setStage("adding");
      setView({ kind: "report", packId: id });
    }, 700);
    return () => window.clearTimeout(t);
  }, [live, view.kind, stage, processingIndex, draft, advisor.id]);

  // ── Rework (live only) ──
  const reworkFor = (packId: string) =>
    live
      ? async (notes: ReworkNotes) => {
          const current = reports[packId];
          if (!current) throw new Error("This report is not loaded.");
          const cards = await reworkPack(api, current, notes as Record<string, string>);
          setReports((r) => ({ ...r, [packId]: { ...(r[packId] ?? current), ...cards } }));
        }
      : undefined;

  // ── Approval ──
  const approve = (packId: string) => {
    const hh = String(TODAY.getHours() || 12).padStart(2, "0");
    setPacks((ps) => ps.map((p) => (p.id === packId ? { ...p, status: "approved", approved_at: `${toISODate(TODAY)}T${hh}:52:00` } : p)));
    setView({ kind: "report", packId });
    notify("Approved and saved. Attachments kept with the report.");
  };
  const numbersFor = (packId: string) => numbers[packId] ?? [];
  const unconfirmed = (packId: string) => numbersFor(packId).filter((n) => !n.confirmed).length;

  const current = view.kind === "report" || view.kind === "check" ? packs.find((p) => p.id === view.packId) : undefined;

  return (
    <>
      {view.kind === "list" && <PacksHome advisor={advisor} packs={packs} onOpen={(packId) => setView({ kind: "report", packId })} onNew={startNew} extra={extra} />}
      {view.kind === "new" && (
        <NewPack
          advisor={advisor}
          clients={clients}
          draft={draft}
          onChange={setDraft}
          stage={stage}
          processingIndex={processingIndex}
          onMakeReport={makeReport}
          onAddInput={addInput}
          onCapture={capture}
          api={api}
          onApiChange={onApiChange}
          onBack={() => setView({ kind: "list" })}
          extra={extra}
        />
      )}
      {view.kind === "check" && current && (
        <CheckNumbers
          pack={current}
          numbers={numbersFor(current.id)}
          onToggle={(numberId) => setNumbers((m) => ({ ...m, [current.id]: numbersFor(current.id).map((n) => (n.id === numberId ? { ...n, confirmed: !n.confirmed } : n)) }))}
          onApprove={() => approve(current.id)}
          onBack={() => setView({ kind: "report", packId: current.id })}
          extra={extra}
        />
      )}
      {view.kind === "report" && current && (
        <PackReport
          key={current.id}
          pack={current}
          content={reports[current.id] ?? pack_reports.pack_03}
          inputs={inputs[current.id] ?? []}
          numbersConfirmed={unconfirmed(current.id) === 0}
          unconfirmedCount={unconfirmed(current.id)}
          onApprove={() => {
            if (unconfirmed(current.id) > 0) {
              notify(`Check the ${numbersFor(current.id).length} numbers first.`);
              setView({ kind: "check", packId: current.id });
            } else approve(current.id);
          }}
          onLogCase={(opt) => {
            setPacks((ps) => ps.map((p) => (p.id === current.id ? { ...p, cases_logged: p.cases_logged + 1 } : p)));
            onLogCase({ clientName: opt.client_name, productId: opt.product_id, premium: opt.premium, termYears: opt.term_years });
          }}
          onShare={() => notify("In the app this sends the report as a PDF, without “Just for you”, flags or notes.")}
          onRework={reworkFor(current.id)}
          onClose={() => setView({ kind: "list" })}
          notify={notify}
        />
      )}
      <Toast message={toast} />
    </>
  );
}
