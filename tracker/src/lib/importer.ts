// The monthly production import: parsing the firm's CSV, and turning its
// year-to-date rows into the advisers and the monthly production entries the
// rest of the app reads. The backend does the parsing for real (the app
// receives rows as JSON); the same parser runs here for the sample file and
// for tests, so both sides agree on the columns.
import { bandings, type Advisor, type BandingCode, type Case, type ImportRow } from "../mock/data";
import { fcShare } from "./policies";

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
] as const;

const REQUIRED = ["fc_code", "name", "banding", "as_of", "commission_ytd", "premium_ytd", "elite_credits_ytd"] as const;
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** RFC-4180-ish CSV: quoted fields, doubled quotes, CRLF or LF. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
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

export interface ParsedImport {
  rows: ImportRow[];
  /** Human-readable problems, one per bad line; the rows that parsed are still returned. */
  errors: string[];
}

const BANDS = new Set<string>(bandings.map((b) => b.code));
/** A band from the table (B1 to B5), or a percentage banding ("65%"). */
const isBand = (b: string): b is BandingCode => BANDS.has(b) || /^\d+(\.\d+)?%$/.test(b);
const num = (s: string | undefined): number | null => {
  const t = (s ?? "").replace(/[S$,\s]/g, "");
  if (t === "") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Parses the firm's CSV into import rows. Header names are matched case-insensitively; missing optional columns default sensibly (MDRT credit = the headline figure, all of it Risk-Protection). */
export function parseImportCsv(text: string): ParsedImport {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length === 0) return { rows: [], errors: ["The file is empty."] };
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const missing = REQUIRED.filter((c) => col(c) === -1);
  if (missing.length > 0) return { rows: [], errors: [`Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`] };
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  const cell = (r: string[], name: string) => {
    const i = col(name);
    return i === -1 ? undefined : (r[i] ?? "").trim();
  };
  table.slice(1).forEach((r, n) => {
    const line = n + 2;
    const fc = (cell(r, "fc_code") ?? "").toUpperCase();
    const banding = (cell(r, "banding") ?? "").toUpperCase() as BandingCode;
    const as_of = cell(r, "as_of") ?? "";
    if (!fc) return errors.push(`Line ${line}: no fc_code.`);
    if (!isBand(banding)) return errors.push(`Line ${line}: banding "${cell(r, "banding")}" is not one of ${[...BANDS].join(", ")} or a percentage like 65%.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(as_of)) return errors.push(`Line ${line}: as_of "${as_of}" is not a date like 2026-08-31.`);
    const commission = num(cell(r, "commission_ytd"));
    const premium = num(cell(r, "premium_ytd"));
    const elite = num(cell(r, "elite_credits_ytd"));
    if (commission === null || premium === null || elite === null) return errors.push(`Line ${line}: a figure is not a number.`);
    const opt = (name: string, dflt: number) => {
      const v = cell(r, name);
      if (v === undefined || v === "") return dflt;
      const x = num(v);
      return x === null ? dflt : x;
    };
    const optional = (name: string) => {
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
      ...(cell(r, "manager_fc_code_2") ? { manager_fc_code_2: cell(r, "manager_fc_code_2")!.toUpperCase() } : {}),
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

/** The rows as a CSV file with the standard columns. */
export function toImportCsv(rows: ImportRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [IMPORT_COLUMNS.join(","), ...rows.map((r) => IMPORT_COLUMNS.map((c) => esc(r[c] ?? "")).join(","))].join("\n") + "\n";
}

/** The latest row per FA, sorted by fc_code. */
export function latestRows(rows: ImportRow[]): ImportRow[] {
  const latest = new Map<string, ImportRow>();
  for (const r of rows) {
    const cur = latest.get(r.fc_code);
    if (!cur || r.as_of > cur.as_of) latest.set(r.fc_code, r);
  }
  return [...latest.values()].sort((a, b) => a.fc_code.localeCompare(b.fc_code));
}

/** The year in an RNF date ("2025-03-03", "03/03/2025" or "2025"), or null. */
export function rnfYear(v: string | undefined): number | null {
  const m = /(19|20)\d{2}/.exec(v ?? "");
  return m ? Number(m[0]) : null;
}

/** The advisers the import describes: one per FA, from their latest row. The advisor id is the FC code. */
export function advisorsFromRows(rows: ImportRow[]): Advisor[] {
  const codes = new Set(rows.map((r) => r.fc_code));
  return latestRows(rows).map((r) => ({
    id: r.fc_code,
    name: r.name,
    fc_code: r.fc_code,
    banding_code: r.banding,
    rnf_year: rnfYear(r.rnf_date),
    manager_ids: [r.manager_fc_code, r.manager_fc_code_2 ?? ""].filter((m, i, all) => m !== "" && m !== r.fc_code && codes.has(m) && all.indexOf(m) === i),
  }));
}

/** "August 2026" */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_LONG[(m ?? 1) - 1]} ${y}`;
}

/** GR behind an amount of commission at a band, by the payout formula run backwards. */
export function grFromCommission(commission: number, band: BandingCode): number {
  const share = fcShare(band);
  return share > 0 ? commission / share : 0;
}

/** First-year GR, year to date: the import's figure, else worked out from commission at the row's band. */
const grOf = (r: ImportRow) => r.gr_ytd ?? grFromCommission(r.commission_ytd, r.banding);

/**
 * Monthly production entries from year-to-date rows: each month is the
 * difference from the month before, split into a Risk-Protection entry
 * (which also carries the month's headline commission, premium and Elite
 * credits) and an Other Products entry (its share of the MDRT credits). The
 * latest month's pending figures become one pending entry. Everything
 * downstream (MDRT routes, goals, charts, the assistant) reads these.
 */
export function entriesFromRows(rows: ImportRow[]): Case[] {
  const byFc = new Map<string, ImportRow[]>();
  for (const r of rows) (byFc.get(r.fc_code) ?? byFc.set(r.fc_code, []).get(r.fc_code)!).push(r);
  const out: Case[] = [];
  for (const [fc, list] of byFc) {
    const sorted = list.slice().sort((a, b) => (a.as_of < b.as_of ? -1 : 1));
    let prev: ImportRow | null = null;
    for (const r of sorted) {
      // A new year starts the year-to-date figures again.
      const base = prev && prev.as_of.slice(0, 4) === r.as_of.slice(0, 4) ? prev : null;
      const d = (k: keyof ImportRow) => (r[k] as number) - (base ? (base[k] as number) : 0);
      const dGr = grOf(r) - (base ? grOf(base) : 0);
      const label = monthLabel(r.as_of);
      const common = {
        advisor_id: fc,
        client_name: "Imported production",
        premium_term_years: 1,
        banding_code_at_time: r.banding,
        source: "import" as const,
        submitted_on: r.as_of,
        confirmed_on: r.as_of,
        label,
        ...(r.gr_ytd === undefined ? { gr_estimated: true } : {}),
      };
      const riskC = d("mdrt_commission_risk_ytd");
      const riskP = d("mdrt_premium_risk_ytd");
      const otherC = d("mdrt_commission_ytd") - riskC;
      const otherP = d("mdrt_premium_ytd") - riskP;
      out.push({
        ...common,
        id: `${fc}_${r.as_of}_risk`,
        product_id: "import_risk",
        premium_amount: d("premium_ytd"),
        gross_revenue: 0,
        status: "confirmed",
        metrics: {
          commission: d("commission_ytd"),
          premium: d("premium_ytd"),
          mdrt_commission: riskC,
          mdrt_premium: riskP,
          elite: d("elite_credits_ytd"),
          gross_revenue: dGr,
          // WAPE only when the import carries it, so a Custom WAPE goal can say it isn't there yet.
          ...(r.wape_ytd === undefined ? {} : { wape: r.wape_ytd - (base?.wape_ytd ?? 0) }),
        },
      });
      if (otherC !== 0 || otherP !== 0) {
        out.push({
          ...common,
          id: `${fc}_${r.as_of}_other`,
          product_id: "import_other",
          premium_amount: 0,
          gross_revenue: 0,
          status: "confirmed",
          metrics: { commission: 0, premium: 0, mdrt_commission: otherC, mdrt_premium: otherP, elite: 0, gross_revenue: 0 },
        });
      }
      prev = r;
    }
    const last = sorted[sorted.length - 1];
    if (last && (last.pending_commission > 0 || last.pending_premium > 0)) {
      out.push({
        advisor_id: fc,
        client_name: "Waiting on the insurer",
        premium_term_years: 1,
        banding_code_at_time: last.banding,
        source: "import",
        submitted_on: last.as_of,
        confirmed_on: null,
        label: `Pending at ${monthLabel(last.as_of)}`,
        id: `${fc}_${last.as_of}_pending`,
        product_id: "import_risk",
        premium_amount: last.pending_premium,
        gross_revenue: 0,
        status: "pending",
        metrics: {
          commission: last.pending_commission,
          premium: last.pending_premium,
          mdrt_commission: last.pending_commission,
          mdrt_premium: last.pending_premium,
          elite: 0,
          gross_revenue: grFromCommission(last.pending_commission, last.banding),
        },
      });
    }
  }
  return out;
}

/** The FA's own rows plus, for a manager, their team's: what the server sends one signed-in user. */
export function rowsVisibleTo(rows: ImportRow[], fcCode: string): ImportRow[] {
  const mine = rows.filter((r) => r.fc_code === fcCode);
  if (mine.length === 0) return [];
  const reports = new Set(rows.filter((r) => r.manager_fc_code === fcCode || r.manager_fc_code_2 === fcCode).map((r) => r.fc_code));
  return rows.filter((r) => r.fc_code === fcCode || reports.has(r.fc_code));
}

/** The latest import date across the rows, for "as of" notes. */
export function asOf(rows: ImportRow[]): string | null {
  return rows.reduce<string | null>((m, r) => (m === null || r.as_of > m ? r.as_of : m), null);
}
