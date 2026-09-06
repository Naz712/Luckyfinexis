import { useId } from "react";

export interface BarPoint {
  label: string;
  longLabel: string;
  value: number;
  detail: string;
}

/**
 * Single-series column chart. The current (last) bar wears the accent; the rest
 * are de-emphasised. Tap a bar to select it: only the selected bar carries a
 * value label. Bars are at most 24px wide with rounded data-ends, square at the
 * baseline, and a 2px surface gap. A visually hidden table carries the values.
 */
export default function BarChart({
  points,
  selected,
  onSelect,
  formatValue,
  formatTick,
  title,
}: {
  points: BarPoint[];
  selected: number;
  onSelect: (i: number) => void;
  formatValue: (v: number) => string;
  formatTick: (v: number) => string;
  title: string;
}) {
  const id = useId();
  const W = 340;
  const H = 168;
  const left = 38;
  const right = 6;
  const top = 20;
  const bottom = 22;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const baseline = top + plotH;

  const rawMax = Math.max(...points.map((p) => p.value), 0);
  const max = niceCeil(rawMax);
  const ticks = max > 0 ? [0, max / 2, max] : [0];
  const y = (v: number) => baseline - (max > 0 ? (v / max) * plotH : 0);

  const n = points.length;
  const slot = plotW / n;
  const barW = Math.min(24, Math.max(6, slot - 8));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-title`} className="block h-auto w-full select-none">
        <title id={`${id}-title`}>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="var(--color-muted)" className="tnum">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = left + slot * i + slot / 2;
          const x = cx - barW / 2;
          const isCurrent = i === n - 1;
          const isSelected = i === selected;
          const h = Math.max(0, baseline - y(p.value));
          const r = Math.min(4, barW / 2, h);
          const fill = isCurrent ? "var(--color-accent)" : isSelected ? "color-mix(in oklab, var(--color-accent) 60%, transparent)" : "color-mix(in oklab, var(--color-accent) 25%, transparent)";
          const path =
            h > 0
              ? `M${x},${baseline} V${baseline - h + r} Q${x},${baseline - h} ${x + r},${baseline - h} H${x + barW - r} Q${x + barW},${baseline - h} ${x + barW},${baseline - h + r} V${baseline} Z`
              : "";
          return (
            <g key={i} onClick={() => onSelect(i)} className="cursor-pointer">
              {/* hit target wider than the mark */}
              <rect x={left + slot * i} y={top} width={slot} height={plotH + bottom} fill="transparent" />
              {h > 0 ? (
                <path d={path} fill={fill} stroke="var(--color-white)" strokeWidth={2} paintOrder="stroke" />
              ) : (
                <rect x={x} y={baseline - 2} width={barW} height={2} fill="var(--color-line)" />
              )}
              {isSelected && (
                <text x={cx} y={y(p.value) - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--color-ink)" className="tnum">
                  {formatValue(p.value)}
                </text>
              )}
              <text
                x={cx}
                y={baseline + 14}
                textAnchor="middle"
                fontSize={9}
                fontWeight={isCurrent || isSelected ? 600 : 400}
                fill={isCurrent || isSelected ? "var(--color-body)" : "var(--color-muted)"}
              >
                {p.label}
              </text>
            </g>
          );
        })}
        <line x1={left} x2={W - right} y1={baseline} y2={baseline} stroke="var(--color-line)" strokeWidth={1} />
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Value</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td>{p.longLabel}</td>
              <td>{formatValue(p.value)}</td>
              <td>{p.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Round up to a tidy axis maximum (1, 2, 2.5, 5 × 10^k). */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * base) return m * base;
  return 10 * base;
}
