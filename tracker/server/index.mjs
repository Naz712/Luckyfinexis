// The Finexis tracker assistant server. No dependencies, Node 22+.
//
//   GET  /              a hint for anyone who opens the address in a browser
//   GET  /health        what is configured (service and model name, never the key) and what the import holds
//   POST /ask           the assistant: conversation + tool definitions in → tool calls or the answer card out
//   GET  /me            the signed-in FA's production rows: their own, plus their team's for a manager
//   POST /admin/import  the month's CSV in; replaces the whole import
//   GET  /admin/links   every FA's individual link, as CSV (?fc=FC001 for one)
//
// The key comes from ./.env (gitignored) or the environment. Only the
// production import is written to disk (IMPORT_FILE, gitignored): a request
// body is gone when the response is sent, and the assistant's tools run in
// the app over the consultant's own records.
import http from "node:http";
import { fileURLToPath } from "node:url";
import { ApiError, ask, config, describe } from "./providers.mjs";
import { askSystem } from "./prompt.mjs";
import * as mock from "./mock.mjs";
import * as store from "./store.mjs";

try {
  process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch {
  // No .env: read the environment as is.
}

const PORT = Number(process.env.PORT) || 8787;
const MOCK = process.env.PACKS_MOCK === "1" || process.argv.includes("--mock");
const ACCESS_CODE = (process.env.ACCESS_CODE ?? "").trim();
const ADMIN_CODE = (process.env.ADMIN_CODE ?? "").trim();
const APP_URL = (process.env.APP_URL ?? "").trim() || "https://naz712.github.io/Luckyfinexis/";
const EXTRA_ORIGINS = (process.env.ALLOW_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const BODY_LIMIT = 8 * 1024 * 1024; // A year of the firm's CSV, or a conversation with its tool results; nothing bigger is ever sent.
const cfg = config();
const loaded = store.load();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function originAllowed(origin) {
  if (EXTRA_ORIGINS.includes(origin) || origin === "https://naz712.github.io") return true;
  try {
    const u = new URL(origin);
    const h = u.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
    if (u.protocol === "http:" && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+$/.test(h)) return true;
  } catch {}
  return false;
}

function sendText(res, status, text, type, extra = {}) {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Content-Length": Buffer.byteLength(text), ...extra });
  res.end(text);
}

function send(res, status, body, extra = {}) {
  sendText(res, status, JSON.stringify(body), "application/json", extra);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > BODY_LIMIT) return reject(new ApiError(413, "That is too much to send at once (8 MB limit)."));
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new ApiError(413, "That is too much to send at once (8 MB limit)."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (e) => reject(new ApiError(400, `Upload failed: ${e.message}`)));
  });
}

async function readJson(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "The request body is not JSON.");
  }
}

/** The CSV of an import: the body as is (text/csv, text/plain), or the "csv" field of a JSON body. */
async function readCsv(req) {
  const text = await readBody(req);
  if (!/application\/json/i.test(String(req.headers["content-type"] ?? ""))) return text;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "The request body is not JSON.");
  }
  if (typeof body?.csv !== "string") throw new ApiError(400, 'A JSON body must be {"csv": "...the file..."}.');
  return body.csv;
}

function requireAdmin(req) {
  if (!ADMIN_CODE) throw new ApiError(401, "Set ADMIN_CODE on the server before importing.");
  if (req.headers["x-admin-code"] !== ADMIN_CODE) throw new ApiError(401, "Wrong or missing admin code.");
}

/** The FA's individual link: the app's address with their fc and key. */
function linkFor(fc) {
  return `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}fc=${encodeURIComponent(fc)}&key=${store.keyFor(fc)}`;
}

async function askTurn(body) {
  const raw = Array.isArray(body.messages) ? body.messages : [];
  if (raw.length === 0 || raw.length > 40) throw new ApiError(400, "The conversation is empty or too long.");
  const messages = raw
    .filter((m) => m && ["user", "assistant", "tool"].includes(m.role))
    .map((m) => {
      const out = { role: m.role, content: typeof m.content === "string" ? m.content.slice(0, 20000) : null };
      if (m.role === "assistant" && Array.isArray(m.tool_calls)) out.tool_calls = m.tool_calls.map((t) => ({ id: String(t.id), type: "function", function: { name: String(t.function?.name ?? ""), arguments: String(t.function?.arguments ?? "{}") } }));
      if (m.role === "tool") out.tool_call_id = String(m.tool_call_id ?? "");
      return out;
    });
  const tools = Array.isArray(body.tools) ? body.tools.slice(0, 20) : [];
  const advisor = String(body.advisor?.name ?? "the consultant").slice(0, 80);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today)) ? String(body.today) : new Date().toISOString().slice(0, 10);
  const message = MOCK ? await mock.ask({ messages }) : await ask(cfg.report, { system: askSystem(advisor, today), messages, tools });
  return { message };
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const origin = req.headers.origin;
  const cors = {};
  if (origin) {
    if (!originAllowed(origin)) {
      send(res, 403, { error: "This origin is not allowed to call the server. Add it to ALLOW_ORIGINS." });
      return;
    }
    Object.assign(cors, {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Code, X-FC, X-Admin-Code",
      "Access-Control-Max-Age": "600",
    });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const ms = () => `${Date.now() - started} ms`;
  try {
    if (req.method === "GET" && path === "/") {
      send(res, 200, { ok: true, this_is: "the Finexis tracker assistant server", next: "Open the app (npm run dev, http://localhost:5173), tap the speech bubble, then Connect, and enter this address there." }, cors);
      return;
    }
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true, mock: MOCK, report: MOCK ? "mock" : describe(cfg.report), access_code: ACCESS_CODE !== "", import: store.summary() }, cors);
      return;
    }
    if (req.method === "GET" && path === "/me") {
      // The link's key is the credential: "<fc_code>:<key>", not the access code.
      const [fc = "", key = ""] = String(req.headers["x-fc"] ?? "").split(":");
      const code = fc.trim().toUpperCase();
      if (!code || !store.verify(code, key.trim())) throw new ApiError(401, "Your link is not valid. Ask the admin for a new one.");
      const rows = store.rowsFor(code);
      if (rows.length === 0) throw new ApiError(404, `No production rows for ${code} yet.`);
      const me = store.advisers().find((a) => a.fc_code === code);
      send(res, 200, { fc_code: code, name: me?.name ?? code, rows, as_of: store.asOf(rows) }, cors);
      log(`GET /me → 200 · ${code} · ${rows.length} rows · ${ms()}`);
      return;
    }
    if (req.method === "POST" && path === "/admin/import") {
      requireAdmin(req);
      const result = store.replace(await readCsv(req));
      if (result.errors.length > 0) {
        // Nothing was replaced. The reply lists every bad line; the terminal only gets the count.
        send(res, 400, { error: `The file has ${result.errors.length} problem${result.errors.length === 1 ? "" : "s"}; nothing was imported.`, errors: result.errors }, cors);
        log(`POST /admin/import → 400 · ${result.errors.length} problem(s) · ${ms()}`);
        return;
      }
      send(res, 200, { ok: true, ...result }, cors);
      log(`POST /admin/import → 200 · ${result.rows} rows · ${result.advisers} advisers · as of ${result.as_of} · ${ms()}`);
      return;
    }
    if (req.method === "GET" && path === "/admin/links") {
      requireAdmin(req);
      const only = (url.searchParams.get("fc") ?? "").trim().toUpperCase();
      const list = store.advisers().filter((a) => !only || a.fc_code === only);
      if (only && list.length === 0) throw new ApiError(404, `No production rows for ${only} yet.`);
      const csv = ["fc_code,name,link", ...list.map((a) => [a.fc_code, a.name, linkFor(a.fc_code)].map(store.csvCell).join(","))].join("\n") + "\n";
      sendText(res, 200, csv, "text/csv", cors);
      log(`GET /admin/links → 200 · ${list.length} link${list.length === 1 ? "" : "s"} · ${ms()}`);
      return;
    }
    if (req.method !== "POST" || path !== "/ask") throw new ApiError(404, "Not found.");
    if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) throw new ApiError(401, "Wrong or missing access code.");
    const body = await readJson(req);
    const result = await askTurn(body);
    send(res, 200, result, cors);
    log(`${req.method} ${path} → 200 · ${ms()}`);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    const message = e instanceof ApiError ? e.message : "Server error. See the server's terminal.";
    if (!(e instanceof ApiError)) console.error(e);
    send(res, status, { error: message }, cors);
    log(`${req.method} ${path} → ${status} · ${ms()} · ${message}`);
  }
});

server.listen(PORT, () => {
  log(`Assistant API on http://localhost:${PORT}${MOCK ? " (mock mode: canned answers, no key used)" : ""}`);
  if (!MOCK) {
    log(`  model: ${describe(cfg.report) ?? "not configured (set OPENAI_API_KEY in .env)"}`);
    log(`  access code: ${ACCESS_CODE ? "required" : "none (fine on your own Wi-Fi; set one before opening a tunnel)"}`);
  }
  for (const problem of loaded.errors) log(`  ${loaded.file}: ${problem}`);
  log(`  import: ${loaded.rows} rows · ${loaded.advisers} advisers · as of ${loaded.as_of ?? "—"} · ${loaded.source === "file" ? loaded.file : "the sample file (upload the real one with npm run import)"}`);
  log(`  admin code: ${ADMIN_CODE ? "set" : "none (set ADMIN_CODE to upload the CSV and list the links)"}`);
  if (store.secretIsDefault()) log("  WARNING: LINK_SECRET and ACCESS_CODE are both unset, so the individual links use the built-in secret and anyone who knows it can forge one. Set LINK_SECRET.");
});
