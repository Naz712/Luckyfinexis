// Inline the Vite build into one HTML file that can be emailed or opened
// from a phone without a server. Run after `vite build`:
//   node scripts/single-file.mjs            → dist/finexis-tracker.html
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const assets = join(dist, "assets");
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(assets, f), "utf8")).join("\n");
const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(assets, f), "utf8")).join("\n");

// "</script" inside the bundle would end the inline tag early; escape it.
const safeJs = js.replace(/<\/script/gi, "<\\/script");

const body = `<title>Finexis Tracker</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<link rel="icon" href="data:," />
<style>${css}</style>
<div id="root"></div>
<script type="module">${safeJs}</script>`;

// Full standalone document (double-click to open).
writeFileSync(join(dist, "finexis-tracker.html"), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
// Body-only fragment for hosts that supply their own document skeleton.
writeFileSync(join(dist, "finexis-tracker.fragment.html"), body);
console.log(`wrote dist/finexis-tracker.html (${Math.round((body.length / 1024) * 10) / 10} KB)`);
