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
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Small line above the title: "This year · Jan–Dec 2026". */
  eyebrow?: string;
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
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-5 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="truncate text-[10px] font-bold uppercase tracking-[.1em] text-muted">{eyebrow}</div>}
          <h2 className="truncate text-[20px] font-bold leading-tight tracking-[-.015em] text-ink">{title}</h2>
        </div>
        <button type="button" onClick={close} className="shrink-0 rounded-full bg-accent-soft px-3.5 py-1.5 text-[13px] font-semibold text-accent hover:bg-accent/15">
          Done
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}
