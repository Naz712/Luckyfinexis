// Pieces the Meeting Pack screens share: the screen header (same chrome as
// App's header, drawn here because Packs owns its own sub-navigation), the
// icon-only source markers with their legend, the pinned action bar, the
// processing spinner and a toast.
import type { ReactNode } from "react";
import { SOURCE_LABEL, SOURCE_LONG, type PackSource } from "../../mock/packs";

/** Same header as the rest of the app: eyebrow, 22px title, right-aligned two-line note; optional progress rule beneath. */
export function PackHeader({
  title,
  note,
  extra,
  progress,
  onBack,
}: {
  title: string;
  /** Right-hand note; use <br /> for two lines. */
  note: ReactNode;
  /** The view-switch pill the shell passes down. */
  extra?: ReactNode;
  /** 0..1 fills a 4px rule under the header (Check numbers). */
  progress?: number;
  /** Shows a "‹ Back" control above the eyebrow. */
  onBack?: { label: string; onClick: () => void };
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface px-5 pb-3 pt-[max(6px,env(safe-area-inset-top))]">
      {onBack && (
        <button type="button" onClick={onBack.onClick} className="-ml-1 mb-1 flex items-center gap-0.5 rounded px-1 py-0.5 text-[12px] font-semibold text-accent">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {onBack.label}
        </button>
      )}
      <div className="flex items-end justify-between gap-2.5">
        <div className="min-w-0">
          <div className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[.13em] text-accent">Finexis tracker</div>
          <h1 className="mt-0.5 text-[22px] font-bold leading-tight tracking-[-.015em] text-ink">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          <div className="tnum whitespace-nowrap text-right text-[11px] leading-[1.45] text-muted">{note}</div>
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
          <span className="block h-full rounded-full bg-accent transition-[width] duration-[350ms] ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </header>
  );
}

/** The four element glyphs: microphone, framed squiggle, document, pencil. 12px on a 16 grid. */
export function SourceGlyph({ source, size = 12 }: { source: PackSource; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true as const };
  switch (source) {
    case "recap":
      return (
        <svg {...p}>
          <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "photo":
      return (
        <svg {...p}>
          <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 10c1.5-3 2.5-3 4 0s2.5 3 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "document":
      return (
        <svg {...p}>
          <path d="M4 1.5h5.5L13 5v9.5H4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M9.5 1.5V5H13M6 8h5M6 11h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "typed":
      return (
        <svg {...p}>
          <path d="M3 11.5l7.6-7.6a1.4 1.4 0 0 1 2 2L5 13.5H3v-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
  }
}

/** Icon-only marker: 22px canvas tile with the glyph; the accessible name says which element it came from. */
export function SourceMarker({ source }: { source: PackSource }) {
  return (
    <span role="img" aria-label={SOURCE_LONG[source]} title={SOURCE_LONG[source]} className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-canvas text-muted">
      <SourceGlyph source={source} />
    </span>
  );
}

/** Decodes the markers once, at the top of a report: "READ FROM" + glyph and word for each element used. */
export function SourceLegend({ sources }: { sources: PackSource[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[14px] bg-surface px-3.5 py-[11px]">
      <span className="text-[11px] font-bold uppercase tracking-[.07em] text-muted">Read from</span>
      {sources.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-[12px] text-body">
          <SourceMarker source={s} />
          {SOURCE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/** White bar pinned between content and the tab bar, holding a screen's primary action. */
export function PinnedBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom))] z-10 mx-auto w-full max-w-[430px] border-t border-line bg-surface px-4 pb-3 pt-3">
      {children}
    </div>
  );
}

/** 26px ring spinner, 900 ms linear. */
export function Spinner({ size = 26 }: { size?: number }) {
  return <span className="spin block shrink-0 rounded-full border-[2.5px] border-accent-soft border-t-accent" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Initials for a 30–36px avatar: "SW". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Short bottom toast for stand-in actions ("In the app this…"). */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="drop-in fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-30 mx-auto w-fit max-w-[calc(100%-32px)] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-body shadow-[0_10px_30px_-14px_rgba(20,35,94,.45)]">
      {message}
    </div>
  );
}
