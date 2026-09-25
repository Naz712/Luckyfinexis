import { useState } from "react";
import { TODAY, type Advisor, type Case, type CaseRecord } from "../mock/data";
import { ELITE, isNewFc } from "../lib/elite";
import { mdrtSnapshot, metricSnapshot, parseISODate, type GoalSet, type MdrtSnapshot, type MetricSnapshot } from "../lib/calc";
import { bandLabel, CADENCE_PER, count, periodLabel, pct, sgd, shortDate } from "../lib/format";
import type { DataSource } from "../lib/api";
import { Card, Label } from "../components/ui";
import Home from "./Home";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;

interface Row {
  advisor: Advisor;
  commission: MetricSnapshot;
  elite: MetricSnapshot;
  mdrt: MdrtSnapshot;
}

/** "31 Aug 2026" from an ISO date. */
function longDay(iso: string): string {
  const d = parseISODate(iso);
  return `${shortDate(d)} ${d.getFullYear()}`;
}

/** The as-of line in the Monthly import card; null when the shell did not say where the rows came from. */
function importNote(source: DataSource | undefined): { text: string; tone: "muted" | "warn" } | null {
  if (!source) return null;
  switch (source.kind) {
    case "sample":
      return { text: "Showing the sample import, January to August 2026.", tone: "muted" };
    case "server":
      return { text: source.as_of ? `Latest import: ${longDay(source.as_of)}.` : "Latest import loaded from the server.", tone: "muted" };
    case "team":
      return { text: `Team sheet as of ${longDay(source.as_of)}.`, tone: "muted" };
    case "error":
      return { text: `${source.message} Showing the sample import instead.`, tone: "warn" };
  }
}

function OnTrackFlag({ snapshot }: { snapshot: MetricSnapshot }) {
  if (!snapshot.pace) return <span className="text-[11px] text-muted">No goal</span>;
  const ok = snapshot.pace.onTrack;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${ok ? "text-ok" : "text-warn"}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
      {ok ? "On track" : "Behind"}
    </span>
  );
}

export default function Team({
  manager,
  advisors,
  cases,
  goalSet,
  source,
  records = [],
  onSignOut,
}: {
  manager: Advisor;
  advisors: Advisor[];
  cases: Case[];
  goalSet: GoalSet;
  source?: DataSource;
  records?: CaseRecord[];
  /** Signed in from the team sheet: offers to sign out at the foot. */
  onSignOut?: () => void;
}) {
  const [viewing, setViewing] = useState<Advisor | null>(null);

  const rows: Row[] = advisors
    .filter((a) => a.manager_ids.includes(manager.id))
    .map((advisor) => ({
      advisor,
      commission: metricSnapshot(advisor.id, cases, "commission", TODAY, goalSet),
      elite: metricSnapshot(advisor.id, cases, "elite", TODAY, goalSet),
      mdrt: mdrtSnapshot(advisor.id, cases, TODAY, goalSet),
    }))
    .sort((a, b) => b.commission.achieved - a.commission.achieved);

  const teamCommission = rows.reduce((s, r) => s + r.commission.achieved, 0);
  const onTrack = rows.filter((r) => r.commission.pace?.onTrack).length;
  const qualified = rows.filter((r) => r.mdrt.routes.some((x) => x.tiers.reached !== null)).length;
  const periodOf = (r: Row) => periodLabel(r.commission.period);
  const period = rows[0]?.commission.period;
  const note = importNote(source);

  if (viewing) {
    return (
      <div>
        <div className="sticky top-[var(--header-h,61px)] z-[5] flex items-center justify-between border-b border-line bg-accent-soft px-4 py-2 text-[12px] text-accent">
          <button type="button" onClick={() => setViewing(null)} className="font-semibold">
            ‹ Back to team
          </button>
          <span>
            Viewing <span className="font-semibold">{viewing.name}</span> · read-only
          </span>
        </div>
        <Home advisor={viewing} cases={cases} goalSet={goalSet} records={records} />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <Card tone="accent">
        <div className="text-[13px] font-semibold">{manager.name}'s team</div>
        <div className="mt-2.5 flex items-baseline justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Team commission</div>
          {period && <div className="text-[11px] text-white/70">{periodLabel(period)}</div>}
        </div>
        <div className="tnum mt-1 text-[36px] font-semibold leading-none">{sgd(teamCommission)}</div>
        <dl className="tnum mt-3 grid grid-cols-3 gap-2 text-[12px] text-white/75">
          <div>
            <dt>FCs</dt>
            <dd className="text-[16px] font-semibold text-white">{rows.length}</dd>
          </div>
          <div>
            <dt>On track</dt>
            <dd className="text-[16px] font-semibold text-white">
              {onTrack}
              <span className="text-[12px] font-normal text-white/75">/{rows.length}</span>
            </dd>
          </div>
          <div>
            <dt>MDRT qualified</dt>
            <dd className="text-[16px] font-semibold text-white">{qualified}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-0">
        <div className="flex items-baseline justify-between px-4 pt-4">
          <Label>Your FCs</Label>

        </div>
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {rows.map(({ advisor, commission, elite, mdrt }) => {
            const route = mdrt.routes.find((r) => r.metric === mdrt.closer)!;
            return (
              <li key={advisor.id}>
                <button
                  type="button"
                  onClick={() => setViewing(advisor)}
                  aria-label={`Open ${advisor.name}'s dashboard`}
                  className="w-full px-4 py-3 text-left hover:bg-canvas focus:outline-none focus-visible:bg-accent-soft"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-ink">{advisor.name}</div>
                      <div className="truncate text-[11px] text-muted">
                        {advisor.fc_code} · <span className="font-semibold text-body">{bandLabel(advisor.banding_code)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 whitespace-nowrap">
                      <OnTrackFlag snapshot={commission} />
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">Commission · {periodOf({ advisor, commission, elite, mdrt })}</dt>
                      <dd className="tnum mt-0.5 text-[16px] font-semibold leading-none text-ink">{sgd(commission.achieved)}</dd>
                      <dd className="tnum mt-1 text-[11px] text-muted">
                        {commission.target === null
                          ? "no goal"
                          : `of ${sgd(commission.target)}${commission.cadence && commission.cadence !== "year" ? ` ${CADENCE_PER[commission.cadence]}` : ""}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {TIER_LABEL[mdrt.goalTier]} goal · {route.label.toLowerCase()}
                        {route.tiers.reached && (
                          <span className="ml-1 rounded bg-brand px-1 py-px text-[9px] font-semibold text-white">{TIER_LABEL[route.tiers.reached]}</span>
                        )}
                      </dt>
                      <dd className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas" aria-hidden="true">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${route.goalProgress * 100}%` }} />
                      </dd>
                      <dd className="tnum mt-1 text-[11px] text-muted">
                        {route.goalReached ? `${TIER_LABEL[mdrt.goalTier]} reached` : `${pct(route.goalProgress)} there · ${sgd(route.achieved)}`}
                      </dd>
                    </div>
                  </dl>
                  {/* The in-house scheme, tracked apart from MDRT; its rules are placeholders until the business supplies them. */}
                  <div className="tnum mt-2 text-[11px] text-muted">
                    Elite credits · {count(elite.achieved)}
                    {isNewFc(advisor) ? " · new FC" : ""}
                    {!ELITE.tiers_confirmed && " (sample tiers)"}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {note && note.tone === "warn" && <p className="tnum px-1 text-center text-[12px] leading-[1.5] text-warn">{note.text}</p>}
      {onSignOut && <SignedIn email={manager.fc_code} onSignOut={onSignOut} />}
    </div>
  );
}

/** "Signed in as … · Sign out", at the foot of a signed-in screen. */
export function SignedIn({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-center gap-2 px-5 pb-5 pt-1 text-[12px] text-muted">
      <span className="min-w-0 truncate">Signed in as {email}</span>
      <button type="button" onClick={onSignOut} className="shrink-0 font-bold text-accent hover:underline">
        Sign out
      </button>
    </div>
  );
}
