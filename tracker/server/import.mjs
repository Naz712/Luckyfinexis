// The admin's helper: uploads the month's CSV to the server, or lists every
// FA's individual link. ADMIN_CODE comes from ./.env (gitignored) or the
// environment; the server defaults to this machine (http://localhost:PORT).
//
//   node import.mjs <file.csv> [server-url]     npm run import -- file.csv
//   node import.mjs --links [server-url]        npm run links
import fs from "node:fs";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch {
  // No .env: read the environment as is.
}

const args = process.argv.slice(2);
const links = args[0] === "--links";
const file = links ? null : args[0];
const server = (args[1] ?? `http://localhost:${Number(process.env.PORT) || 8787}`).replace(/\/+$/, "");
const ADMIN_CODE = (process.env.ADMIN_CODE ?? "").trim();

if (!links && !file) {
  console.error("Usage: node import.mjs <file.csv> [server-url]\n       node import.mjs --links [server-url]");
  process.exit(2);
}
if (!ADMIN_CODE) {
  console.error("Set ADMIN_CODE in .env (the same value the server has) first.");
  process.exit(1);
}

let res;
try {
  res = links
    ? await fetch(`${server}/admin/links`, { headers: { "X-Admin-Code": ADMIN_CODE } })
    : await fetch(`${server}/admin/import`, { method: "POST", headers: { "X-Admin-Code": ADMIN_CODE, "Content-Type": "text/csv; charset=utf-8" }, body: fs.readFileSync(file, "utf8") });
} catch (e) {
  console.error(`Could not reach ${server}: ${e?.cause?.message ?? e.message}`);
  process.exit(1);
}
const text = await res.text();
if (links && res.ok) {
  process.stdout.write(text);
} else {
  // The import's reply, or any error, is JSON: print it readably.
  try {
    const body = JSON.parse(text);
    console.log(JSON.stringify(body, null, 2));
  } catch {
    console.log(text);
  }
}
if (!res.ok) {
  console.error(`${server} replied ${res.status}.`);
  process.exit(1);
}
