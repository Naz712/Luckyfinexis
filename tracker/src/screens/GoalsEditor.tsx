import { useState } from "react";
import { MDRT_MEMBERSHIP_YEAR, MDRT_PRODUCTION_YEAR, MDRT_THRESHOLDS_CONFIRMED, metric_definitions, TODAY, type Advisor, type Case, type Goal, type GoalCadence, type MetricCode, type Tier } from "../mock/data";
import {
  UNTRACKED_METRICS,
  aggregate,
  goalFor,
  goalPeriod,
  mdrtSnapshot,
  mdrtTierGoalFor,
  thresholdFor,
  type GoalSet,
} from "../lib/calc";
import { CADENCE_PER, count, dateRange, pct, periodLabel, sgd } from "../lib/format";
import { Card, Label, MoneyInput, Segmented } from "../components/ui";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;
const CADENCE_OPTIONS: { value: GoalCadence; label: string }[] = [
  { value: "year", label: "Year" },
  { value: "half", label: "Half" },
  { value: "quarter", label: "Quarter" },
  { value: "month", label: "Month" },
];

interface Row {
  cadence: GoalCadence;
  value: string;
}

export default function GoalsEditor({
  advisor,
  cases,
  goalSet,
  onSave,
  onCancel,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  onSave: (targets: Goal[], tier: Tier) => void;
  onCancel: () => void;
}) {
  const year = TODAY.getFullYear();
  const editable = metric_definitions.filter((m) => m.code !== "mdrt_commission" && m.code !== "mdrt_premium");

  const [tier, setTier] = useState<Tier>(mdrtTierGoalFor(advisor.id, year, goalSet.mdrtTiers));
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const init: Record<string, Row> = {};
    for (const m of editable) {
      const g = goalFor(advisor.id, m.code, year, goalSet.targets);
      init[m.code] = { cadence: g?.cadence ?? "year", value: g ? String(g.target_value) : "" };
    }
    return init;
  });
  const setRow = (code: MetricCode, patch: Partial<Row>) => setRows((r) => ({ ...r, [code]: { ...r[code], ...patch } }));

  // Preview the MDRT card with the tier being chosen, without touching the saved set.
  const mdrt = mdrtSnapshot(advisor.id, cases, TODAY, {
    ...goalSet,
    mdrtTiers: [{ advisor_id: advisor.id, year, tier }],
  });
  const confirmed = cases.filter((c) => c.advisor_id === advisor.id && c.status === "confirmed");

  const save = () => {
    const targets: Goal[] = [];
    for (const m of editable) {
      const row = rows[m.code];
      const value = Number(row.value);
      if (Number.isFinite(value) && value > 0) {
        targets.push({ advisor_id: advisor.id, metric: m.code, year, cadence: row.cadence, target_value: value });
      }
    }
    onSave(targets, tier);
  };

  return (
    <div>
      <div className="sticky top-[61px] z-[5] flex items-center justify-between border-b border-line bg-accent-soft px-4 py-2 text-[12px] text-accent">
        <button type="button" onClick={onCancel} className="font-semibold">
          ‹ Cancel
        </button>
        <span>
          Goals for <span className="font-semibold">{year}</span>
        </span>
      </div>

      <div className="space-y-3 px-4 pb-6 pt-3">
        <Card>
          <Label>MDRT {MDRT_MEMBERSHIP_YEAR} aspiration</Label>
          <p className="mt-1 text-[12px] text-muted">
            Your {MDRT_PRODUCTION_YEAR} production counts toward {MDRT_MEMBERSHIP_YEAR} membership, so the {MDRT_MEMBERSHIP_YEAR} thresholds apply. Goals paces you
            toward the tier you pick here.
            {!MDRT_THRESHOLDS_CONFIRMED && ` Singapore figures still to be confirmed against the ${MDRT_MEMBERSHIP_YEAR} chart.`}
          </p>
          <div className="mt-2">
            <Segmented
              ariaLabel="MDRT tier"
              value={tier}
              onChange={setTier}
              options={(["mdrt", "cot", "tot"] as const).map((t) => ({ value: t, label: TIER_LABEL[t], hint: sgd(thresholdFor("mdrt_commission", t)) }))}
            />
          </div>
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {mdrt.routes.map((r) => (
              <li key={r.metric} className="flex items-baseline justify-between py-2 text-[12px]">
                <span className="text-muted">
                  {r.label} route needs <span className="tnum font-medium text-body">{sgd(r.goalThreshold)}</span>
                </span>
                <span className={`tnum font-medium ${r.goalReached ? "text-ok" : "text-body"}`}>
                  {r.goalReached ? "reached" : `${pct(r.goalProgress)} there`}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {editable.map((m) => {
          const row = rows[m.code];
          const period = goalPeriod(row.cadence, m.period_type, TODAY);
          const achieved = aggregate(confirmed, m.code, period.start, period.end);
          const tracked = !UNTRACKED_METRICS.has(m.code);
          const inputId = `goal-${m.code}`;
          return (
            <Card key={m.code}>
              <div className="flex items-baseline justify-between">
                <Label>{m.label}</Label>
                {!tracked && <span className="text-[11px] text-muted">not tracked yet</span>}
              </div>
              <div className="mt-2">
                <Segmented ariaLabel={`${m.label} goal cadence`} value={row.cadence} onChange={(c) => setRow(m.code, { cadence: c })} options={CADENCE_OPTIONS} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1">
                  {m.unit === "sgd" ? (
                    <MoneyInput id={inputId} value={row.value} onChange={(v) => setRow(m.code, { value: v })} placeholder="No goal" />
                  ) : (
                    <input
                      id={inputId}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={row.value}
                      placeholder="No goal"
                      onChange={(e) => setRow(m.code, { value: e.target.value })}
                      className="tnum w-full rounded-xl border border-line bg-white px-3.5 py-3 text-[17px] font-semibold text-ink placeholder:font-normal placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                  )}
                </div>
                <label htmlFor={inputId} className="shrink-0 text-[12px] text-muted">
                  {CADENCE_PER[row.cadence]}
                </label>
              </div>
              <p className="tnum mt-2 text-[11px] text-muted">
                Current window {periodLabel(period)} ({dateRange(period)})
                {tracked && (
                  <>
                    {" "}
                    · achieved so far <span className="font-medium text-body">{m.unit === "sgd" ? sgd(achieved) : count(achieved)}</span>
                  </>
                )}
              </p>
            </Card>
          );
        })}

        <button type="button" onClick={save} className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white hover:bg-ink">
          Save goals
        </button>
        <p className="px-1 text-center text-[11px] text-muted">Goals are yours to set. In the mockup they last until you refresh.</p>
      </div>
    </div>
  );
}
