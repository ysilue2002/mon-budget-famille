/** Aides aux dates : format ISO local, mois courant, périodes. */

export function todayISO(): string {
  const d = new Date();
  return toISODate(d);
}

/** Date ISO locale (YYYY-MM-DD) sans décalage UTC. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Mois courant au format YYYY-MM. */
export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Dernier jour d'un mois « YYYY-MM » (inclus). */
export function endOfMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const last = new Date(year, m, 0).getDate();
  return `${year}-${`${m}`.padStart(2, '0')}-${`${last}`.padStart(2, '0')}`;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}

export function isDateWithin(isoDate: string, fromISO: string, toISO: string): boolean {
  return isoDate >= fromISO && isoDate <= toISO;
}

/** Liste des mois entre deux périodes incluses. */
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let cur = fromMonth;
  while (cur <= toMonth) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}
