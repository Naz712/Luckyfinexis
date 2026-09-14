import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TODAY, type Advisor, type Case, type Product } from "../mock/data";
import { bandingRate, clientsForAdvisor, estimateGrossRevenue, metricsForCase, parseISODate, productById, toISODate } from "../lib/calc";
import { pct, sgd, shortDate } from "../lib/format";
import { Card, Label } from "../components/ui";
import { ProductButton, ProductPicker, insurerName } from "../components/ProductPicker";

interface Draft {
  clientName: string;
  productId: string;
  premium: string;
  /** True once the FC has typed an amount, so choosing a product no longer overwrites it with the typical premium. */
  premiumTouched: boolean;
  term: string;
  submittedOn: string;
}

type Errors = Partial<Record<"client" | "product" | "premium" | "term" | "date", string>>;

const emptyDraft = (): Draft => ({
  clientName: "",
  productId: "",
  premium: "",
  premiumTouched: false,
  term: "10",
  submittedOn: toISODate(TODAY),
});

let manualSeq = 1;

/** Same rules as before: run on submit, then live until the draft is clean again. */
function validate(d: Draft, product: Product | undefined): Errors {
  const errors: Errors = {};
  if (!d.clientName.trim()) errors.client = "Enter the client's name.";
  if (!product) errors.product = "Choose an insurer and product.";
  const premium = Number(d.premium);
  if (!(premium > 0)) errors.premium = "Enter an amount above zero.";
  if (product?.premium_type !== "single") {
    const term = Number(d.term);
    if (!(Number.isInteger(term) && term >= 1)) errors.term = "Enter the term in whole years.";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.submittedOn)) errors.date = "Pick a date.";
  else if (parseISODate(d.submittedOn) > TODAY) errors.date = "Submission date cannot be in the future.";
  return errors;
}

function amountLabelFor(p: Product | undefined): string {
  if (!p) return "Premium";
  if (p.category === "fund") return p.premium_type === "single" ? "Amount invested" : "Annual contribution";
  return p.premium_type === "single" ? "Single premium" : "Annual premium";
}

const FIELD = "w-full rounded-xl border bg-white transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16";
const border = (bad: boolean) => (bad ? "border-warn" : "border-line");

function Chevron() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-[#c3c8d4]">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Log({
  advisor,
  cases,
  onAdd,
  onRemove,
  initialClient,
}: {
  advisor: Advisor;
  cases: Case[];
  onAdd: (c: Case) => void;
  onRemove: (id: string) => void;
  /** Pre-fills the client name when the screen is opened from a client's page. */
  initialClient?: string;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), clientName: initialClient ?? "" }));
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 4000);
    return () => clearTimeout(t);
  }, [saved]);

  const product = draft.productId ? productById(draft.productId) : undefined;
  const isSingle = product?.premium_type === "single";
  const errors: Errors = attempted ? validate(draft, product) : {};
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Existing clients, newest first, for the search beneath the name field.
  const clients = useMemo(
    () => clientsForAdvisor(advisor.id).slice().sort((a, b) => (a.since < b.since ? 1 : a.since > b.since ? -1 : 0)),
    [advisor.id],
  );
  const query = draft.clientName.trim().toLowerCase();
  const exactClient = clients.some((c) => c.name.toLowerCase() === query);
  const matches = query.length < 1 ? [] : clients.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 5);
  const showMatches = matches.length > 0 && !exactClient;
  const showNewClient = query.length > 1 && matches.length === 0;

  const pickProduct = (p: Product) => {
    setDraft((d) => ({
      ...d,
      productId: p.id,
      premium: d.premiumTouched ? d.premium : String(p.typical_premium),
      term: p.premium_type === "single" ? "1" : d.term,
    }));
    setPicker(false);
  };

  // Build the case exactly as it would be saved so the preview and the save can't disagree.
  const buildCase = (p: Product): Case => {
    const premium = Number(draft.premium) || 0;
    return {
      id: `case_manual_${String(manualSeq).padStart(3, "0")}`,
      advisor_id: advisor.id,
      client_name: draft.clientName.trim(),
      product_id: p.id,
      premium_amount: premium,
      premium_term_years: p.premium_type === "single" ? 1 : Number(draft.term) || 0,
      // Placeholder estimate from the product's comm_rate until Merlin supplies the real figure on confirmation.
      gross_revenue: estimateGrossRevenue(premium, p),
      banding_code_at_time: advisor.banding_code,
      status: "pending",
      source: "manual",
      submitted_on: draft.submittedOn,
      confirmed_on: null,
    };
  };

  const preview = product && Number(draft.premium) > 0 ? metricsForCase(buildCase(product)) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(draft, product);
    if (Object.keys(errs).length > 0 || !product) {
      setAttempted(true);
      return;
    }
    const c = buildCase(product);
    manualSeq += 1;
    onAdd(c);
    setSaved(c.client_name);
    setDraft(emptyDraft());
    setAttempted(false);
  };

  const pending = cases
    .filter((c) => c.advisor_id === advisor.id && c.status === "pending")
    .sort((a, b) => (a.submitted_on < b.submitted_on ? 1 : a.submitted_on > b.submitted_on ? -1 : 0));
  const pendingCommission = pending.reduce((t, c) => t + metricsForCase(c).commission, 0);

  const amountMessage = errors.premium ?? errors.term;

  return (
    <>
      <div className="space-y-3 px-4 pb-5 pt-3">
        {saved && (
          <div role="status" className="drop-in flex items-start gap-[9px] rounded-[14px] border border-ok/30 bg-ok/9 px-[13px] py-3">
            <span className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-ok text-white" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-[12px] leading-[1.5] text-[#0f6a48]">
              <span className="font-bold">Logged {saved}.</span> It counts as projected on Home until Merlin confirms it.
            </span>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <Card>
            <Label>New case</Label>

            <div className="mt-3">
              <label htmlFor="log-client" className="block text-[12px] text-muted">
                Client
              </label>
              <input
                id="log-client"
                type="text"
                autoComplete="off"
                value={draft.clientName}
                onChange={(e) => set({ clientName: e.target.value })}
                placeholder="e.g. Alicia Teo"
                aria-invalid={!!errors.client}
                className={`${FIELD} ${border(!!errors.client)} mt-[5px] px-3.5 py-[11px] text-[15px] text-ink placeholder:font-normal placeholder:text-muted`}
              />
              {errors.client && <div className="mt-[5px] text-[12px] text-warn">{errors.client}</div>}
              {showMatches && (
                <div className="mt-[7px] overflow-hidden rounded-xl border border-line">
                  <div className="bg-canvas px-3 pb-[7px] pt-2 text-[10px] font-bold uppercase tracking-[.07em] text-muted">
                    {matches.length === 1 ? "1 matching client" : `${matches.length} matching clients`}
                  </div>
                  {matches.map((c) => {
                    const since = parseISODate(c.since);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => set({ clientName: c.name })}
                        className="flex w-full items-center justify-between gap-2.5 border-t border-line bg-white px-3 py-2.5 text-left"
                      >
                        <span className="block min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-ink">{c.name}</span>
                          <span className="tnum mt-0.5 block text-[11px] text-muted">
                            Client since {shortDate(since)} {since.getFullYear()}
                          </span>
                        </span>
                        <Chevron />
                      </button>
                    );
                  })}
                </div>
              )}
              {showNewClient && <div className="tnum mt-[7px] text-[11px] text-muted">No existing client matches. This will be logged as a new client.</div>}
            </div>

            <div className="mt-[13px]">
              <div className="text-[12px] text-muted">Insurer and product</div>
              <ProductButton product={product} onClick={() => setPicker(true)} invalid={!!errors.product} bordered className="mt-[5px]" />
              {errors.product && <div className="mt-[5px] text-[12px] text-warn">{errors.product}</div>}
            </div>

            <div className="mt-[13px] grid grid-cols-[1fr_104px] gap-[9px]">
              <div>
                <label htmlFor="log-premium" className="block text-[12px] text-muted">
                  {amountLabelFor(product)}
                </label>
                <div className="relative mt-[5px] flex items-center">
                  <span className="tnum pointer-events-none absolute left-[13px] text-[15px] font-semibold text-[#9aa1b1]" aria-hidden="true">
                    S$
                  </span>
                  <input
                    id="log-premium"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={draft.premium}
                    onChange={(e) => set({ premium: e.target.value, premiumTouched: e.target.value !== "" })}
                    placeholder="0"
                    aria-invalid={!!errors.premium}
                    className={`${FIELD} ${border(!!errors.premium)} tnum py-[11px] pl-[42px] pr-3.5 text-[17px] font-semibold text-ink placeholder:font-normal placeholder:text-muted`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="log-term" className="block text-[12px] text-muted">
                  {product?.category === "fund" && !isSingle ? "Years" : "Term (yrs)"}
                </label>
                <input
                  id="log-term"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  disabled={isSingle}
                  value={isSingle ? "1" : draft.term}
                  onChange={(e) => set({ term: e.target.value })}
                  aria-invalid={!!errors.term}
                  className={`${FIELD} ${border(!!errors.term)} tnum mt-[5px] px-3.5 py-[11px] text-[17px] font-semibold text-ink disabled:bg-canvas disabled:text-muted`}
                />
              </div>
            </div>
            {amountMessage && <div className="mt-[5px] text-[12px] text-warn">{amountMessage}</div>}

            <div className="mt-[13px]">
              <label htmlFor="log-date" className="block text-[12px] text-muted">
                Submitted on
              </label>
              <input
                id="log-date"
                type="date"
                max={toISODate(TODAY)}
                value={draft.submittedOn}
                onChange={(e) => set({ submittedOn: e.target.value })}
                aria-invalid={!!errors.date}
                className={`${FIELD} ${border(!!errors.date)} tnum mt-[5px] appearance-none px-3.5 py-[11px] text-[15px] font-medium text-ink`}
              />
              {errors.date && <div className="mt-[5px] text-[12px] text-warn">{errors.date}</div>}
            </div>

            <div className="mt-3.5 rounded-xl bg-canvas px-[13px] py-3">
              <Label>What this case adds</Label>
              {preview && product ? (
                <>
                  <div className="mt-[9px] grid grid-cols-3 gap-px overflow-hidden rounded-[10px] bg-line">
                    <div className="bg-white px-2.5 py-[9px]">
                      <div className="text-[10px] text-muted">Commission</div>
                      <div className="tnum mt-0.5 text-[14px] font-bold text-accent">{sgd(preview.commission)}</div>
                    </div>
                    <div className="bg-white px-2.5 py-[9px]">
                      <div className="text-[10px] text-muted">MDRT premium</div>
                      <div className="tnum mt-0.5 text-[14px] font-bold text-ink">{sgd(preview.mdrt_premium)}</div>
                    </div>
                    <div className="bg-white px-2.5 py-[9px]">
                      <div className="text-[10px] text-muted">WAPE</div>
                      <div className="tnum mt-0.5 text-[14px] font-bold text-ink">{sgd(preview.wape)}</div>
                    </div>
                  </div>
                  <div className="tnum mt-[9px] text-pretty text-[11px] leading-[1.5] text-muted">
                    Gross revenue estimated at {sgd(preview.gross_revenue)} (rate {product.comm_rate}, a placeholder) and commission at {advisor.banding_code} ·{" "}
                    {pct(bandingRate(advisor.banding_code))}. Merlin's figure replaces it on confirmation.
                  </div>
                </>
              ) : (
                <div className="mt-[7px] text-[12px] leading-[1.5] text-muted">Pick a product and an amount to see what this case adds.</div>
              )}
            </div>

            <button type="submit" className="btn-primary mt-[13px] block w-full rounded-xl p-3.5 text-center text-[15px] font-semibold">
              Log case
            </button>
            <div className="mt-[9px] text-pretty text-center text-[11px] leading-[1.5] text-muted">
              Saved as pending until it appears in Merlin. Gross revenue is an estimate until then.
            </div>
          </Card>
        </form>

        <section className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex items-baseline justify-between gap-2.5 px-4 pb-[11px] pt-3.5">
            <Label>Waiting on Merlin</Label>
            <span className="tnum shrink-0 text-[11px] text-muted">{sgd(pendingCommission)} projected</span>
          </div>

          {pending.length === 0 && <div className="px-4 pb-4 text-[13px] text-muted">Nothing pending. Everything you have logged is in Merlin.</div>}

          {pending.map((c) => {
            const p = productById(c.product_id);
            const regular = p?.premium_type === "regular";
            return (
              <div key={c.id} className="border-t border-line px-4 pb-[13px] pt-3">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-ink">{c.client_name}</span>
                      <span className="shrink-0 rounded bg-warn/12 px-1 py-[2px] text-[9px] font-bold uppercase tracking-[.05em] text-warn">Pending</span>
                    </div>
                    <div className="mt-[3px] truncate text-[12px] text-muted">
                      {p ? `${insurerName(p)} · ${p.name}` : c.product_id}
                    </div>
                    <div className="tnum mt-0.5 text-[12px] text-muted">
                      {sgd(c.premium_amount)}
                      {regular ? `/yr × ${c.premium_term_years} yrs` : " single"} · submitted {shortDate(parseISODate(c.submitted_on))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tnum text-[15px] font-bold text-ink">{sgd(metricsForCase(c).commission)}</div>
                    <div className="text-[10px] text-muted">commission</div>
                    <button type="button" onClick={() => onRemove(c.id)} className="-mx-2 -mb-2 mt-[5px] px-2 py-2 text-[11px] font-semibold text-muted hover:text-body">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <ProductPicker open={picker} title="Insurer and product" selectedId={draft.productId || undefined} onPick={pickProduct} onClose={() => setPicker(false)} />
    </>
  );
}
