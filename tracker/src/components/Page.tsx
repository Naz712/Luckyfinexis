import { useEffect, useRef, type ReactNode } from "react";

/**
 * A full-screen page that slides up over the app (360 ms) and covers the tab
 * bar. Done, Escape or the phone's own back gesture closes it: opening pushes
 * a history entry so the browser's back pops the page rather than leaving the
 * app. Where history is unavailable (some embedded previews) Done closes it
 * directly.
 */
export default function Page({
  open,
  onClose,
  title,
  eyebrow,
  tabs,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line above the title: "Tan Wei Lun · Jan–Dec 2026". */
  eyebrow?: string;
  /** A row under the title that stays put while the page scrolls (the detail sheet's tabs). */
  tabs?: ReactNode;
  children: ReactNode;
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
      className="page-up fixed inset-0 z-30 mx-auto flex w-full max-w-[430px] flex-col bg-canvas focus:outline-none sm:border-x sm:border-line"
    >
      <header className="flex shrink-0 flex-col gap-3 border-b border-line bg-surface px-4 pb-3 pt-[max(8px,env(safe-area-inset-top))]">
        <div className="h-1 w-9 self-center rounded bg-hairline" aria-hidden="true" />
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="truncate text-[11px] font-bold uppercase leading-4 tracking-[.06em] text-muted">{eyebrow}</div>}
            <h2 className="truncate text-[22px] font-extrabold leading-7 text-ink">{title}</h2>
          </div>
          <button type="button" onClick={close} className="h-11 shrink-0 rounded-full bg-accent-soft px-5 text-[14px] font-bold text-accent hover:bg-accent/15">
            Done
          </button>
        </div>
        {tabs}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}
