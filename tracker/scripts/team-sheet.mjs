// Turns the firm's team sheet (a CSV, one row per adviser: name, email,
// password, up to two manager emails, banding and the year-to-date figures)
// into src/private/team.local.json, which the app signs people in against.
// Passwords are stored only as SHA-256 hashes of "email:password". The sheet
// and the JSON are confidential and stay out of the repo.
//
//   node scripts/team-sheet.mjs path/to/sheet.csv [as-of date, YYYY-MM-DD]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [, , file, asOfArg] = process.argv;
if (!file) {
  console.error("Usage: node scripts/team-sheet.mjs path/to/sheet.csv [YYYY-MM-DD]");
  process.exit(1);
}
const today = new Date();
const as_of = asOfArg ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

/** Quoted fields and doubled quotes, CRLF or LF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const table = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
const col = (name) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`The sheet has no "${name}" column.`);
  return i;
};
const C = {
  name: col("fc name"),
  email: col("fc email"),
  password: col("password"),
  m1: col("manager email 1"),
  m2: col("manager email 2"),
  banding: col("fc banding"),
  mdrtComm: col("mdrt progress (comm)"),
  mdrtPrem: col("mdrt progress (premium)"),
  elite: col("elite progress"),
  fyc: col("fyc"),
  wape: col("wape"),
  gr: col("gr"),
  eliteFy: col("elite fy?"),
};
const num = (v) => {
  const n = Number(String(v ?? "").replace(/[S$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** "65%", "65" or "0.65" as "65%". */
const band = (v) => {
  const t = String(v ?? "").trim().replace(/%$/, "");
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Banding "${v}" is not a percentage.`);
  return `${n < 1 ? Math.round(n * 1000) / 10 : n}%`;
};

const members = table.slice(1).map((r) => {
  const email = r[C.email].trim().toLowerCase();
  if (!email) throw new Error("A row has no FC email.");
  return {
    email,
    name: r[C.name].trim(),
    password_sha256: createHash("sha256").update(`${email}:${r[C.password] ?? ""}`).digest("hex"),
    managers: [r[C.m1], r[C.m2]].map((m) => (m ?? "").trim().toLowerCase()).filter((m) => m && m !== email),
    banding: band(r[C.banding]),
    mdrt_commission: num(r[C.mdrtComm]),
    mdrt_premium: num(r[C.mdrtPrem]),
    elite: num(r[C.elite]),
    fyc: num(r[C.fyc]),
    wape: num(r[C.wape]),
    gr: num(r[C.gr]),
    elite_first_year: /^y/i.test((r[C.eliteFy] ?? "").trim()),
  };
});

const out = new URL("../src/private/team.local.json", import.meta.url);
writeFileSync(out, JSON.stringify({ as_of, members }, null, 2) + "\n");
console.log(`wrote src/private/team.local.json: ${members.length} advisers, as of ${as_of}`);
