import type { ReactNode, SelectHTMLAttributes } from "react";

export function Card({
  children,
  className = "",
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  /** "accent" = solid brand-blue card with white text (used for the one number that matters on a screen). */
  tone?: "default" | "accent";
}) {
  const surface = tone === "accent" ? "bg-accent border-accent text-white" : "bg-white border-line";
  return <section className={`rounded-2xl border p-4 ${surface} ${className}`}>{children}</section>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{children}</div>;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  placeholder: string;
  options: { value: string; label: string }[];
}

/** Native select styled as a tappable row — best keyboard/mobile behaviour without a dependency. */
export function Select({ placeholder, options, className = "", ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={`w-full appearance-none rounded-xl border border-line bg-white px-3.5 py-3 pr-9 text-[15px] text-body disabled:bg-canvas disabled:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${rest.value === "" ? "text-muted" : ""} ${className}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function MoneyInput({
  value,
  onChange,
  placeholder = "0",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) {
  return (
    <div className="flex items-center rounded-xl border border-line bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <span className="pl-3.5 pr-1 text-[15px] text-muted">S$</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={100}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="tnum w-full bg-transparent py-3 pr-3.5 text-[17px] font-semibold text-ink placeholder:font-normal placeholder:text-muted/60 focus:outline-none"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-1 rounded-xl bg-canvas p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg px-1 py-2 text-center transition-colors ${
              active ? "bg-white text-accent shadow-sm border border-line" : "text-muted hover:text-body border border-transparent"
            }`}
          >
            <div className="text-[13px] font-semibold leading-none">{o.label}</div>
            {o.hint && <div className={`tnum mt-1 text-[10px] leading-none ${active ? "text-accent/80" : "text-muted/80"}`}>{o.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function Stub({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="text-lg font-semibold text-ink">{title}</div>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}
