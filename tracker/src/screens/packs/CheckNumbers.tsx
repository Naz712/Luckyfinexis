// Meeting Pack, screen 3: Check numbers. Every figure the pipeline read out
// of the recap, the sketch or the notes is shown beside a crop of its
// original; the consultant confirms each one, and only then can the report
// be approved. Pure view: the container owns the numbers and the approval.
import { SOURCE_LABEL, type PackNumber, type PackSource } from "../../mock/packs";
import { assetUrl, PackHeader, PinnedBar, SourceGlyph } from "./shared";
import type { CheckNumbersProps } from "./types";

/** How the intro names each element, in the handoff's order. */
const SOURCE_PHRASE: Record<PackSource, string> = { recap: "your recap", photo: "the sketch", document: "the notes", typed: "the typed lines" };
const SOURCE_ORDER: PackSource[] = ["recap", "photo", "document", "typed"];

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** "three" for the small counts the copy spells out, digits beyond that. */
const spelled = (n: number) => WORDS[n] ?? String(n);

/** "a", "a and b", "a, b and c" */
function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function Tick({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NumberCard({ number, onToggle }: { number: PackNumber; onToggle: () => void }) {
  const on = number.confirmed;
  return (
    <li className={`rounded-2xl border-[1.5px] bg-surface p-3.5 transition-colors duration-200 ${on ? "border-ok/45" : "border-line"}`}>
      <div className="flex items-center gap-3">
        {number.crop_url ? (
          <img src={assetUrl(number.crop_url)} alt={`Crop of the original for ${number.label}`} width={72} height={54} className="h-[54px] w-[72px] shrink-0 rounded-[10px] border border-line object-cover" />
        ) : (
          // Heard or typed, so there is no original to crop: the source glyph stands in.
          <span className="grid h-[54px] w-[72px] shrink-0 place-items-center rounded-[10px] border border-line bg-canvas text-muted" aria-hidden="true">
            <SourceGlyph source={number.source} size={20} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-bold uppercase tracking-[.06em] text-muted">{number.label}</span>
          <span className="tnum mt-0.5 block text-[19px] font-bold leading-tight tracking-[-.01em] text-ink">{number.value}</span>
        </span>
        {/* 34px tick on a 44px hit target. */}
        <button type="button" aria-pressed={on} aria-label={`Confirm ${number.label}`} onClick={onToggle} className="-m-[5px] grid h-11 w-11 shrink-0 place-items-center">
          <span className={`grid h-[34px] w-[34px] place-items-center rounded-full border-[1.5px] transition-colors duration-[180ms] ${on ? "border-ok bg-ok text-white" : "border-line bg-surface text-faint"}`}>
            <Tick />
          </span>
        </button>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2.5 border-t border-well pt-2.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex shrink-0 items-center gap-1 rounded-[5px] bg-canvas px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[.05em] text-muted">
            <SourceGlyph source={number.source} size={11} />
            {SOURCE_LABEL[number.source]}
          </span>
          <span className="truncate text-[12px] text-muted">{number.source_note}</span>
        </span>
        <span className={`shrink-0 text-[11px] font-bold ${on ? "text-ok" : "text-warn"}`}>{on ? "Confirmed" : "Tap to confirm"}</span>
      </div>
    </li>
  );
}

export default function CheckNumbers({ pack, numbers, onToggle, onApprove, onBack, extra }: CheckNumbersProps) {
  const n = numbers.length;
  const k = numbers.filter((x) => x.confirmed).length;
  const all = k === n;
  const left = n - k;
  const present = SOURCE_ORDER.filter((s) => numbers.some((x) => x.source === s));

  const helper = all
    ? `All ${spelled(n)} confirmed. Approving saves the report and keeps the attachments.`
    : `Confirm the ${left === 1 ? "last number" : "remaining numbers"} to approve. ${k} of ${n} done.`;

  return (
    <>
      <PackHeader
        title={`Check ${n} ${n === 1 ? "number" : "numbers"}`}
        extra={extra}
        progress={n > 0 ? k / n : 1}
        onBack={{ label: "Report", onClick: onBack }}
        note={
          <>
            {k} of {n}
            <br />
            confirmed
          </>
        }
      />

      <div className="flex flex-col gap-3 px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3.5">
        <p className="px-0.5 text-[12px] leading-[1.55] text-muted [text-wrap:pretty]">
          These came out of {listJoin(present.map((s) => SOURCE_PHRASE[s]))}. Check each one against the original before the report goes in front of {firstName(pack.client_name)}.
        </p>

        <ul className="flex flex-col gap-3">
          {numbers.map((x) => (
            <NumberCard key={x.id} number={x} onToggle={() => onToggle(x.id)} />
          ))}
        </ul>

        <div className="flex items-start gap-[9px] rounded-[14px] bg-accent-soft px-3.5 py-3">
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 7v4.4M8 4.6v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <p className="min-w-0 text-[12px] leading-[1.5] text-ink [text-wrap:pretty]">
            Tap a number to change it. The original photo and notes stay attached, so you can always check them again later.
          </p>
        </div>
      </div>

      <PinnedBar>
        <button
          type="button"
          disabled={!all}
          onClick={onApprove}
          className={`block w-full rounded-xl py-3.5 text-center text-[15px] font-semibold ${all ? "btn-primary" : "bg-accent-soft text-faint"}`}
        >
          Approve report
        </button>
        <p className="tnum mt-[9px] text-center text-[11px] leading-[1.45] text-muted [text-wrap:pretty]" aria-live="polite">
          {helper}
        </p>
      </PinnedBar>
    </>
  );
}
