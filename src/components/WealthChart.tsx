import { useState } from 'react';
import { wealthYearTicks, type WealthSeriesPoint } from '@/core/wealth';

interface Props {
  /** Relevés du plus ancien au plus récent (au moins deux). */
  points: WealthSeriesPoint[];
  format: (value: number) => string;
  /** Libellé accessible du graphique. */
  label: string;
  /** Libellé ajouté aux valeurs estimées dans l'infobulle. */
  estimatedLabel: string;
}

const WIDTH = 640;
const HEIGHT = 180;
const PAD = { top: 18, right: 14, bottom: 24, left: 14 };

/**
 * Courbe du patrimoine net (épargne + créances − dettes) — SVG simple, donc
 * imprimable tel quel et sans dépendance de graphiques. Les repères annuels
 * séparent les années et une infobulle au survol donne la date, la valeur et
 * l'origine estimée éventuelle.
 */
export default function WealthChart({ points, format, label, estimatedLabel }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const nets = points.map((point) => point.net);
  const max = Math.max(...nets);
  const min = Math.min(...nets);
  const span = max - min || Math.max(1, Math.abs(max));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => PAD.top + plotHeight - ((value - min) / span) * plotHeight;
  const baseline = PAD.top + plotHeight;

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.net).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z`;

  const first = points[0].date.slice(0, 7);
  const last = points[points.length - 1].date.slice(0, 7);
  const ticks = wealthYearTicks(points);

  /** Index du relevé le plus proche du pointeur (coordonnées viewBox). */
  const indexAt = (event: React.MouseEvent<SVGSVGElement>): number => {
    const box = event.currentTarget.getBoundingClientRect();
    const viewX = ((event.clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(x(index) - viewX) < Math.abs(x(best) - viewX)) best = index;
    }
    return best;
  };

  const hovered = hover === null ? null : points[hover];
  const tooltipLeft = hover === null ? 0 : (x(hover) / WIDTH) * 100;
  const tooltipTop = hover === null ? 0 : (y(hovered!.net) / HEIGHT) * 100;
  const tooltipSide = hover === null ? 'center' : x(hover) < 90 ? 'left' : x(hover) > WIDTH - 90 ? 'right' : 'center';
  const tooltipShift =
    tooltipSide === 'center'
      ? 'translate(-50%, -135%)'
      : tooltipSide === 'left'
        ? 'translate(0, -135%)'
        : 'translate(-100%, -135%)';

  return (
    <figure className="relative mt-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={label}
        onMouseMove={(event) => setHover(indexAt(event))}
        onMouseLeave={() => setHover(null)}
      >
        {/* Repères annuels : séparation verticale et millésime. */}
        {ticks.map(({ index, year }) => (
          <g key={`${year}-${index}`}>
            {index > 0 && (
              <line
                x1={x(index)}
                y1={PAD.top}
                x2={x(index)}
                y2={baseline}
                stroke="#dce6dc"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
            )}
            <text
              x={x(index)}
              y={baseline - 6}
              fontSize={10}
              fill="#8b9a8b"
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            >
              {year}
            </text>
          </g>
        ))}

        <line x1={PAD.left} y1={baseline} x2={WIDTH - PAD.right} y2={baseline} stroke="#d6e0d6" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={baseline} stroke="#e8efe8" strokeWidth={1} />
        <path d={area} fill="#15803d" fillOpacity={0.1} />

        {/* Guide vertical sur le relevé survolé. */}
        {hover !== null && (
          <line
            x1={x(hover)}
            y1={PAD.top}
            x2={x(hover)}
            y2={baseline}
            stroke="#15803d"
            strokeWidth={1}
            strokeOpacity={0.45}
          />
        )}

        <path d={line} fill="none" stroke="#15803d" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => (
          <g key={point.date}>
            <circle
              cx={x(index)}
              cy={y(point.net)}
              r={hover === index ? 5 : 3.5}
              fill={point.estimated ? '#ffffff' : '#15803d'}
              stroke="#15803d"
              strokeWidth={1.5}
            >
              <title>{`${point.date} — ${format(point.net)}${point.estimated ? ' *' : ''}`}</title>
            </circle>
          </g>
        ))}
        <text x={PAD.left} y={PAD.top - 6} fontSize={11} fill="#4b5563">
          {format(max)}
        </text>
        <text x={WIDTH - PAD.right} y={PAD.top - 6} fontSize={11} fill="#4b5563" textAnchor="end">
          {format(min)}
        </text>
        <text x={PAD.left} y={HEIGHT - 6} fontSize={11} fill="#4b5563">
          {first}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} fontSize={11} fill="#4b5563" textAnchor="end">
          {last}
        </text>
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded border border-sage-200 bg-white px-2 py-1 text-[11px] shadow-sm"
          style={{ left: `${tooltipLeft}%`, top: `${tooltipTop}%`, transform: tooltipShift }}
          role="status"
        >
          <span className="font-semibold text-forest-900">{format(hovered.net)}</span>
          <span className="ml-1 text-sage-600">{hovered.date}</span>
          {hovered.estimated && <span className="ml-1 text-sage-500">{estimatedLabel}</span>}
        </div>
      )}
    </figure>
  );
}
