// Screen 5: an attachment full-size over the dimmed report. The whiteboard
// photo uncropped (contain) on a translucent ground; a PDF as its pages
// stacked in a scrollable box. A modal dialog: labelled, focus moves to Close
// and stays inside, dismissed by Close, the scrim or Escape.
import { useEffect, useRef } from "react";
import type { Attachment } from "../../mock/packs";

/** Attachment paths are relative to the app's base URL (which ends with "/"). */
const BASE = import.meta.env.BASE_URL;

export default function AttachmentViewer({ open, attachment, onClose }: { open: boolean; attachment: Attachment | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // onClose is read through a ref so a fresh callback each render does not re-run the effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Keep Tab inside the dialog: the scrim button and Close are the only stops.
      const stops = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button"));
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!dialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open || !attachment) return null;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={attachment.title} className="fixed inset-0 z-30 mx-auto w-full max-w-[430px]">
      <button type="button" aria-label="Close" onClick={onClose} className="fade-in absolute inset-0 w-full bg-[rgba(13,23,56,.86)]" />
      {/* The column lets taps through to the scrim; only its own pieces take pointer events. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <div className="pointer-events-auto flex shrink-0 items-center justify-between gap-2.5 px-4 pb-3 pt-[max(18px,env(safe-area-inset-top))]">
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[.12em] text-white/60">Attachment</span>
            <span className="mt-[3px] block truncate text-[15px] font-semibold text-white">{attachment.title}</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/16 px-[13px] py-2 text-[13px] font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center px-3">
          {attachment.kind === "photo" ? (
            <div className="scale-in pointer-events-auto h-[62dvh] max-h-full w-full overflow-hidden rounded-[14px] bg-white/6">
              <img src={BASE + (attachment.urls[0] ?? "")} alt={attachment.title} className="block h-full w-full object-contain" />
            </div>
          ) : (
            <div className="scale-in pointer-events-auto flex h-[62dvh] max-h-full w-full flex-col gap-2 overflow-y-auto rounded-[14px] bg-white/6 p-2">
              {attachment.urls.map((url, i) => (
                <img key={url} src={BASE + url} alt={`${attachment.title}, page ${i + 1}`} className="block w-full rounded-lg bg-white/6" />
              ))}
            </div>
          )}
        </div>

        <div className="pointer-events-auto shrink-0 px-4 pb-[max(26px,env(safe-area-inset-bottom))] pt-3.5">
          <div className="tnum text-[12px] text-white/85">
            {attachment.title} · {attachment.caption}
          </div>
          {attachment.chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {attachment.chips.map((c) => (
                <span key={c} className="tnum whitespace-nowrap rounded-full bg-white/14 px-2.5 py-[5px] text-[11px] font-semibold text-white">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
