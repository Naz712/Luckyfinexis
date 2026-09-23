import { useEffect, useRef, type ReactNode } from "react";

/**
 * A full-screen page pushed over the app: slides in from the right in 320 ms
 * and covers the tab bar. Back (the button, Escape, or the phone's own back
 * gesture) closes it: opening pushes a history entry so the browser's back
 * pops the page rather than leaving the app. Where history is unavailable
 * (some embedded previews) the button closes it directly.
 */
export default function Page({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line above the title: "FWD · Term". */
  eyebrow?: string;
  /** Content, or a function given `close` so a choice inside can close the page the same way Back does. */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  // onClose is read through a ref so a fresh callback each render does not re-run the effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    try {
      window.history.pushState({ finexisPage: true }, "");
      pushed.current = true;
    } catch {
      pushed.current = false;
    }
    const onPop = () => {
      pushed.current = false;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
    // close only reads refs, so the effect needs nothing but `open`.
  }, [open]);

  function close() {
    if (pushed.current) window.history.back();
    else onCloseRef.current();
  }

  if (!open) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="page-in fixed inset-0 z-30 mx-auto flex w-full max-w-[430px] flex-col bg-canvas focus:outline-none sm:border-x sm:border-line"
    >
      <header className="flex shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2 pb-2.5 pt-[max(8px,env(safe-area-inset-top))]">
        <button type="button" onClick={close} className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-2 text-[14px] font-semibold text-accent hover:bg-accent-soft">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <div className="min-w-0 flex-1 pr-2">
          {eyebrow && <div className="truncate text-[10px] font-bold uppercase tracking-[.1em] text-muted">{eyebrow}</div>}
          <h2 className="truncate text-[16px] font-bold leading-tight text-ink">{title}</h2>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{typeof children === "function" ? children(close) : children}</div>
    </div>
  );
}
