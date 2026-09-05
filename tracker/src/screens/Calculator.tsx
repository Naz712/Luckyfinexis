import { useState } from "react";
import { bandings, insurers, GROSS_REVENUE_PLACEHOLDER_RATE, TODAY, type Advisor, type BandingCode, type Case, type Product } from "../mock/data";
import {
  aggregate,
  bandingRate,
  clientsNeeded,
  commissionForCase,
  estimateGrossRevenue,
  goalFor,
  metricDefinition,
  periodBounds,
  productById,
  productsForInsurer,
} from "../lib/calc";
import { sgd, pct } from "../lib/format";
import { Card, Label, MoneyInput, Segmented, Select } from "../components/ui";

interface Row {
  key: number;
  insurerId: string;
  productId: string;
  premium: string; // raw input text; parsed when used
}

const CATEGORY_LABEL: Record<Product["category"], string> = {
  life: "Life",
  ilp: "ILP",
  health: "Health",
  endowment: "Endowment",
  fund: "Fund",
};

let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, insurerId: "", productId: "", premium: "" });

function parseMoney(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function Calculator({ advisor, cases }: { advisor: Advisor; cases: Case[] }) {
  const [banding, setBanding] = useState<BandingCode>(advisor.banding_code);
  const [rows, setRows] = useState<Row[]>([blankRow()]);

  // Goal: pre-filled from the FC's self-set commission goal for the current year.
  const year = TODAY.getFullYear();
  const savedGoal = goalFor(advisor.id, "commission", year);
  const [goalText, setGoalText] = useState(savedGoal === null ? "" : String(savedGoal));
  const goal = parseMoney(goalText);

  // Achieved so far = confirmed commission in the commission metric's period.
  const period = periodBounds(metricDefinition("commission").period_type, TODAY);
  const achieved = aggregate(
    cases.filter((c) => c.status === "confirmed"),
    "commission",
    period.start,
    period.end,
  );

  const rate = bandingRate(banding);
  const computed = rows.map((r) => {
    const premium = parseMoney(r.premium);
    const gross = r.productId ? estimateGrossRevenue(premium) : 0;
    return { row: r, premium, gross, commission: commissionForCase(gross, banding) };
  });
  const totalGross = computed.reduce((s, c) => s + c.gross, 0);
  const totalCommission = computed.reduce((s, c) => s + c.commission, 0);
  const filledRows = computed.filter((c) => c.row.productId && c.premium > 0).length;

  const gap = Math.max(goal - achieved, 0);
  const needed = clientsNeeded(gap, totalCommission);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

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

      {computed.map(({ row, premium, gross, commission }, i) => {
        const product = row.productId ? productById(row.productId) : undefined;
        const productOptions = row.insurerId ? productsForInsurer(row.insurerId) : [];
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
                onChange={(e) => update(row.key, { insurerId: e.target.value, productId: "" })}
                options={insurers.map((x) => ({ value: x.id, label: x.name }))}
              />
              <Select
                aria-label={`Product ${i + 1}`}
                placeholder={row.insurerId ? "Product" : "Choose an insurer first"}
                disabled={!row.insurerId}
                value={row.productId}
                onChange={(e) => update(row.key, { productId: e.target.value })}
                options={productOptions.map((p) => ({ value: p.id, label: p.name }))}
              />
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <label htmlFor={`premium-${row.key}`} className="text-[12px] text-muted">
                    {product?.premium_type === "single" ? "Single premium" : "Annual premium"}
                  </label>
                  {product && <span className="text-[11px] text-muted">{CATEGORY_LABEL[product.category]}</span>}
                </div>
                <MoneyInput id={`premium-${row.key}`} value={row.premium} onChange={(v) => update(row.key, { premium: v })} />
              </div>
            </div>

            <dl className="mt-3 divide-y divide-line border-t border-line">
              <div className="flex items-baseline justify-between py-2">
                <dt className="text-[13px] text-muted">
                  Gross revenue{" "}
                  <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                    placeholder ×{GROSS_REVENUE_PLACEHOLDER_RATE}
                  </span>
                </dt>
                <dd className="tnum text-[15px] font-medium text-body">{premium > 0 && product ? sgd(gross) : "—"}</dd>
              </div>
              <div className="flex items-baseline justify-between py-2">
                <dt className="text-[13px] text-muted">
                  Commission <span className="tnum">@ {banding} · {pct(rate)}</span>
                </dt>
                <dd className="tnum text-[20px] font-semibold text-ink">{premium > 0 && product ? sgd(commission) : "—"}</dd>
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
          <Label>{year} commission goal</Label>
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

      <p className="px-1 text-center text-[11px] text-muted">Nothing here is saved. Figures use placeholder rates.</p>
    </div>
  );
}
