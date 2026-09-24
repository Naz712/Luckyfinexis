// finexis Elite: the firm's own MDRT-style scheme, with a trip as the prize.
// Credits are first-year gross revenue (FYGR), counted afresh each
// qualifying year and tracked apart from MDRT. New FCs qualify at lower
// tiers, and the tiers show one at a time: the next one appears once the
// one before it is reached. The rules come from the policy
// catalogue: the real scheme is in the confidential file, and the public
// build carries made-up sample tiers.
import { CATALOGUE } from "./policies";
import type { Advisor } from "../mock/data";

export const ELITE = CATALOGUE.elite;

export interface EliteTier {
  code: string;
  name: string;
  /** Credits needed in the qualifying year, for this FC. */
  credits: number;
  perk?: string;
}

/** Whether the FC counts as new for Elite: RNF in or after the scheme's cut-off year. */
export function isNewFc(advisor: Pick<Advisor, "rnf_year">): boolean {
  return advisor.rnf_year !== null && advisor.rnf_year >= ELITE.new_fc_from_rnf_year;
}

/** The tiers that apply to this FC, lowest first: the new-FC figures when they are new. */
export function eliteTiersFor(advisor: Pick<Advisor, "rnf_year">): EliteTier[] {
  const fresh = isNewFc(advisor);
  return ELITE.tiers.map((t) => ({ code: t.code, name: t.name, credits: fresh ? (t.new_fc_credits ?? t.credits) : t.credits, perk: t.perk }));
}

/** The tiers to show, one at a time: those already reached, then the next one. Higher tiers stay hidden until the one before is reached. */
export function tiersInView(tiers: EliteTier[], achieved: number): EliteTier[] {
  const next = tiers.findIndex((t) => t.credits > achieved);
  return next === -1 ? tiers : tiers.slice(0, next + 1);
}

/** "2 Jan to 31 Dec 2026". */
export function elitePeriodText(): string {
  const fmt = (iso: string, year: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m ?? 1) - 1];
    return `${d} ${month}${year ? ` ${y}` : ""}`;
  };
  return `${fmt(ELITE.period[0], false)} to ${fmt(ELITE.period[1], true)}`;
}
