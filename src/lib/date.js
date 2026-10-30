/** Aides aux dates : format ISO local, mois courant, périodes. */
export function todayISO() {
    const d = new Date();
    return toISODate(d);
}
/** Date ISO locale (YYYY-MM-DD) sans décalage UTC. */
export function toISODate(d) {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** Mois courant au format YYYY-MM. */
export function currentMonth() {
    return todayISO().slice(0, 7);
}
export function monthOf(isoDate) {
    return isoDate.slice(0, 7);
}
export function addMonths(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}
export function isDateWithin(isoDate, fromISO, toISO) {
    return isoDate >= fromISO && isoDate <= toISO;
}
/** Liste des mois entre deux périodes incluses. */
export function monthsBetween(fromMonth, toMonth) {
    const out = [];
    let cur = fromMonth;
    while (cur <= toMonth) {
        out.push(cur);
        cur = addMonths(cur, 1);
    }
    return out;
}
