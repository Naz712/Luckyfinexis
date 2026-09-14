import { useState } from "react";
import { insurers, products, type Product } from "../mock/data";
import { sgd } from "../lib/format";
import Sheet from "./Sheet";

export const CATEGORY_LABEL: Record<Product["category"], string> = {
  life: "Life",
  ilp: "ILP",
  health: "Health",
  endowment: "Endowment",
  fund: "Investment",
};

export function insurerName(product: Product): string {
  return insurers.find((i) => i.id === product.insurer_id)?.name ?? "";
}

/** Every product whose name, insurer or category contains the query, case-insensitively. Empty query = all. */
export function searchProducts(query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter((p) => p.name.toLowerCase().includes(q) || insurerName(p).toLowerCase().includes(q) || CATEGORY_LABEL[p.category].toLowerCase().includes(q));
}

function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`shrink-0 text-[#c3c8d4] ${className}`}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryPill({ product }: { product: Product }) {
  return <span className="rounded-[5px] bg-accent-soft px-1.5 py-[3px] text-[10px] font-semibold text-accent">{CATEGORY_LABEL[product.category]}</span>;
}

/**
 * The tappable product row that opens the picker: insurer eyebrow, product
 * name, category pill and a chevron. Without a product it reads as a
 * placeholder ("Choose an insurer and product").
 */
export function ProductButton({
  product,
  onClick,
  invalid = false,
  bordered = true,
  className = "",
}: {
  product: Product | undefined;
  onClick: () => void;
  invalid?: boolean;
  /** Bordered field look (Log) versus a bare card row (Calculator). */
  bordered?: boolean;
  className?: string;
}) {
  const frame = bordered ? `rounded-xl border bg-white px-3.5 py-[11px] ${invalid ? "border-warn" : "border-line"}` : "bg-white px-4 py-[13px]";
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className={`flex w-full items-center justify-between gap-2.5 text-left ${frame} ${className}`}>
      <span className="block min-w-0">
        {product && <span className="block text-[10px] font-bold uppercase tracking-[.08em] text-muted">{insurerName(product)}</span>}
        <span className={`block truncate text-[15px] ${product ? "mt-0.5 font-semibold text-ink" : "font-normal text-[#9aa1b1]"}`}>{product ? product.name : "Choose an insurer and product"}</span>
      </span>
      <span className="flex shrink-0 items-center gap-[7px]">
        {product && <CategoryPill product={product} />}
        <Chevron />
      </span>
    </button>
  );
}

/** Bottom sheet listing all products with one search across name, insurer and category. */
export function ProductPicker({
  open,
  title,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  selectedId?: string;
  onPick: (product: Product) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const close = () => {
    setQuery("");
    onClose();
  };
  const found = searchProducts(query);
  const q = query.trim();
  return (
    <Sheet open={open} onClose={close} label={title}>
      <div className="shrink-0 px-5">
        <div className="mt-[9px] flex items-baseline justify-between gap-2.5">
          <span className="text-[17px] font-bold tracking-[-.01em] text-ink">{title}</span>
          <button type="button" onClick={close} className="shrink-0 text-[13px] font-semibold text-accent">
            Cancel
          </button>
        </div>
        <div className="mt-[11px] border-b border-line pb-[11px]">
          <div className="relative flex items-center">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="absolute left-3 text-[#9aa1b1]">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              autoComplete="off"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search insurer or product"
              aria-label="Search insurer or product"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-[38px] text-[14px] text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/16"
            />
            {query !== "" && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2.5 grid h-5 w-5 place-items-center rounded-full bg-canvas text-muted">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="tnum mt-[7px] text-[11px] text-muted">
            {q ? `${found.length} ${found.length === 1 ? "product" : "products"} matching “${q}”` : `${products.length} products across ${insurers.length} insurers`}
          </div>
        </div>
      </div>
      <ul className="flex-1 overflow-auto px-5 pb-[26px] pt-1">
        {found.map((p) => {
          const selected = p.id === selectedId;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onPick(p);
                }}
                aria-pressed={selected}
                className={`flex w-full items-center justify-between gap-2.5 border-b border-line py-[13px] text-left ${selected ? "bg-accent-soft/55" : "bg-white"}`}
              >
                <span className="block min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">{p.name}</span>
                  <span className="tnum mt-[3px] block text-[11px] text-muted">
                    {insurerName(p)} · typical {sgd(p.typical_premium)} · rate {p.comm_rate}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <CategoryPill product={p} />
                  {selected && (
                    <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-accent text-white" aria-hidden="true">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {found.length === 0 && <li className="py-6 text-center text-[13px] text-muted">No product matches that search.</li>}
      </ul>
    </Sheet>
  );
}
