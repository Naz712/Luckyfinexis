import { useEffect, useState, type FormEvent } from "react";
import { insurers, TODAY, type Advisor, type Case } from "../mock/data";
import { estimateGrossRevenue, metricsForCase, parseISODate, productById, productsForInsurer, toISODate } from "../lib/calc";
import { sgd, shortDate } from "../lib/format";
import { Card, Label, MoneyInput, Select } from "../components/ui";

interface Draft {
  clientName: string;
  insurerId: string;
  productId: string;
  premium: string;
  term: string;
  submittedOn: string;
}

const emptyDraft = (): Draft => ({
  clientName: "",
  insurerId: "",
  productId: "",
  premium: "",
  term: "10",
  submittedOn: toISODate(TODAY),
});

let manualSeq = 1;

function validate(d: Draft, isSingle: boolean): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.clientName.trim()) errors.clientName = "Enter the client's name.";
  if (!d.insurerId) errors.insurerId = "Choose an insurer.";
  if (!d.productId) errors.productId = "Choose a product.";
  const premium = Number(d.premium);
  if (!(premium > 0)) errors.premium = "Enter a premium above zero.";
  const term = Number(d.term);
  if (!isSingle && !(Number.isInteger(term) && term >= 1)) errors.term = "Enter the term in whole years.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.submittedOn)) errors.submittedOn = "Pick a date.";
  else if (parseISODate(d.submittedOn) > TODAY) errors.submittedOn = "Submission date can't be in the future.";
  return errors;
}

export default function Log({
  advisor,
  cases,
  onAdd,
  onRemove,
}: {
  advisor: Advisor;
  cases: Case[];
  onAdd: (c: Case) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  const product = draft.productId ? productById(draft.productId) : undefined;
  const isSingle = product?.premium_type === "single";
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (attempted) setErrors(validate(next, productById(next.productId)?.premium_type === "single"));
      return next;
    });
  };

  // Build the case exactly as it would be saved so the preview and the save can't disagree.
  const buildCase = (): Case => {
    const premium = Number(draft.premium) || 0;
    return {
      id: `case_manual_${String(manualSeq).padStart(3, "0")}`,
      advisor_id: advisor.id,
      client_name: draft.clientName.trim(),
      product_id: draft.productId,
      premium_amount: premium,
      premium_term_years: isSingle ? 1 : Number(draft.term) || 0,
      // PLACEHOLDER estimate until Merlin supplies the real figure on confirmation.
      gross_revenue: estimateGrossRevenue(premium),
      banding_code_at_time: advisor.banding_code,
      status: "pending",
      source: "manual",
      submitted_on: draft.submittedOn,
      confirmed_on: null,
    };
  };

  const previewReady = product && Number(draft.premium) > 0;
  const preview = previewReady ? metricsForCase(buildCase()) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const errs = validate(draft, !!isSingle);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const c = buildCase();
    manualSeq += 1;
    onAdd(c);
    setSaved(c.client_name);
    setDraft(emptyDraft());
    setAttempted(false);
    setErrors({});
  };

  const pending = cases
    .filter((c) => c.advisor_id === advisor.id && c.status === "pending")
    .sort((a, b) => (a.submitted_on < b.submitted_on ? 1 : a.submitted_on > b.submitted_on ? -1 : 0));

  const fieldClass = (bad: boolean) =>
    `w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] text-body focus:outline-none focus:ring-2 focus:ring-accent/20 ${
      bad ? "border-warn" : "border-line focus:border-accent"
    }`;

  return (
    <div className="space-y-3 px-4 pb-6 pt-3">
      {saved && (
        <div role="status" className="rounded-2xl border border-ok/30 bg-ok/10 px-4 py-3 text-[13px] text-ok">
          <span className="font-semibold">Logged {saved}.</span> It counts as projected on Home until Merlin confirms it.
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <Card>
          <Label>New case</Label>
          <div className="mt-2 space-y-3">
            <div>
              <label htmlFor="client" className="mb-1 block text-[12px] text-muted">
                Client name
              </label>
              <input
                id="client"
                type="text"
                autoComplete="off"
                value={draft.clientName}
                onChange={(e) => set({ clientName: e.target.value })}
                className={fieldClass(!!errors.clientName)}
                placeholder="e.g. Alicia Teo"
              />
              {errors.clientName && <p className="mt-1 text-[12px] text-warn">{errors.clientName}</p>}
            </div>

            <div>
              <div className="mb-1 text-[12px] text-muted">Insurer and product</div>
              <div className="space-y-2">
                <Select
                  aria-label="Insurer"
                  placeholder="Insurer"
                  value={draft.insurerId}
                  onChange={(e) => set({ insurerId: e.target.value, productId: "" })}
                  options={insurers.map((x) => ({ value: x.id, label: x.name }))}
                  className={errors.insurerId ? "border-warn" : ""}
                />
                <Select
                  aria-label="Product"
                  placeholder={draft.insurerId ? "Product" : "Choose an insurer first"}
                  disabled={!draft.insurerId}
                  value={draft.productId}
                  onChange={(e) => set({ productId: e.target.value })}
                  options={(draft.insurerId ? productsForInsurer(draft.insurerId) : []).map((p) => ({ value: p.id, label: p.name }))}
                  className={errors.productId ? "border-warn" : ""}
                />
              </div>
              {(errors.insurerId || errors.productId) && <p className="mt-1 text-[12px] text-warn">{errors.insurerId ?? errors.productId}</p>}
            </div>

            <div className="grid grid-cols-[1fr_96px] gap-2">
              <div>
                <label htmlFor="premium" className="mb-1 block text-[12px] text-muted">
                  {isSingle ? "Single premium" : "Annual premium"}
                </label>
                <MoneyInput id="premium" value={draft.premium} onChange={(v) => set({ premium: v })} />
                {errors.premium && <p className="mt-1 text-[12px] text-warn">{errors.premium}</p>}
              </div>
              <div>
                <label htmlFor="term" className="mb-1 block text-[12px] text-muted">
                  Term (years)
                </label>
                <input
                  id="term"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  disabled={isSingle}
                  value={isSingle ? "1" : draft.term}
                  onChange={(e) => set({ term: e.target.value })}
                  className={`${fieldClass(!!errors.term)} tnum font-semibold text-ink disabled:bg-canvas disabled:text-muted`}
                />
                {errors.term && <p className="mt-1 text-[12px] text-warn">{errors.term}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="submitted" className="mb-1 block text-[12px] text-muted">
                Submitted on
              </label>
              <input
                id="submitted"
                type="date"
                max={toISODate(TODAY)}
                value={draft.submittedOn}
                onChange={(e) => set({ submittedOn: e.target.value })}
                className={`${fieldClass(!!errors.submittedOn)} tnum`}
              />
              {errors.submittedOn && <p className="mt-1 text-[12px] text-warn">{errors.submittedOn}</p>}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-canvas px-3 py-2.5 text-[12px] text-muted">
            {preview ? (
              <>
                Adds <span className="tnum font-semibold text-ink">{sgd(preview.commission)}</span> commission at {advisor.banding_code} ·{" "}
                <span className="tnum font-semibold text-ink">{sgd(preview.mdrt_premium)}</span> MDRT premium ·{" "}
                <span className="tnum font-semibold text-ink">{sgd(preview.wape)}</span> WAPE.{" "}
                <span className="text-muted/80">Gross revenue is a placeholder estimate until confirmed.</span>
              </>
            ) : (
              "Pick a product and premium to see what this case adds."
            )}
          </div>

          <button type="submit" className="mt-3 w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white hover:bg-ink">
            Log case
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">Saved as pending until it appears in Merlin. Confirmed cases can't be edited here.</p>
        </Card>
      </form>

      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Pending cases</Label>
          <span className="tnum text-[11px] text-muted">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">Nothing pending. Everything you've logged is in Merlin.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {pending.map((c) => {
              const p = productById(c.product_id);
              const insurer = insurers.find((i) => i.id === p?.insurer_id);
              const m = metricsForCase(c);
              return (
                <li key={c.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[14px] font-semibold text-ink">{c.client_name}</span>
                        <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warn">Not yet in Merlin</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted">
                        {insurer?.name} · {p?.name}
                      </div>
                      <div className="tnum mt-0.5 text-[12px] text-muted">
                        {sgd(c.premium_amount)}
                        {p?.premium_type === "regular" ? `/yr × ${c.premium_term_years} yrs` : " single"} ·{" "}
                        <span className="whitespace-nowrap">submitted {shortDate(parseISODate(c.submitted_on))}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-[15px] font-semibold text-body">{sgd(m.commission)}</div>
                      <div className="text-[11px] text-muted">commission</div>
                      <button type="button" onClick={() => onRemove(c.id)} className="mt-1 text-[12px] font-medium text-muted underline-offset-2 hover:text-body hover:underline">
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
