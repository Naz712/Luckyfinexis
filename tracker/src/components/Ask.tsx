// The in-app assistant: a small button in every header and a bottom sheet
// that answers questions about this advisor's own production. With the
// server connected the model picks tools and phrases the answer; without it
// a keyword router understands the suggested kinds of question. Either way
// every figure comes from the tools in src/lib/ask.ts, which use calc.ts.
// The sheet's foot also holds the server and sign-in settings, since the
// server is what the assistant needs and the individual link is how an FA
// gets their own rows.
import { useRef, useState, type FormEvent } from "react";
import { TODAY } from "../mock/data";
import { toISODate } from "../lib/calc";
import { isoDay } from "../lib/format";
import { askServer, checkHealth, hostLabel, normaliseUrl, type ApiSettings, type ChatMessage, type DataSource, type Session } from "../lib/api";
import { SUGGESTIONS, TOOL_DEFS, localAnswer, runTool, type Answer, type AskContext } from "../lib/ask";
import Sheet from "./Sheet";

/** Sparkle-in-a-bubble, 16 on a 16 grid. */
function AskGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 3.5A1.5 1.5 0 0 1 4 2h8a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 11H7l-3 2.6V11h0a1.5 1.5 0 0 1-1.5-1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 4.2l.7 1.6 1.6.7-1.6.7L8 8.8l-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" />
    </svg>
  );
}

/** The header button. "light" sits on a white header, "dark" on the blue hero. */
export function AskButton({ onClick, tone = "light" }: { onClick: () => void; tone?: "light" | "dark" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask about your book"
      title="Ask about your book"
      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full ${tone === "dark" ? "bg-white/16 text-white hover:bg-white/24" : "bg-accent-soft text-accent hover:bg-accent/16"}`}
    >
      <AskGlyph />
    </button>
  );
}

const MAX_ROUNDS = 5;

async function askLive(api: ApiSettings, question: string, history: ChatMessage[], ctx: AskContext): Promise<{ answer: Answer; messages: ChatMessage[] }> {
  const messages: ChatMessage[] = [...history, { role: "user", content: question }];
  const basis: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { message } = await askServer(api, { advisor: { name: ctx.advisor.name }, today: toISODate(TODAY), messages, tools: TOOL_DEFS });
    messages.push(message);
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = runTool(call.function.name, args, ctx);
        if (!basis.includes(result.label)) basis.push(result.label);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }
    const text = typeof message.content === "string" ? message.content : "";
    let parsed: Partial<Answer> & { rows?: { label: string; value: string; sub?: string | null }[]; note?: string | null };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      parsed = { title: "Answer", summary: text };
    }
    return {
      answer: {
        title: String(parsed.title ?? "Answer"),
        summary: String(parsed.summary ?? ""),
        rows: (parsed.rows ?? []).map((r) => ({ label: String(r.label), value: String(r.value), sub: r.sub ? String(r.sub) : undefined })),
        note: parsed.note ? String(parsed.note) : undefined,
        basis,
      },
      messages,
    };
  }
  throw new Error("That took too many steps. Try asking it another way.");
}

const FIELD = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";

/** What the rows on screen came from, in one line. */
function sourceLine(source: DataSource): { text: string; flag: boolean } {
  switch (source.kind) {
    case "sample":
      return { text: "Showing the sample import.", flag: false };
    case "server":
      return { text: `Showing your production as of ${source.as_of ? isoDay(source.as_of) : "—"}.`, flag: false };
    case "error":
      return { text: source.message, flag: true };
  }
}

/**
 * Server and sign-in, at the foot of the sheet. A small row says where the
 * app is pointed; opening it shows the server address and access code, and
 * the sign-in for typing an individual link's code and key in by hand.
 */
function ServerBox({
  api,
  onApiChange,
  session,
  onSessionChange,
  source,
}: {
  api: ApiSettings;
  onApiChange: (a: ApiSettings) => void;
  session: Session | null;
  onSessionChange: (s: Session | null) => void;
  source: DataSource;
}) {
  const live = api.url !== "";
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(api.url);
  const [code, setCode] = useState(api.code);
  const [status, setStatus] = useState<string | null>(null);
  const [fc, setFc] = useState("");
  const [key, setKey] = useState("");
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
      setStatus(h.mock ? "Connected · mock mode (canned answers, no key used)" : `Connected · ${h.report ?? "model not set"}${h.import ? ` · import: ${h.import.advisers} advisers as of ${h.import.as_of ? isoDay(h.import.as_of) : "—"}` : ""}`);
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
  const signIn = (e: FormEvent) => {
    e.preventDefault();
    const fcCode = fc.trim().toUpperCase();
    const linkKey = key.trim();
    if (!fcCode || !linkKey) return;
    onSessionChange({ fc_code: fcCode, key: linkKey });
    setFc("");
    setKey("");
  };
  const src = sourceLine(source);
  return (
    <section aria-label="Server and sign-in" className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[11.5px] leading-[1.5] text-muted">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          <span className="font-bold text-body">Server</span> · {live ? `live · ${hostLabel(api.url)}` : "stand-in"}
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
            placeholder="https://finexis-packs-api.onrender.com"
            aria-label="Server URL"
            className={`tnum ${FIELD}`}
          />
          <input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" aria-label="Access code" className={FIELD} />
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
          <div className="mt-1 border-t border-well pt-2.5">
            <div className="font-bold text-body">Your sign-in</div>
            {session ? (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="tnum">Signed in as {session.fc_code}</span>
                <button type="button" onClick={() => onSessionChange(null)} className="shrink-0 rounded-lg border border-line px-3.5 py-2 text-[12.5px] font-semibold text-body">
                  Sign out
                </button>
              </div>
            ) : (
              <form onSubmit={signIn} className="mt-1.5 flex flex-col gap-2">
                <input type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={fc} onChange={(e) => setFc(e.target.value)} placeholder="FC code" aria-label="FC code" className={`tnum ${FIELD}`} />
                <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Link key" aria-label="Link key" className={FIELD} />
                <button type="submit" disabled={!fc.trim() || !key.trim()} className="btn-primary self-start rounded-lg px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-45">
                  Sign in
                </button>
              </form>
            )}
            <p className="mt-1.5">Your individual link signs you in by itself. This is only for typing it in by hand.</p>
          </div>
        </div>
      )}
      <p className={`mt-1.5 ${src.flag ? "text-flag" : ""}`}>{src.text}</p>
    </section>
  );
}

export default function AskSheet({
  open,
  onClose,
  ctx,
  api,
  onApiChange,
  session,
  onSessionChange,
  source,
}: {
  open: boolean;
  onClose: () => void;
  ctx: AskContext;
  api: ApiSettings;
  onApiChange: (a: ApiSettings) => void;
  session: Session | null;
  onSessionChange: (s: Session | null) => void;
  source: DataSource;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const live = api.url !== "";

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setAsked(text);
    setQuestion("");
    setError(null);
    if (!live) {
      setAnswer(localAnswer(text, ctx));
      return;
    }
    setBusy(true);
    try {
      const res = await askLive(api, text, history.current, ctx);
      history.current = res.messages.slice(-12);
      setAnswer(res.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No answer came back.");
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };
  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} label="Ask about your book" height="min(720px, 92dvh)">
      <div className="shrink-0 px-5">
        <div className="mt-[9px] flex items-baseline justify-between gap-2.5">
          <span className="text-[17px] font-bold tracking-[-.01em] text-ink">Ask about your book</span>
          <button type="button" onClick={close} className="shrink-0 py-1 text-[13px] font-semibold text-accent">
            Done
          </button>
        </div>
        <form onSubmit={submit} className="mt-[11px] flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pace, Elite credits, months, what-ifs…"
            aria-label="Your question"
            autoComplete="off"
            enterKeyHint="send"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
          />
          <button type="submit" disabled={busy || !question.trim()} className="btn-primary shrink-0 rounded-xl px-4 py-2.5 text-[14px] font-semibold disabled:opacity-45">
            Ask
          </button>
        </form>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => void ask(s)} disabled={busy} className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-body hover:bg-canvas disabled:opacity-45">
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(26px,env(safe-area-inset-bottom))] pt-2">
        {asked && <p className="mb-2 text-[12px] text-muted">You asked: “{asked}”</p>}
        {busy && (
          <div className="flex items-center gap-2.5 py-3 text-[13px] text-muted" role="status">
            <span className="spin block h-[18px] w-[18px] rounded-full border-[2.5px] border-accent-soft border-t-accent" aria-hidden="true" />
            Looking it up…
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl border border-flag/30 bg-flag/8 px-3.5 py-2.5 text-[12.5px] text-flag">
            {error}
          </p>
        )}
        {answer && !busy && (
          <section aria-label="Answer" className="drop-in rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-[15px] font-bold leading-snug tracking-[-.01em] text-ink">{answer.title}</h2>
            {answer.summary && <p className="mt-1.5 text-[13px] leading-[1.5] text-body [text-wrap:pretty]">{answer.summary}</p>}
            {answer.rows.length > 0 && (
              <ul className="mt-3 border-t border-line">
                {answer.rows.map((r, i) => (
                  <li key={`${r.label}-${i}`} className="flex items-baseline justify-between gap-3 border-b border-well py-2">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink">{r.label}</span>
                      {r.sub && <span className="block text-[11.5px] leading-[1.4] text-muted">{r.sub}</span>}
                    </span>
                    <span className="tnum shrink-0 text-right text-[13px] font-bold text-ink">{r.value}</span>
                  </li>
                ))}
              </ul>
            )}
            {answer.note && <p className="mt-2.5 text-[11.5px] leading-[1.5] text-muted">{answer.note}</p>}
            {answer.basis.length > 0 && <p className="mt-2 text-[11px] text-faint">From: {answer.basis.join(" · ")}</p>}
          </section>
        )}
        {!answer && !busy && !error && (
          <p className="py-2 text-[12.5px] leading-[1.5] text-muted">Ask about your pace, your Elite credits, your production by month, or what one more case would do. Answers come only from what is in this app.</p>
        )}
        <p className="mt-4 text-[11px] leading-[1.5] text-faint">
          {live ? "Answers use only this app's data, fetched by the tools listed under each answer. Nothing outside it is looked up." : "Stand-in: understands the suggested kinds of question. Connect the server below to ask anything in your own words."}
        </p>
        <ServerBox api={api} onApiChange={onApiChange} session={session} onSessionChange={onSessionChange} source={source} />
      </div>
    </Sheet>
  );
}
