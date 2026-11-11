import { formatNumber, formatNutrient, macroEnergyShare, type Nutrients } from '../calc';

const PARTS = [
  { key: 'protein', label: 'Белки', color: 'var(--chart-protein)' },
  { key: 'fat', label: 'Жиры', color: 'var(--chart-fat)' },
  { key: 'carbs', label: 'Углеводы', color: 'var(--chart-carbs)' },
] as const;

const R = 40;
const C = 2 * Math.PI * R;

/**
 * Пищевая ценность на 100 г: в центре кольца калорийность, кольцо — доли белков, жиров
 * и углеводов в калорийности (по формуле Б×4, Ж×9, У×4). Плашки под кольцом повторяют
 * диаграмму текстом: граммы и доля в процентах.
 */
export function MacroChart({ nutrients }: { nutrients: Nutrients | null }) {
  const share = nutrients ? macroEnergyShare(nutrients) : null;
  if (!nutrients || !share) {
    return <p className="hint">Диаграмма БЖУ появится, когда в блюде будут продукты с весом.</p>;
  }
  let offset = 0;
  return (
    <figure className="macro-chart">
      <div className="macro-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
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
                strokeWidth="12"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <p className="macro-ring-label">
          <b>{formatNutrient('kcal', nutrients.kcal)}</b>
          <span>ккал</span>
        </p>
      </div>
      <figcaption>
        <ul className="macro-legend">
          {PARTS.map(({ key, label, color }) => (
            <li key={key} className="macro-chip">
              <span className="macro-chip-label">
                <span className="macro-swatch" style={{ background: color }} aria-hidden="true" />
                {label}
              </span>
              <b>{formatNutrient(key, nutrients[key])} г</b>
              <span className="macro-chip-share">{formatNumber(share[key], 0)} %</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
