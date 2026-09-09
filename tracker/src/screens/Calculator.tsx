import { useState } from "react";
import { bandings, insurers, TODAY, type Advisor, type BandingCode, type Case, type Product } from "../mock/data";
import {
  aggregate,
  bandingRate,
  clientsNeeded,
  commissionForCase,
  estimateGrossRevenue,
  goalFor,
  goalPeriod,
  metricDefinition,
  periodBounds,
  type GoalSet,
  productById,
  productsForInsurer,
} from "../lib/calc";
import { sgd, pct, periodLabel } from "../lib/format";
import { Card, Label, MoneyInput, Segmented, Select } from "../components/ui";

interface Row {
  key: number;
  insurerId: string;
  productId: string;
  /** Premium (or amount invested). Pre-filled with the product's typical case until the FC types over it. */
  premium: string;
  /** Gross revenue. Filled from the premium at the product's placeholder rate until the FC types over it. */
  gross: string;
  /** True once the FC has typed the premium themselves; product changes then stop resetting it. */
  premiumTouched: boolean;
  /** True once the FC has typed gross revenue themselves; the estimate then stops overwriting it. */
  grossTouched: boolean;
}

const CATEGORY_LABEL: Record<Product["category"], string> = {
  life: "Life",
  ilp: "ILP",
  health: "Health",
  endowment: "Endowment",
  fund: "Investment",
};

/** What the money field means for this product. */
function amountLabel(product: Product | undefined): string {
  if (!product) return "Premium";
  if (product.category === "fund") return product.premium_type === "single" ? "Amount invested" : "Annual contribution";
  return product.premium_type === "single" ? "Single premium" : "Annual premium";
}

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, insurerId: "", productId: "", premium: "", gross: "", premiumTouched: false, grossTouched: false });

function parseMoney(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Gross revenue estimated from a premium, as field text ("" when there is nothing to estimate from). */
function estimateText(premium: number, product: Product | undefined): string {
  if (!product || premium <= 0) return "";
  return String(Math.round(estimateGrossRevenue(premium, product)));
}

export default function Calculator({ advisor, cases, goalSet }: { advisor: Advisor; cases: Case[]; goalSet: GoalSet }) {
  const [banding, setBanding] = useState<BandingCode>(advisor.banding_code);
  const [rows, setRows] = useState<Row[]>([blankRow()]);

  // Goal: pre-filled from the FC's self-set commission goal, over that goal's own window.
  const year = TODAY.getFullYear();
  const savedGoalRow = goalFor(advisor.id, "commission", year, goalSet.targets);
  const savedGoal = savedGoalRow ? savedGoalRow.target_value : null;
  const [goalText, setGoalText] = useState(savedGoal === null ? "" : String(savedGoal));
  const goal = parseMoney(goalText);

  // Achieved so far = confirmed commission in the goal's window (or the metric's period if no goal).
  const commissionDef = metricDefinition("commission");
  const period = savedGoalRow ? goalPeriod(savedGoalRow.cadence, commissionDef.period_type, TODAY) : periodBounds(commissionDef.period_type, TODAY);
  const achieved = aggregate(
    cases.filter((c) => c.status === "confirmed"),
    "commission",
    period.start,
    period.end,
  );

  const rate = bandingRate(banding);
  const computed = rows.map((r) => {
    const gross = r.productId ? parseMoney(r.gross) : 0;
    return { row: r, gross, commission: commissionForCase(gross, banding) };
  });
  const totalGross = computed.reduce((s, c) => s + c.gross, 0);
  const totalCommission = computed.reduce((s, c) => s + c.commission, 0);
  const filledRows = computed.filter((c) => c.gross > 0).length;

  const gap = Math.max(goal - achieved, 0);
  const needed = clientsNeeded(gap, totalCommission);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  /** Premium typed → gross revenue re-estimated from the product's rate, unless the FC has set gross revenue by hand. */
  const setPremium = (row: Row, premium: string) => {
    const product = row.productId ? productById(row.productId) : undefined;
    const patch: Partial<Row> = { premium, premiumTouched: premium !== "" };
    if (!row.grossTouched) patch.gross = estimateText(parseMoney(premium), product);
    update(row.key, patch);
  };

  /** Product chosen → premium pre-filled with the product's typical case and gross revenue estimated from it, unless the FC typed either. */
  const setProduct = (row: Row, productId: string) => {
    const product = productId ? productById(productId) : undefined;
    const premium = row.premiumTouched ? row.premium : product ? String(product.typical_premium) : "";
    const patch: Partial<Row> = { productId, premium };
    if (!row.grossTouched) patch.gross = estimateText(parseMoney(premium), product);
    update(row.key, patch);
  };

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Banding</Label>
          <span className="text-[11px] text-muted">
            Your current band: <span className="font-semibold text-body">{advisor.banding_code}</span>
          </span>
        </div>
        <div className="mt-2">
          <Segmented
            ariaLabel="Banding"
            value={banding}
            onChange={setBanding}
            options={bandings.map((b) => ({ value: b.code, label: b.code, hint: pct(b.commission_rate) }))}
          />
        </div>
      </Card>

      {computed.map(({ row, gross, commission }, i) => {
        const product = row.productId ? productById(row.productId) : undefined;
        const productOptions = row.insurerId ? productsForInsurer(row.insurerId) : [];
        const fund = product?.category === "fund";
        return (
          <Card key={row.key}>
            <div className="mb-2 flex items-center justify-between">
              <Label>Product {i + 1}</Label>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(row.key)}
                  className="rounded-md px-2 py-0.5 text-[12px] font-medium text-muted hover:bg-canvas hover:text-body"
                  aria-label={`Remove product ${i + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
            <div className="space-y-2">
              <Select
                aria-label={`Insurer for product ${i + 1}`}
                placeholder="Insurer"
                value={row.insurerId}
                onChange={(e) =>
                  update(row.key, {
                    insurerId: e.target.value,
                    productId: "",
                    premium: row.premiumTouched ? row.premium : "",
                    gross: row.grossTouched ? row.gross : "",
                  })
                }
                options={insurers.map((x) => ({ value: x.id, label: x.name }))}
              />
              <Select
                aria-label={`Product ${i + 1}`}
                placeholder={row.insurerId ? "Product" : "Choose an insurer first"}
                disabled={!row.insurerId}
                value={row.productId}
                onChange={(e) => setProduct(row, e.target.value)}
                options={productOptions.map((p) => ({ value: p.id, label: p.name }))}
              />
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <label htmlFor={`premium-${row.key}`} className="text-[12px] text-muted">
                    {amountLabel(product)}
                  </label>
                  {product && (
                    <span className="text-[11px] text-muted">
                      {CATEGORY_LABEL[product.category]}
                      {!row.premiumTouched && " · typical case, adjust to yours"}
                    </span>
                  )}
                </div>
                <MoneyInput
                  id={`premium-${row.key}`}
                  value={row.premium}
                  onChange={(v) => setPremium(row, v)}
                  disabled={!product}
                  placeholder={product ? "0" : "Choose a product first"}
                />
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <label htmlFor={`gross-${row.key}`} className="text-[12px] text-muted">
                    Gross revenue
                  </label>
                  {product && (
                    <span className="text-[11px] text-muted">
                      {row.grossTouched ? (
                        "your figure"
                      ) : (
                        <>
                          est. × {product.comm_rate} <span className="rounded bg-canvas px-1 py-px text-[10px] uppercase tracking-wide">placeholder rate</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
                <MoneyInput
                  id={`gross-${row.key}`}
                  value={row.gross}
                  onChange={(v) => update(row.key, { gross: v, grossTouched: v !== "" })}
                  disabled={!product}
                  placeholder={product ? "0" : "Choose a product first"}
                />
                {product && (
                  <p className="mt-1 text-[11px] text-muted">
                    {row.grossTouched ? (
                      <>
                        Using the figure you typed.{" "}
                        <button
                          type="button"
                          onClick={() => update(row.key, { grossTouched: false, gross: estimateText(parseMoney(row.premium), product) })}
                          className="font-medium text-accent"
                        >
                          Re-estimate from {fund ? "the amount" : "the premium"}
                        </button>
                      </>
                    ) : (
                      <>
                        Filled from the {fund ? "amount above (upfront charge only, trailer fees not included)" : "premium above"}. Type over it if the
                        illustration says otherwise.
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>

            <dl className="mt-3 border-t border-line">
              <div className="flex items-baseline justify-between py-2">
                <dt className="text-[13px] text-muted">
                  Commission <span className="tnum">@ {banding} · {pct(rate)}</span>
                </dt>
                <dd className="tnum text-[20px] font-semibold text-ink">{gross > 0 ? sgd(commission) : "—"}</dd>
              </div>
            </dl>
          </Card>
        );
      })}

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, blankRow()])}
        className="w-full rounded-2xl border border-dashed border-accent/40 bg-accent-soft/40 py-3 text-[14px] font-semibold text-accent hover:bg-accent-soft"
      >
        + Add product
      </button>

      <Card tone="accent">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Total commission per client</div>
        <div className="tnum mt-1 text-[40px] font-semibold leading-none">{sgd(totalCommission)}</div>
        <div className="tnum mt-2 text-[12px] text-white/75">
          {filledRows} {filledRows === 1 ? "product" : "products"} · gross revenue {sgd(totalGross)} · band {banding}
        </div>
      </Card>

      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Commission goal · {periodLabel(period)}</Label>
          {savedGoal !== null && goal !== savedGoal && (
            <button type="button" onClick={() => setGoalText(String(savedGoal))} className="text-[11px] font-medium text-accent">
              Reset to saved goal
            </button>
          )}
        </div>
        <div className="mt-2">
          <MoneyInput id="goal" value={goalText} onChange={setGoalText} placeholder="Enter a goal" />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-canvas px-3 py-2">
            <dt className="text-[11px] text-muted">Achieved (confirmed)</dt>
            <dd className="tnum text-[16px] font-semibold text-ink">{sgd(achieved)}</dd>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2">
            <dt className="text-[11px] text-muted">Gap to goal</dt>
            <dd className="tnum text-[16px] font-semibold text-ink">{goal > 0 ? sgd(gap) : "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-[15px] leading-snug text-body">
          {goal <= 0 ? (
            "Enter a goal to see how many clients you need."
          ) : gap === 0 ? (
            <>
              <span className="font-semibold text-ok">Goal reached.</span> Anything from here is above target.
            </>
          ) : needed === null ? (
            "Add a product above to see how many clients like this you need."
          ) : (
            <>
              You need <span className="tnum text-[22px] font-semibold text-accent">{needed}</span> more{" "}
              {needed === 1 ? "client" : "clients"} like this.
            </>
          )}
        </p>
      </Card>

      <p className="px-1 text-center text-[11px] text-muted">Nothing here is saved. Banding rates are placeholders.</p>
    </div>
  );
}
