// Meeting Pack: the Packs tab. Owns the sub-navigation (list → new pack →
// report → check numbers) and the in-memory pack list; the screens are pure
// views. The pipeline is a stand-in: "Make report" ticks through the inputs
// on a timer and opens the sample report, since there is no backend yet.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TODAY, type Advisor } from "../../mock/data";
import { clientsForAdvisor, toISODate } from "../../lib/calc";
import {
  pack_inputs as seedInputs,
  pack_numbers as seedNumbers,
  pack_reports,
  packs as seedPacks,
  sampleInputsFor,
  type Pack,
  type PackInput,
  type PackNumber,
  type PackSource,
  type ReportContent,
} from "../../mock/packs";
import { Toast } from "./shared";
import type { NewPackDraft } from "./types";
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

  // ── New pack ──
  const startNew = () => {
    setDraft({ client: null, inputs: [] });
    setStage("adding");
    setView({ kind: "new" });
  };
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
  const makeReport = () => {
    if (!draft.client) return notify("Choose the client first.");
    if (draft.inputs.length === 0) return notify("Drop in at least one thing first.");
    setStage("processing");
    setProcessingIndex(0);
  };
  // Stand-in pipeline: one input "finishes" every second or so, then the pack exists.
  useEffect(() => {
    if (view.kind !== "new" || stage !== "processing") return;
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
      const packInputs = draft.inputs.map((i) => ({ ...i, pack_id: id }));
      const hasEvidence = draft.inputs.some((i) => i.kind === "photo" || i.kind === "recap" || i.kind === "document");
      setPacks((ps) => [pack, ...ps]);
      setInputs((m) => ({ ...m, [id]: packInputs }));
      setNumbers((m) => ({ ...m, [id]: hasEvidence ? seedNumbers.map((n) => ({ ...n, id: `${id}_${n.id}`, pack_id: id, confirmed: false })) : [] }));
      setReports((r) => ({ ...r, [id]: pack_reports.pack_03 }));
      setStage("adding");
      setView({ kind: "report", packId: id });
    }, 700);
    return () => window.clearTimeout(t);
  }, [view.kind, stage, processingIndex, draft, advisor.id]);

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
          onClose={() => setView({ kind: "list" })}
          notify={notify}
        />
      )}
      <Toast message={toast} />
    </>
  );
}
