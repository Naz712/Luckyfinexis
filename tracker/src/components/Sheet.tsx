import { useEffect, useRef, type ReactNode } from "react";

/**
 * Bottom sheet over a scrim. Slides up in 320 ms, the scrim fades in 200 ms.
 * Dismiss by tapping the scrim, pressing Escape, or whatever the content
 * offers (Cancel, Done). Focus moves into the sheet when it opens.
 */
export default function Sheet({
  open,
  onClose,
  label,
  height = "min(660px, 92dvh)",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  height?: number | string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 mx-auto w-full max-w-[430px]">
      <button type="button" aria-label="Close" onClick={onClose} className="fade-in absolute inset-0 w-full bg-[rgba(13,23,56,.42)]" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="sheet-up absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-white shadow-[0_-8px_32px_rgba(13,23,56,.18)] focus:outline-none"
        style={{ height, maxHeight: "92dvh" }}
      >
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
