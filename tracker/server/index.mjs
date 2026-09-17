// Meeting Pack pipeline server. Three routes, no dependencies, Node 22+.
//
//   GET  /health        what is configured (service and model names, never keys)
//   POST /packs/make    inputs in → transcript (recording dropped) → report + numbers out
//   POST /packs/rework  report + card notes in → revised cards out
//
// Keys come from ./.env (gitignored) or the environment. Nothing is written
// to disk: the recap audio lives in this process only until it is
// transcribed, and the request body is gone when the response is sent.
import http from "node:http";
import { fileURLToPath } from "node:url";
import { ApiError, compose, config, describe, rework, transcribe } from "./providers.mjs";
import * as mock from "./mock.mjs";

try {
  process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch {
  // No .env: read the environment as is.
}

const PORT = Number(process.env.PORT) || 8787;
const MOCK = process.env.PACKS_MOCK === "1" || process.argv.includes("--mock");
const ACCESS_CODE = (process.env.ACCESS_CODE ?? "").trim();
const EXTRA_ORIGINS = (process.env.ALLOW_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const BODY_LIMIT = 64 * 1024 * 1024;
const KINDS = new Set(["recap", "photo", "document", "typed"]);
const MAX_BYTES = { recap: 25 * 1024 * 1024, photo: 20 * 1024 * 1024, document: 32 * 1024 * 1024 };
const cfg = config();

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

function send(res, status, body, extra = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json), ...extra });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > BODY_LIMIT) return reject(new ApiError(413, "That is too much to send at once (64 MB limit). Try a smaller photo or PDF."));
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new ApiError(413, "That is too much to send at once (64 MB limit)."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new ApiError(400, "The request body is not JSON."));
      }
    });
    req.on("error", (e) => reject(new ApiError(400, `Upload failed: ${e.message}`)));
  });
}

/** Counts the page objects in a PDF; 1 when nothing is found. Good enough for the detail line. */
function countPages(buf) {
  const n = (buf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  return n || 1;
}

const hhmm = () => new Date().toTimeString().slice(0, 5);

/** Validates and decodes the inputs; base64 becomes a Buffer, text stays text. */
function decodeInputs(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new ApiError(400, "Drop in at least one thing first.");
  if (raw.length > 8) throw new ApiError(400, "At most eight inputs per pack.");
  return raw.map((i, n) => {
    if (!i || !KINDS.has(i.kind)) throw new ApiError(400, `Input ${n + 1} has an unknown kind.`);
    const input = { id: String(i.id ?? `in_${n + 1}`), kind: i.kind, filename: typeof i.filename === "string" ? i.filename.slice(0, 120) : undefined, duration_sec: Number(i.duration_sec) || undefined };
    if (i.kind === "typed") {
      input.text = String(i.text ?? "").trim();
      if (!input.text) throw new ApiError(400, "The typed lines are empty.");
      return input;
    }
    if (typeof i.data !== "string" || !i.data) throw new ApiError(400, `Input ${n + 1} (${i.kind}) has no file.`);
    input.media_type = String(i.media_type ?? "application/octet-stream").split(";")[0].trim();
    input.data = Buffer.from(i.data, "base64");
    input.bytes = input.data.length;
    if (input.bytes > MAX_BYTES[i.kind]) throw new ApiError(413, `The ${i.kind} is too large (${Math.round(input.bytes / 1048576)} MB).`);
    if (i.kind === "document" && input.media_type === "application/pdf") input.pages = countPages(input.data);
    return input;
  });
}

async function makePack(body) {
  const inputs = decodeInputs(body.inputs);
  const client = { name: String(body.client?.name ?? "the client").slice(0, 80), since: body.client?.since ? String(body.client.since).slice(0, 10) : "" };
  const advisor = { name: String(body.advisor?.name ?? "the consultant").slice(0, 80) };
  const met_on = /^\d{4}-\d{2}-\d{2}$/.test(String(body.met_on)) ? String(body.met_on) : new Date().toISOString().slice(0, 10);
  const products = (Array.isArray(body.products) ? body.products : []).slice(0, 40).map((p) => ({ id: String(p.id), name: String(p.name).slice(0, 60) }));
  if (MOCK) return mock.make({ client, inputs });

  const timings = {};
  let transcript = null;
  let recording_deleted_at = null;
  const recap = inputs.find((i) => i.kind === "recap");
  if (recap) {
    const t0 = Date.now();
    transcript = await transcribe(cfg.transcribe, { data: recap.data, media_type: recap.media_type, filename: recap.filename || "recap.webm" });
    recap.data = null; // The audio is not needed again and is not kept.
    recording_deleted_at = hhmm();
    recap.text = transcript;
    timings.transcribe_ms = Date.now() - t0;
    log(`  recap ${recap.duration_sec ?? "?"} s → ${transcript.length} chars in ${timings.transcribe_ms} ms, audio dropped`);
  }
  const t1 = Date.now();
  const { meeting, numbers, report } = await compose(cfg.report, { advisor, client, met_on, products }, inputs);
  timings.report_ms = Date.now() - t1;
  log(`  report by ${describe(cfg.report)} in ${timings.report_ms} ms · ${numbers.length} numbers`);
  const pages = Object.fromEntries(inputs.filter((i) => i.pages).map((i) => [i.id, i.pages]));
  return { meeting, recording_deleted_at, transcript, pages, timings, numbers, report };
}

async function reworkPack(body) {
  const report = body.report;
  const notes = body.notes;
  if (!report || typeof report !== "object") throw new ApiError(400, "No report to rework.");
  if (!notes || typeof notes !== "object" || Object.keys(notes).length === 0) throw new ApiError(400, "No notes to work from.");
  const clean = {};
  for (const [code, note] of Object.entries(notes)) if (typeof note === "string" && note.trim()) clean[code] = note.trim().slice(0, 600);
  if (Object.keys(clean).length === 0) throw new ApiError(400, "No notes to work from.");
  const { attachments, ...cards } = report;
  const out = MOCK ? await mock.rework({ report: cards, notes: clean }) : await rework(cfg.report, cards, clean);
  return { cards: out };
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
      "Access-Control-Allow-Headers": "Content-Type, X-Access-Code",
      "Access-Control-Max-Age": "600",
    });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  const path = (req.url ?? "/").split("?")[0];
  try {
    if (req.method === "GET" && path === "/") {
      send(res, 200, { ok: true, this_is: "the Meeting Pack server", next: "Open the app (npm run dev, http://localhost:5173), go to Packs → New pack → Connect, and enter this address there." }, cors);
      return;
    }
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { ok: true, mock: MOCK, transcribe: MOCK ? "mock" : describe(cfg.transcribe), report: MOCK ? "mock" : describe(cfg.report), access_code: ACCESS_CODE !== "" }, cors);
      return;
    }
    if (req.method !== "POST" || (path !== "/packs/make" && path !== "/packs/rework")) throw new ApiError(404, "Not found.");
    if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) throw new ApiError(401, "Wrong or missing access code.");
    const body = await readJson(req);
    const result = path === "/packs/make" ? await makePack(body) : await reworkPack(body);
    send(res, 200, result, cors);
    log(`${req.method} ${path} → 200 · ${Date.now() - started} ms`);
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    const message = e instanceof ApiError ? e.message : "Server error. See the server's terminal.";
    if (!(e instanceof ApiError)) console.error(e);
    send(res, status, { error: message }, cors);
    log(`${req.method} ${path} → ${status} · ${Date.now() - started} ms · ${message}`);
  }
});

server.listen(PORT, () => {
  log(`Meeting Pack API on http://localhost:${PORT}${MOCK ? " (mock mode: canned answers, no keys used)" : ""}`);
  if (!MOCK) {
    log(`  recap → text: ${describe(cfg.transcribe) ?? "not configured"}`);
    log(`  report: ${describe(cfg.report) ?? "not configured (set OPENAI_API_KEY in .env)"}`);
    log(`  access code: ${ACCESS_CODE ? "required" : "none (fine on your own Wi-Fi; set one before opening a tunnel)"}`);
  }
});
