// The two outside calls: speech-to-text for the recap (Valsea, or OpenAI as
// the fallback; both speak the OpenAI /audio/transcriptions shape) and the
// report model (OpenAI by default, Claude as an option). Plain fetch, no SDKs.
// Keys are read from the config once and only ever go into request headers.
import { REPORT_SYSTEM, REWORK_SYSTEM, inputCaption, reportIntro, reworkUser } from "./prompt.mjs";
import { REPORT_SCHEMA, REWORKABLE, REWORK_SCHEMA } from "./schema.mjs";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const OPENAI_BASE = "https://api.openai.com/v1";
const trim = (s) => (s ?? "").trim();
const stripSlash = (u) => u.replace(/\/+$/, "");

/** Words the recap is likely to contain, so the transcriber spells them right (OpenAI honours this field). */
const VOCAB = "Singapore financial planning recap: CPF, MediShield Life, Integrated Shield Plan, term plan, whole life, critical illness, TPD, ILP, endowment, sum assured, premium, S$, Singlife, Manulife, HSBC Life, Tokio Marine, FWD, Etiqa, Prudential, AIA, Great Eastern.";

/** VALSEA_EXTRA is JSON of extra form fields, e.g. {"diarize":"false"}; anything unparseable is ignored. */
function parseExtra(raw) {
  try {
    const v = JSON.parse(trim(raw) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Reads the environment into the two service configs. Never returns a key to a caller that prints. */
export function config(env = process.env) {
  const valseaKey = trim(env.VALSEA_API_KEY);
  const openaiKey = trim(env.OPENAI_API_KEY);
  const transcribe = valseaKey
    ? {
        service: "Valsea",
        key: valseaKey,
        url: trim(env.VALSEA_TRANSCRIBE_URL) || `${stripSlash(trim(env.VALSEA_BASE_URL) || "https://api.valsea.ai/v1")}/audio/transcriptions`,
        model: trim(env.VALSEA_MODEL),
        extra: parseExtra(env.VALSEA_EXTRA),
      }
    : openaiKey
      ? { service: "OpenAI", key: openaiKey, url: `${stripSlash(trim(env.OPENAI_BASE_URL) || OPENAI_BASE)}/audio/transcriptions`, model: trim(env.TRANSCRIBE_MODEL) || "gpt-4o-transcribe" }
      : null;
  const provider = trim(env.REPORT_PROVIDER).toLowerCase() === "claude" ? "claude" : "openai";
  const report =
    provider === "claude"
      ? trim(env.ANTHROPIC_API_KEY)
        ? { provider, service: "Claude", key: trim(env.ANTHROPIC_API_KEY), model: trim(env.CLAUDE_MODEL) || "claude-opus-5", fallbacks: trim(env.CLAUDE_FALLBACKS).toLowerCase() !== "off" }
        : null
      : openaiKey
        ? { provider, service: "OpenAI", key: openaiKey, model: trim(env.OPENAI_MODEL) || "gpt-4.1", base: stripSlash(trim(env.OPENAI_BASE_URL) || OPENAI_BASE) }
        : null;
  return { transcribe, report, language: trim(env.TRANSCRIBE_LANGUAGE) };
}

/** What /health may say about a service: its name and model, never its key. */
export function describe(service) {
  return service ? (service.model ? `${service.service} · ${service.model}` : service.service) : null;
}

/** The useful part of an error body: the service's message, else the first 200 characters. */
function errorText(body) {
  try {
    const j = JSON.parse(body);
    const m = j?.error?.message ?? j?.message ?? j?.error;
    if (typeof m === "string") return m.slice(0, 300);
  } catch {}
  return String(body).replace(/\s+/g, " ").slice(0, 200);
}

async function post(url, init, service) {
  let res;
  try {
    res = await fetch(url, { ...init, method: "POST", signal: AbortSignal.timeout(init.timeout ?? 300_000) });
  } catch (e) {
    throw new ApiError(502, `Could not reach ${service}: ${e?.cause?.message ?? e.message}`);
  }
  const body = await res.text();
  if (!res.ok) {
    // The full reply goes to the server's own terminal (it never contains our key); the app gets the short message.
    console.error(`  ${service} replied ${res.status}: ${String(body).replace(/\s+/g, " ").slice(0, 600)}`);
    throw new ApiError(502, `${service} replied ${res.status}: ${errorText(body)}`);
  }
  return body;
}

// ── Speech-to-text ──

export async function transcribe(cfg, { data, media_type, filename }, language) {
  if (!cfg) throw new ApiError(400, "No speech-to-text key is set on the server (VALSEA_API_KEY, or OPENAI_API_KEY as the fallback).");
  if (cfg.service === "OpenAI" && !cfg.model) throw new ApiError(400, "OpenAI needs a speech-to-text model name on the server (TRANSCRIBE_MODEL in .env).");
  // Only the fields each service documents: a strict validator rejects extras with "Invalid request body".
  const form = new FormData();
  form.append("file", new Blob([data], { type: media_type }), filename);
  if (cfg.model) form.append("model", cfg.model); // Valsea does not need one; OpenAI does.
  if (language) form.append("language", language);
  if (cfg.service === "OpenAI") {
    form.append("response_format", "json");
    form.append("prompt", VOCAB);
  }
  for (const [k, v] of Object.entries(cfg.extra ?? {})) form.append(k, String(v)); // VALSEA_EXTRA, for fields their docs ask for
  const body = await post(cfg.url, { headers: { Authorization: `Bearer ${cfg.key}` }, body: form, timeout: 240_000 }, `${cfg.service} speech-to-text`);
  let text;
  try {
    text = JSON.parse(body).text;
  } catch {
    text = body;
  }
  text = trim(text);
  if (!text) throw new ApiError(502, `${cfg.service} returned an empty transcript.`);
  return text;
}

// ── Report model ──

const dataUrl = (input) => `data:${input.media_type};base64,${input.data.toString("base64")}`;
const isPdf = (input) => input.media_type === "application/pdf";

function openaiParts(intro, inputs) {
  const parts = [{ type: "text", text: intro }];
  inputs.forEach((input, i) => {
    parts.push({ type: "text", text: inputCaption(input, i) });
    if (input.kind === "photo" || (input.kind === "document" && !isPdf(input))) parts.push({ type: "image_url", image_url: { url: dataUrl(input), detail: "high" } });
    else if (input.kind === "document") parts.push({ type: "file", file: { filename: input.filename || "notes.pdf", file_data: dataUrl(input) } });
  });
  return parts;
}

function claudeParts(intro, inputs) {
  const parts = [{ type: "text", text: intro }];
  inputs.forEach((input, i) => {
    parts.push({ type: "text", text: inputCaption(input, i) });
    if (input.kind === "photo" || (input.kind === "document" && !isPdf(input))) parts.push({ type: "image", source: { type: "base64", media_type: input.media_type, data: input.data.toString("base64") } });
    else if (input.kind === "document") parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.data.toString("base64") } });
  });
  return parts;
}

function parseJson(text, service) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, `${service} did not return valid JSON.`);
  }
}

async function openaiJson(cfg, system, parts, schema, name) {
  const body = await post(
    `${cfg.base}/chat/completions`,
    {
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: parts },
        ],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      }),
    },
    "OpenAI",
  );
  const json = parseJson(body, "OpenAI");
  const choice = json.choices?.[0];
  if (!choice) throw new ApiError(502, "OpenAI returned no answer.");
  if (choice.message?.refusal) throw new ApiError(502, `The model declined: ${choice.message.refusal}`);
  if (choice.finish_reason === "length") throw new ApiError(502, "The model's answer was cut off. Try fewer pages or a shorter recap.");
  const content = typeof choice.message?.content === "string" ? choice.message.content : (choice.message?.content ?? []).map((c) => c.text ?? "").join("");
  return parseJson(content, "OpenAI");
}

async function claudeJson(cfg, system, parts, schema) {
  const headers = { "x-api-key": cfg.key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" };
  const request = {
    model: cfg.model,
    max_tokens: 16000,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: parts }],
  };
  if (cfg.fallbacks) {
    // A policy decline re-runs on Anthropic's recommended fallback model inside the same call. CLAUDE_FALLBACKS=off turns it off.
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    request.fallbacks = "default";
  }
  const body = await post("https://api.anthropic.com/v1/messages", { headers, body: JSON.stringify(request) }, "Claude");
  const json = parseJson(body, "Claude");
  if (json.stop_reason === "refusal") throw new ApiError(502, "The model declined this request.");
  if (json.stop_reason === "max_tokens") throw new ApiError(502, "The model's answer was cut off. Try fewer pages or a shorter recap.");
  const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJson(text, "Claude");
}

/** Light shape check on what came back, so a surprise from the model is a clear error and not a blank screen. */
function assertReport(r) {
  const ok =
    r && typeof r === "object" && r.meeting && typeof r.summary?.text === "string" && Array.isArray(r.situation?.facts) && Array.isArray(r.cover?.rows) && Array.isArray(r.cashflow?.rows) && Array.isArray(r.options?.items) && Array.isArray(r.numbers);
  if (!ok) throw new ApiError(502, "The model returned an unexpected shape for the report.");
}

const mapOption = ({ product_id, annual_premium, term_years, ...item }) =>
  product_id && annual_premium != null && term_years != null ? { ...item, log: { product_id, premium: Math.round(annual_premium), term_years: Math.round(term_years) } } : item;

/** Turns one card from the model's shape into what the app renders: log details on options, no null qualifiers on cashflow rows. */
function mapCard(code, card) {
  if (code === "cashflow") return { ...card, rows: card.rows.map(({ sub, ...row }) => (sub ? { ...row, sub } : row)) };
  if (code === "options") return { ...card, items: card.items.map(mapOption) };
  return card;
}

export async function compose(cfg, meta, inputs) {
  if (!cfg) throw new ApiError(400, "No report key is set on the server (OPENAI_API_KEY in .env).");
  const intro = reportIntro(meta, inputs);
  const raw = cfg.provider === "claude" ? await claudeJson(cfg, REPORT_SYSTEM, claudeParts(intro, inputs), REPORT_SCHEMA) : await openaiJson(cfg, REPORT_SYSTEM, openaiParts(intro, inputs), REPORT_SCHEMA, "meeting_report");
  assertReport(raw);
  const { meeting, numbers, ...cards } = raw;
  const report = {};
  for (const code of Object.keys(cards)) report[code] = mapCard(code, cards[code]);
  return { meeting, numbers, report };
}

export async function rework(cfg, report, notes) {
  if (!cfg) throw new ApiError(400, "No report key is set on the server (OPENAI_API_KEY in .env).");
  const parts = [{ type: "text", text: reworkUser(report, notes) }];
  const raw = cfg.provider === "claude" ? await claudeJson(cfg, REWORK_SYSTEM, parts, REWORK_SCHEMA) : await openaiJson(cfg, REWORK_SYSTEM, parts, REWORK_SCHEMA, "rework");
  const cards = {};
  for (const code of REWORKABLE) if (notes[code] !== undefined && raw?.[code] && typeof raw[code] === "object") cards[code] = mapCard(code, raw[code]);
  if (Object.keys(cards).length === 0) throw new ApiError(502, "The model returned no revised cards.");
  return cards;
}
