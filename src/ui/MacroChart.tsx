import { formatNumber, macroEnergyShare, type Nutrients } from '../calc';

const PARTS = [
  { key: 'protein', label: 'Белки', color: 'var(--chart-protein)' },
  { key: 'fat', label: 'Жиры', color: 'var(--chart-fat)' },
  { key: 'carbs', label: 'Углеводы', color: 'var(--chart-carbs)' },
] as const;

const R = 40;
const C = 2 * Math.PI * R;

/**
 * Доли белков, жиров и углеводов в калорийности (по формуле Б×4, Ж×9, У×4), кольцевая диаграмма.
 * Подписи с процентами дублируют диаграмму текстом.
 */
export function MacroChart({ nutrients }: { nutrients: Nutrients | null }) {
  const share = nutrients ? macroEnergyShare(nutrients) : null;
  if (!share) {
    return <p className="hint">Диаграмма БЖУ появится, когда в блюде будут продукты с весом.</p>;
  }
  let offset = 0;
  return (
    <figure className="macro-chart">
      <svg viewBox="0 0 100 100" width="120" height="120" aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {PARTS.map(({ key, color }) => {
          const len = (share[key] / 100) * C;
          const el = (
            <circle
              key={key}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <figcaption>
        <p className="macro-title">Доля в калорийности</p>
        <ul className="macro-legend">
          {PARTS.map(({ key, label, color }) => (
            <li key={key}>
              <span className="macro-swatch" style={{ background: color }} aria-hidden="true" />
              {label}: {formatNumber(share[key], 0)} %
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
