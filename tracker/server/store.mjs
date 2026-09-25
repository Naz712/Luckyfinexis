// The firm's monthly production import: the CSV parser (the same rules as
// the app's src/lib/importer.ts, so both sides agree on the columns), the
// rows held in memory and kept in IMPORT_FILE between restarts, and the
// per-FA keys that make each consultant's individual link.
//
// Nothing here reads the environment until load() or the first key is
// asked for, so the ./.env that index.mjs loads is honoured.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FILE = path.join(HERE, "..", "public", "sample-import.csv");
const DEFAULT_FILE = "./data/production.csv"; // relative to this folder; data/ is gitignored
const DEFAULT_SECRET = "sample-secret";

/** The columns, in the order the sample file has them. Only the first five and the three headline figures are required. */
export const IMPORT_COLUMNS = [
  "fc_code",
  "name",
  "banding",
  "manager_fc_code",
  "manager_fc_code_2",
  "as_of",
  "commission_ytd",
  "gr_ytd",
  "premium_ytd",
  "wape_ytd",
  "mdrt_commission_ytd",
  "mdrt_commission_risk_ytd",
  "mdrt_premium_ytd",
  "mdrt_premium_risk_ytd",
  "pending_commission",
  "pending_premium",
  "elite_credits_ytd",
  "rnf_date",
];
const REQUIRED = ["fc_code", "name", "banding", "as_of", "commission_ytd", "premium_ytd", "elite_credits_ytd"];
const BANDS = ["B1", "B2", "B3", "B4", "B5"];
/** A band from the table, or a percentage banding ("65%"). */
const isBand = (b) => BANDS.includes(b) || /^\d+(\.\d+)?%$/.test(b);

// ── Parsing ──

/** RFC-4180-ish CSV: quoted fields, doubled quotes, CRLF or LF. Returns rows of cells. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** "S$ 1,234.50" → 1234.5; an empty cell is 0; anything else is null. */
const num = (s) => {
  const t = (s ?? "").replace(/[S$,\s]/g, "");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Parses the firm's CSV into import rows: { rows, errors }. Header names are
 * matched case-insensitively and a UTF-8 BOM is tolerated; missing optional
 * columns default sensibly (MDRT credit = the headline figure, all of it
 * Risk-Protection, nothing pending). Each bad line is one human-readable
 * error with its line number; the lines that parsed are still returned.
 */
export function parseImportCsv(text) {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length === 0) return { rows: [], errors: ["The file is empty."] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const missing = REQUIRED.filter((c) => col(c) === -1);
  if (missing.length > 0) return { rows: [], errors: [`Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`] };
  const rows = [];
  const errors = [];
  const cell = (r, name) => {
    const i = col(name);
    return i === -1 ? undefined : (r[i] ?? "").trim();
  };
  table.slice(1).forEach((r, n) => {
    const line = n + 2;
    const fc = (cell(r, "fc_code") ?? "").toUpperCase();
    const banding = (cell(r, "banding") ?? "").toUpperCase();
    const as_of = cell(r, "as_of") ?? "";
    if (!fc) return errors.push(`Line ${line}: no fc_code.`);
    if (!isBand(banding)) return errors.push(`Line ${line}: banding "${cell(r, "banding")}" is not one of ${BANDS.join(", ")} or a percentage like 65%.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(as_of)) return errors.push(`Line ${line}: as_of "${as_of}" is not a date like 2026-08-31.`);
    const commission = num(cell(r, "commission_ytd"));
    const premium = num(cell(r, "premium_ytd"));
    const elite = num(cell(r, "elite_credits_ytd"));
    if (commission === null || premium === null || elite === null) return errors.push(`Line ${line}: a figure is not a number.`);
    const opt = (name, dflt) => {
      const v = cell(r, name);
      if (v === undefined || v === "") return dflt;
      const x = num(v);
      return x === null ? dflt : x;
    };
    const optional = (name) => {
      const v = cell(r, name);
      return v === undefined || v === "" ? null : num(v);
    };
    const gr = optional("gr_ytd");
    const wape = optional("wape_ytd");
    const mc = opt("mdrt_commission_ytd", commission);
    const mp = opt("mdrt_premium_ytd", premium);
    rows.push({
      fc_code: fc,
      name: cell(r, "name") || fc,
      banding,
      manager_fc_code: (cell(r, "manager_fc_code") ?? "").toUpperCase(),
      ...(cell(r, "manager_fc_code_2") ? { manager_fc_code_2: cell(r, "manager_fc_code_2").toUpperCase() } : {}),
      as_of,
      commission_ytd: commission,
      ...(gr === null ? {} : { gr_ytd: gr }),
      premium_ytd: premium,
      ...(wape === null ? {} : { wape_ytd: wape }),
      mdrt_commission_ytd: mc,
      mdrt_commission_risk_ytd: Math.min(opt("mdrt_commission_risk_ytd", mc), mc),
      mdrt_premium_ytd: mp,
      mdrt_premium_risk_ytd: Math.min(opt("mdrt_premium_risk_ytd", mp), mp),
      pending_commission: opt("pending_commission", 0),
      pending_premium: opt("pending_premium", 0),
      elite_credits_ytd: elite,
      rnf_date: cell(r, "rnf_date") ?? "",
    });
  });
  return { rows, errors };
}

/** A CSV cell: quoted only when it has to be. */
export const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The rows as a CSV file with the standard columns: what IMPORT_FILE holds. */
export function toImportCsv(rows) {
  return [IMPORT_COLUMNS.join(","), ...rows.map((r) => IMPORT_COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
}

// ── The store ──

let held = []; // every row of the current import
let source = "sample"; // "sample" | "file" | "upload"

const trim = (s) => (s ?? "").trim();
const importFile = () => path.resolve(HERE, trim(process.env.IMPORT_FILE) || DEFAULT_FILE);

/** The latest as_of across some rows, for "as of" notes; null when there are none. */
export const asOf = (rows) => rows.reduce((m, r) => (m === null || r.as_of > m ? r.as_of : m), null);

/**
 * Reads IMPORT_FILE, or the sample when there is none yet. Returns what was
 * loaded for the startup log: the file looked for, the summary, and any
 * problems with the file (in which case the sample is served instead).
 */
export function load() {
  const file = importFile();
  const problems = [];
  if (fs.existsSync(file)) {
    const parsed = parseImportCsv(fs.readFileSync(file, "utf8"));
    if (parsed.errors.length === 0 && parsed.rows.length > 0) {
      held = parsed.rows;
      source = "file";
      return { file, ...summary(), errors: [] };
    }
    problems.push(...(parsed.errors.length ? parsed.errors : ["The file has no rows under the header."]));
  }
  try {
    held = parseImportCsv(fs.readFileSync(SAMPLE_FILE, "utf8")).rows;
  } catch (e) {
    held = [];
    problems.push(`Could not read the sample ${SAMPLE_FILE}: ${e.message}`);
  }
  source = "sample";
  return { file, ...summary(), errors: problems };
}

/**
 * Replaces the whole import with the CSV's rows and writes them to
 * IMPORT_FILE. A file with any bad line is rejected as a whole and the
 * previous rows stay: the reply then carries the errors and what is still held.
 */
export function replace(csvText) {
  const parsed = parseImportCsv(String(csvText ?? ""));
  if (parsed.errors.length === 0 && parsed.rows.length === 0) parsed.errors.push("The file has no rows under the header.");
  if (parsed.errors.length > 0) return { ...summary(), errors: parsed.errors };
  held = parsed.rows;
  source = "upload";
  const file = importFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, toImportCsv(held));
  } catch (e) {
    // The rows are served from memory either way; the next restart loads whatever is on disk.
    console.error(`  Could not write ${file}: ${e.message}`);
  }
  return { ...summary(), errors: [] };
}

/** The FA's own rows plus, for a manager, their team's: all one consultant is ever sent. */
export function rowsFor(fcCode) {
  const fc = trim(fcCode).toUpperCase();
  const mine = held.filter((r) => r.fc_code === fc);
  if (mine.length === 0) return [];
  const reports = new Set(held.filter((r) => r.manager_fc_code === fc || r.manager_fc_code_2 === fc).map((r) => r.fc_code));
  return held.filter((r) => r.fc_code === fc || reports.has(r.fc_code));
}

/** What /health may say: how much is held and where it came from, never a row. */
export function summary() {
  return { advisers: new Set(held.map((r) => r.fc_code)).size, rows: held.length, as_of: asOf(held), source };
}

/** One entry per FA from their latest row, sorted by fc_code. */
export function advisers() {
  const latest = new Map();
  for (const r of held) {
    const cur = latest.get(r.fc_code);
    if (!cur || r.as_of > cur.as_of) latest.set(r.fc_code, r);
  }
  return [...latest.values()].sort((a, b) => a.fc_code.localeCompare(b.fc_code)).map((r) => ({ fc_code: r.fc_code, name: r.name, manager_fc_code: r.manager_fc_code }));
}

// ── The per-FA keys ──

const secret = () => trim(process.env.LINK_SECRET) || trim(process.env.ACCESS_CODE) || DEFAULT_SECRET;

/** Whether the keys come from the built-in secret: anyone who reads the code can then forge a link. */
export function secretIsDefault() {
  return secret() === DEFAULT_SECRET;
}

/** The key in an FA's link: the first 12 hex characters of HMAC-SHA256(fc_code, secret). */
export function keyFor(fcCode) {
  return crypto.createHmac("sha256", secret()).update(trim(fcCode).toUpperCase()).digest("hex").slice(0, 12);
}

/** Whether a link's key is the FA's, compared in constant time. */
export function verify(fcCode, key) {
  const expected = Buffer.from(keyFor(fcCode));
  const given = Buffer.from(String(key ?? ""));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
