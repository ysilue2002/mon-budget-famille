/**
 * Relevés de patrimoine (logique pure) — calcul des fins de mois à compléter.
 *
 * L'application n'est pas forcément ouverte le dernier jour du mois : les
 * valorisations manquantes sont donc reconstituées à la prochaine ouverture.
 * Si un relevé antérieur existe, on le reporte tel quel (les montants n'ont pas
 * pu changer sans que l'application soit ouverte). Sinon la valeur du jour sert
 * d'estimation, explicitement marquée comme telle.
 */
import type { WealthSnapshot } from './types';

export interface WealthTotals {
  savings: number;
  receivables: number;
  payables: number;
}

export interface PlannedValuation extends WealthTotals {
  date: string;
  estimated: boolean;
}

export type WealthPoint = Pick<WealthSnapshot, 'date' | 'savings' | 'receivables' | 'payables' | 'estimated'>;

function pad(value: number): string {
  return `${value}`.padStart(2, '0');
}

/** Dernier jour du mois « YYYY-MM ». */
export function lastDayOfMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(year, m, 0).getDate();
  return `${year}-${pad(m)}-${pad(last)}`;
}

/**
 * Fins de mois à valoriser entre `startISO` et `todayISO` : toutes les fins de
 * mois révolues, plus celle du mois courant si elle est atteinte.
 */
export function monthEndsSince(startISO: string, todayISO: string): string[] {
  if (startISO > todayISO) return [];
  const [sy, sm] = startISO.split('-').map(Number);
  const [ty, tm] = todayISO.split('-').map(Number);
  const ends: string[] = [];
  let year = sy;
  let month = sm;
  while (year < ty || (year === ty && month < tm)) {
    ends.push(lastDayOfMonth(`${year}-${pad(month)}`));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  const currentEnd = lastDayOfMonth(`${ty}-${pad(tm)}`);
  if (currentEnd <= todayISO) ends.push(currentEnd);
  return ends;
}

/** Point de la courbe de patrimoine net : relevés déjà consolidés dans `primary`. */
export interface WealthSeriesPoint {
  date: string;
  net: number;
  estimated: boolean;
}

/**
 * Série du patrimoine net (épargne + créances − dettes) des `limit` derniers
 * relevés, dans l'ordre chronologique. Les doublons d'une même date sont
 * ignorés (le dernier relevé fait foi).
 */
export function wealthSeries(points: WealthPoint[], limit = 12): WealthSeriesPoint[] {
  const byDate = new Map<string, WealthSeriesPoint>();
  for (const point of points) {
    byDate.set(point.date, {
      date: point.date,
      net: point.savings + point.receivables - point.payables,
      estimated: Boolean(point.estimated),
    });
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-Math.max(0, limit));
}

/** Repère d'année : index du premier relevé de l'année. */
export interface WealthYearTick {
  index: number;
  year: string;
}

/**
 * Repères annuels d'une série : index de la première valuation de chaque année
 * (le premier point de la série compris), dans l'ordre chronologique.
 */
export function wealthYearTicks(points: WealthSeriesPoint[]): WealthYearTick[] {
  const ticks: WealthYearTick[] = [];
  let previous = '';
  points.forEach((point, index) => {
    const year = point.date.slice(0, 4);
    if (year !== previous) {
      ticks.push({ index, year });
      previous = year;
    }
  });
  return ticks;
}

/**
 * Valorisations à écrire pour compléter les fins de mois : aucune n'est produite
 * pour une date déjà couverte, et chaque date manquante reprend le dernier
 * relevé connu (report) ou, à défaut, les montants courants (estimation).
 */
export function planMonthEndValuations(
  existing: WealthPoint[],
  ends: string[],
  current: WealthTotals,
): PlannedValuation[] {
  const known = [...existing].sort((a, b) => a.date.localeCompare(b.date));
  const plan: PlannedValuation[] = [];
  for (const end of ends) {
    if (known.some((point) => point.date === end)) continue;
    const base = known.filter((point) => point.date <= end).at(-1);
    plan.push(
      base
        ? {
            date: end,
            savings: base.savings,
            receivables: base.receivables,
            payables: base.payables,
            estimated: false,
          }
        : { date: end, ...current, estimated: true },
    );
  }
  return plan;
}
