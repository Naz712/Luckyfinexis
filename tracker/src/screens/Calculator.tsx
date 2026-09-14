import { useState } from "react";
import { MDRT_MEMBERSHIP_YEAR, products, TODAY, type Advisor, type BandingCode, type Case, type Product } from "../mock/data";
import {
  aggregate,
  bandingRate,
  clientsNeeded,
  commissionForCase,
  creditRate,
  estimateGrossRevenue,
  goalFor,
  goalPeriod,
  mdrtTierGoalFor,
  metricDefinition,
  periodBounds,
  productById,
  thresholdFor,
  type GoalSet,
  type PrimaryGoal,
} from "../lib/calc";
import { pct, periodLabel, sgd } from "../lib/format";
import { Card, Label } from "../components/ui";
import { ProductButton, ProductPicker } from "../components/ProductPicker";

const TIER_LABEL = { mdrt: "MDRT", cot: "COT", tot: "TOT" } as const;

/** The product the screen opens with (Singlife Whole Life, as designed), so it is never empty. */
const FIRST_PRODUCT_ID = "prd_02";

interface Row {
  key: number;
  productId: string;
  /** Premium, single premium or amount invested, as typed. Pre-filled with the product's typical case until the FC types over it. */
  premium: string;
  /** Gross revenue as typed. Estimated from the premium at the product's placeholder rate until the FC types over it. */
  gross: string;
  /** True once the FC has typed the premium; changing product then leaves it alone. */
  premiumTouched: boolean;
  /** True once the FC has typed gross revenue; the estimate then stops overwriting it. */
  grossTouched: boolean;
}

type Picker = { mode: "add" } | { mode: "edit"; key: number };

/** The one goal set in Goals, as the calculator reads it. */
interface ActiveGoal {
  label: string;
  /** null when a custom aim has no commission target yet. */
  target: number | null;
  /** Confirmed commission inside the goal's window. */
  achieved: number;
  /** "commission route, Jan–Dec 2026" / "Q3 2026". */
  window: string;
}

/** What the money field means for this product. */
function amountLabel(product: Product): string {
  if (product.category === "fund") return product.premium_type === "single" ? "Amount invested" : "Annual contribution";
  return product.premium_type === "single" ? "Single premium" : "Annual premium";
}

function parseMoney(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Gross revenue estimated from a premium, as field text ("" when there is nothing to estimate from). */
function estimateText(premium: number, product: Product): string {
  return premium > 0 ? String(Math.round(estimateGrossRevenue(premium, product))) : "";
}

function requireProduct(id: string): Product {
  const p = productById(id);
  if (!p) throw new Error(`Unknown product: ${id}`);
  return p;
}

let nextKey = 1;

/** A fresh row for a product: typical case pre-filled, gross revenue estimated from it. */
function rowFor(product: Product): Row {
  return {
    key: nextKey++,
    productId: product.id,
    premium: String(product.typical_premium),
    gross: estimateText(product.typical_premium, product),
    premiumTouched: false,
    grossTouched: false,
  };
}

/**
 * The goal chosen in Goals. A tier aim reads the MDRT commission route
 * (threshold of the aimed-for tier over the MDRT production year); a custom
 * aim reads the FC's own commission goal over that goal's cadence window.
 */
function activeGoalFor(advisor: Advisor, cases: Case[], goalSet: GoalSet, primary: PrimaryGoal): ActiveGoal {
  const year = TODAY.getFullYear();
  const confirmed = cases.filter((c) => c.status === "confirmed");
  if (primary.kind === "tier") {
    const tier = mdrtTierGoalFor(advisor.id, year, goalSet.mdrtTiers);
    const period = periodBounds(metricDefinition("mdrt_commission").period_type, TODAY);
    return {
      label: `${TIER_LABEL[tier]} ${MDRT_MEMBERSHIP_YEAR}`,
      target: thresholdFor("mdrt_commission", tier),
      achieved: aggregate(confirmed, "mdrt_commission", period.start, period.end),
      window: `commission route, ${periodLabel(period)}`,
    };
  }
  const goal = goalFor(advisor.id, "commission", year, goalSet.targets);
  const def = metricDefinition("commission");
  const period = goal ? goalPeriod(goal.cadence, def.period_type, TODAY) : periodBounds(def.period_type, TODAY);
  return {
    label: "Your commission goal",
    target: goal ? goal.target_value : null,
    achieved: aggregate(confirmed, "commission", period.start, period.end),
    window: periodLabel(period),
  };
}

/** The design's money field: "S$" prefix inside a rounded, hairlined input. */
function MoneyField({
  id,
  value,
  onChange,
  compact = false,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** The smaller what-if variant (16px, 10px vertical padding). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <span aria-hidden="true" className="tnum pointer-events-none absolute left-[13px] text-[15px] font-semibold text-[#9aa1b1]">
        S$
      </span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        placeholder="0"
        onChange={(e) => onChange(e.target.value)}
        className={`tnum w-full rounded-xl border border-line bg-white pl-[42px] pr-3.5 font-semibold text-ink transition-[border-color,box-shadow] duration-150 placeholder:font-normal placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16 ${
          compact ? "py-2.5 text-[16px]" : "py-[11px] text-[17px]"
        }`}
      />
    </div>
  );
}

function ChevronIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Calculator({
  advisor,
  cases,
  goalSet,
  primary,
  band,
  onGoToGoals,
}: {
  advisor: Advisor;
  cases: Case[];
  goalSet: GoalSet;
  primary: PrimaryGoal;
  band: BandingCode;
  onGoToGoals: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => [rowFor(productById(FIRST_PRODUCT_ID) ?? products[0])]);
  /** The what-if goal figure while the box is open; null means "use my goals". Never saved. */
  const [whatIf, setWhatIf] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);

  // ── Per-product maths ──
  const rate = bandingRate(band);
  const computed = rows.map((row) => {
    const product = requireProduct(row.productId);
    const premium = parseMoney(row.premium);
    const gross = parseMoney(row.gross);
    return {
      row,
      product,
      premium,
      gross,
      commission: commissionForCase(gross, band),
      mdrt: premium * creditRate(product.id, "mdrt_premium"),
    };
  });
  const totalGross = computed.reduce((t, c) => t + c.gross, 0);
  const totalCommission = computed.reduce((t, c) => t + c.commission, 0);
  const totalMdrt = computed.reduce((t, c) => t + c.mdrt, 0);
  const filled = computed.filter((c) => c.gross > 0).length;

  // ── The goal set in Goals, and the what-if figure laid over it ──
  const goal = activeGoalFor(advisor, cases, goalSet, primary);
  const savedTarget = goal.target ?? 0;
  const ratio = goal.target ? Math.min(goal.achieved / goal.target, 1) : 0;
  const toGo = Math.max(savedTarget - goal.achieved, 0);

  const goalNum = whatIf === null ? savedTarget : parseMoney(whatIf);
  const gap = Math.max(goalNum - goal.achieved, 0);
  const needed = clientsNeeded(gap, totalCommission);
  const goalName = whatIf === null ? goal.label : "that figure";

  let verdict: { figure: string; unit: string; note: string; ink: string };
  if (goalNum <= 0) {
    verdict = { figure: "—", unit: "Enter a figure above", note: "With an amount set, this shows how many clients like this one close the gap.", ink: "text-ink" };
  } else if (gap === 0) {
    verdict = { figure: "Goal reached", unit: "", note: `${goalName} is already met. Anything from here is above target.`, ink: "text-ok" };
  } else if (needed === null) {
    verdict = { figure: "—", unit: "Add a product above", note: "Once a product has gross revenue, this shows the number of clients you need.", ink: "text-ink" };
  } else {
    verdict = {
      figure: String(needed),
      unit: needed === 1 ? "more client like this" : "more clients like this",
      note: `At ${sgd(totalCommission)} a client, that closes the ${sgd(gap)} gap to ${goalName}. Each one also adds ${sgd(totalMdrt)} of MDRT premium credit.`,
      ink: "text-accent",
    };
  }

  // ── Row edits ──
  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  /** Amount typed → gross revenue re-estimated at the product's rate, unless the FC has typed gross revenue by hand. */
  const setPremium = (row: Row, product: Product, v: string) => {
    const p: Partial<Row> = { premium: v, premiumTouched: v !== "" };
    if (!row.grossTouched) p.gross = estimateText(parseMoney(v), product);
    patch(row.key, p);
  };

  /** Product changed → typical case pre-filled and gross revenue re-estimated, unless the FC typed either. */
  const setProduct = (key: number, product: Product) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const premium = r.premiumTouched ? r.premium : String(product.typical_premium);
        return { ...r, productId: product.id, premium, gross: r.grossTouched ? r.gross : estimateText(parseMoney(premium), product) };
      }),
    );

  const pick = (product: Product) => {
    if (picker?.mode === "edit") {
      setProduct(picker.key, product);
    } else {
      const row = rowFor(product);
      setRows((rs) => [...rs, row]);
    }
    setPicker(null);
  };
  const editing = picker?.mode === "edit" ? rows.find((r) => r.key === picker.key) : undefined;

  return (
    <>
      <div className="flex flex-col gap-2.5 px-4 pb-24 pt-3">
        {computed.map(({ row, product, gross, commission }) => {
          const fund = product.category === "fund";
          return (
            <div key={row.key} className="overflow-hidden rounded-2xl border border-line bg-white">
              <ProductButton product={product} onClick={() => setPicker({ mode: "edit", key: row.key })} bordered={false} />

              <div className="flex flex-col gap-[11px] px-4 pb-3.5">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={`premium-${row.key}`} className="text-[12px] text-muted">
                      {amountLabel(product)}
                    </label>
                    <span className="shrink-0 text-[11px] text-muted">{row.premiumTouched ? "your figure" : "typical case, adjust to yours"}</span>
                  </div>
                  <MoneyField id={`premium-${row.key}`} value={row.premium} onChange={(v) => setPremium(row, product, v)} className="mt-[5px]" />
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={`gross-${row.key}`} className="text-[12px] text-muted">
                      Gross revenue
                    </label>
                    <span className="flex shrink-0 items-center gap-[5px] text-[11px] text-muted">
                      {row.grossTouched ? "your figure" : `est. × ${product.comm_rate}`}
                      {!row.grossTouched && (
                        <span className="rounded bg-canvas px-1 py-0.5 text-[9px] font-bold uppercase tracking-[.05em] text-muted">Placeholder rate</span>
                      )}
                    </span>
                  </div>
                  <MoneyField id={`gross-${row.key}`} value={row.gross} onChange={(v) => patch(row.key, { gross: v, grossTouched: v !== "" })} className="mt-[5px]" />
                  {row.grossTouched && (
                    <button
                      type="button"
                      onClick={() => patch(row.key, { grossTouched: false, gross: estimateText(parseMoney(row.premium), product) })}
                      className="mt-[7px] text-[11px] font-semibold text-accent"
                    >
                      Re-estimate from the amount above
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2.5 border-t border-line bg-canvas px-4 py-[11px]">
                <span className="tnum text-[12px] text-muted">
                  Commission @ {band} · {pct(rate)}
                  {fund && " · upfront only"}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tnum text-[20px] font-bold text-ink">{gross > 0 ? sgd(commission) : "—"}</span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(row.key)}
                      aria-label={`Remove ${product.name}`}
                      className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-line bg-white text-muted"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setPicker({ mode: "add" })}
          className="flex w-full items-center justify-center gap-[7px] rounded-2xl border border-dashed border-accent/45 bg-accent-soft/50 p-3.5 text-[14px] font-semibold text-accent"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Add another product
        </button>

        <Card className="mt-0.5">
          <div className="flex items-baseline justify-between gap-2.5">
            <Label>How far this gets you</Label>
            <button type="button" onClick={onGoToGoals} className="-my-1.5 flex shrink-0 items-center gap-[3px] py-1.5 text-[11px] font-semibold text-accent">
              Set in Goals
              <ChevronIcon />
            </button>
          </div>

          <div className="mt-2.5 rounded-xl bg-accent-soft px-[13px] py-3">
            <div className="flex items-baseline justify-between gap-[9px]">
              <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{goal.label}</span>
              <span className="tnum shrink-0 text-[15px] font-bold text-accent">{goal.target === null ? "Not set" : sgd(goal.target)}</span>
            </div>
            <div className="mt-[9px] flex h-1.5 overflow-hidden rounded-full bg-accent/18" role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
              <span className="bg-accent" style={{ width: pct(ratio) }} />
            </div>
            <div className="tnum mt-2 flex items-baseline justify-between gap-[9px] text-[11px] text-muted">
              <span>
                {sgd(goal.achieved)} so far · {goal.target === null ? goal.window : `${pct(ratio)} · ${goal.window}`}
              </span>
              <span className="shrink-0">{goal.target === null ? "no target" : toGo === 0 ? "reached" : `${sgd(toGo)} to go`}</span>
            </div>
          </div>

          {whatIf === null ? (
            <button type="button" onClick={() => setWhatIf(goal.target === null ? "" : String(goal.target))} className="mt-[9px] text-[11px] font-semibold text-accent">
              Try a different figure
            </button>
          ) : (
            <div className="mt-2.5 rounded-xl border border-dashed border-[#d5ddf2] bg-accent-soft/40 px-3 py-[11px]">
              <div className="flex items-baseline justify-between gap-2.5">
                <label htmlFor="what-if" className="text-[11px] font-bold uppercase tracking-[.06em] text-muted">
                  What if the goal were
                </label>
                <button type="button" onClick={() => setWhatIf(null)} className="shrink-0 text-[11px] font-semibold text-accent">
                  Use my goals
                </button>
              </div>
              <MoneyField id="what-if" value={whatIf} onChange={setWhatIf} compact className="mt-2" />
              <div className="mt-[7px] text-[11px] text-muted">Not saved. Change it for real in Goals.</div>
            </div>
          )}

          <div className="mt-[13px] border-t border-line pt-[13px]">
            <div className="tnum flex flex-wrap items-baseline gap-2">
              <span className={`text-[38px] font-bold leading-none tracking-[-.03em] ${verdict.ink}`}>{verdict.figure}</span>
              {verdict.unit && <span className="text-[14px] font-medium text-body">{verdict.unit}</span>}
            </div>
            <div className="tnum mt-2 text-pretty text-[12px] leading-normal text-muted">{verdict.note}</div>
          </div>
        </Card>

        <p className="tnum px-1 pt-0.5 text-center text-pretty text-[11px] leading-normal text-muted">
          Nothing here is saved. Banding rates and product commission rates are placeholders.
        </p>
      </div>

      <section
        aria-label="Total per client"
        className="fixed inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom))] z-10 mx-auto flex w-full max-w-[430px] items-center justify-between gap-3 bg-accent px-5 pb-3 pt-[11px] text-white"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.08em] text-white/72">Total per client</div>
          <div className="tnum mt-0.5 truncate text-[11px] text-white/78">
            {filled} {filled === 1 ? "product" : "products"} · gross {sgd(totalGross)} · MDRT credit {sgd(totalMdrt)}
          </div>
        </div>
        <div className="tnum shrink-0 text-[28px] font-bold leading-none tracking-[-.025em]">{sgd(totalCommission)}</div>
      </section>

      <ProductPicker
        open={picker !== null}
        title={picker?.mode === "edit" ? "Change product" : "Add a product"}
        selectedId={editing?.productId}
        onPick={pick}
        onClose={() => setPicker(null)}
      />
    </>
  );
}
