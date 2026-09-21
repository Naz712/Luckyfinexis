// The one outside call: the assistant's model turn (OpenAI by default; a
// Claude config is accepted so it can be wired in later). Plain fetch, no
// SDKs. The key is read from the config once and only ever goes into request
// headers.
import { ANSWER_SCHEMA } from "./schema.mjs";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const OPENAI_BASE = "https://api.openai.com/v1";
const trim = (s) => (s ?? "").trim();
const stripSlash = (u) => u.replace(/\/+$/, "");

/** Reads the environment into the model config. Never returns a key to a caller that prints. */
export function config(env = process.env) {
  const openaiKey = trim(env.OPENAI_API_KEY);
  const provider = trim(env.REPORT_PROVIDER).toLowerCase() === "claude" ? "claude" : "openai";
  const report =
    provider === "claude"
      ? trim(env.ANTHROPIC_API_KEY)
        ? { provider, service: "Claude", key: trim(env.ANTHROPIC_API_KEY), model: trim(env.CLAUDE_MODEL) || "claude-opus-5" }
        : null
      : openaiKey
        ? { provider, service: "OpenAI", key: openaiKey, model: trim(env.OPENAI_MODEL) || "gpt-4.1", base: stripSlash(trim(env.OPENAI_BASE_URL) || OPENAI_BASE) }
        : null;
  return { report };
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

function parseJson(text, service) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(502, `${service} did not return valid JSON.`);
  }
}

/** One model turn of the assistant: the conversation so far plus the app's tool definitions; back comes either tool calls (the app runs them) or the answer card as JSON. OpenAI only for now. */
export async function ask(cfg, { system, messages, tools }) {
  if (!cfg) throw new ApiError(400, "No model key is set on the server (OPENAI_API_KEY in .env).");
  if (cfg.provider !== "openai") throw new ApiError(400, "Ask needs OpenAI as the provider for now (REPORT_PROVIDER=openai).");
  const body = await post(
    `${cfg.base}/chat/completions`,
    {
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: system }, ...messages],
        tools,
        tool_choice: "auto",
        parallel_tool_calls: true,
        response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: ANSWER_SCHEMA } },
      }),
    },
    "OpenAI",
  );
  const json = parseJson(body, "OpenAI");
  const choice = json.choices?.[0];
  if (!choice?.message) throw new ApiError(502, "OpenAI returned no answer.");
  if (choice.message.refusal) throw new ApiError(502, `The model declined: ${choice.message.refusal}`);
  const m = choice.message;
  const message = { role: "assistant", content: typeof m.content === "string" ? m.content : null };
  if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
    message.tool_calls = m.tool_calls.map((t) => ({ id: String(t.id), type: "function", function: { name: String(t.function?.name ?? ""), arguments: String(t.function?.arguments ?? "{}") } }));
  }
  return message;
}
