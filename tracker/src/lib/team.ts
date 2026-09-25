// The firm's team sheet, when src/private/team.local.json is present (made
// from the CSV by scripts/team-sheet.mjs): who can sign in, who their
// managers are (up to two, each of whom sees the adviser in their team), and
// each adviser's year-to-date figures. It becomes import rows, so the rest of
// the app reads it like the monthly import. Passwords are only ever SHA-256
// hashes of "email:password". The sheet is confidential and gitignored; the
// public build has no sign-in and shows the sample.
import type { BandingCode, ImportRow } from "../mock/data";

export interface TeamMember {
  email: string;
  name: string;
  password_sha256: string;
  /** Manager emails, first and second. */
  managers: string[];
  banding: BandingCode;
  mdrt_commission: number;
  mdrt_premium: number;
  elite: number;
  /** First-year commission, year to date. */
  fyc: number;
  wape: number;
  gr: number;
  /** "Elite FY?": in their first year, so Elite's new-FC tiers apply. */
  elite_first_year: boolean;
}

export interface TeamSheet {
  /** The date the figures are as of. */
  as_of: string;
  members: TeamMember[];
}

const files = import.meta.glob("../private/team.local.json", { eager: true, import: "default" }) as Record<string, TeamSheet>;
export const TEAM: TeamSheet | null = Object.values(files)[0] ?? null;

/**
 * The sheet as import rows: one row per adviser, keyed by email. The sheet
 * has no premium column, so premium is the MDRT premium credit; it doesn't
 * split Risk-Protection from Other Products, so all of it counts as
 * Risk-Protection; and it is one snapshot, so the year so far sits in one
 * month.
 */
export function teamRows(sheet: TeamSheet): ImportRow[] {
  return sheet.members.map((m) => ({
    fc_code: m.email,
    name: m.name,
    banding: m.banding,
    manager_fc_code: m.managers[0] ?? "",
    ...(m.managers[1] ? { manager_fc_code_2: m.managers[1] } : {}),
    as_of: sheet.as_of,
    commission_ytd: m.fyc,
    gr_ytd: m.gr,
    premium_ytd: m.mdrt_premium,
    wape_ytd: m.wape,
    mdrt_commission_ytd: m.mdrt_commission,
    mdrt_commission_risk_ytd: m.mdrt_commission,
    mdrt_premium_ytd: m.mdrt_premium,
    mdrt_premium_risk_ytd: m.mdrt_premium,
    pending_commission: 0,
    pending_premium: 0,
    elite_credits_ytd: m.elite,
    rnf_date: m.elite_first_year ? sheet.as_of.slice(0, 4) : "",
  }));
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The member whose email and password match, or null. */
export async function signIn(sheet: TeamSheet, email: string, password: string): Promise<TeamMember | null> {
  const e = email.trim().toLowerCase();
  const m = sheet.members.find((x) => x.email === e);
  if (!m) return null;
  return (await sha256(`${e}:${password}`)) === m.password_sha256 ? m : null;
}

const KEY = "finexis.team";

/** The signed-in email for this tab, kept across a reload. */
export function loadTeamUser(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveTeamUser(email: string | null): void {
  try {
    if (email) sessionStorage.setItem(KEY, email);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the sign-in lasts until the page closes.
  }
}
