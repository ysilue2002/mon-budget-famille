/**
 * Rappel « phrase de secours » : sans phrase, un compte dont le mot de passe
 * est perdu ne peut être débloqué par personne (aucun e-mail n'est envoyé).
 *
 * Le rappel apparaît après la connexion tant que la phrase manque ; « Plus
 * tard » le met en veille trois jours sur cet appareil, puis il revient. La
 * mise en veille reste locale : elle n'est pas synchronisée.
 */

const SNOOZE_KEY = 'mbf.recovery.snooze';

/** Durée de la mise en veille demandée par « Plus tard ». */
export const RECOVERY_SNOOZE_DAYS = 3;

const SNOOZE_MS = RECOVERY_SNOOZE_DAYS * 24 * 60 * 60 * 1000;

/** Le rappel ne s'affiche que si la phrase manque et que la veille est finie. */
export function shouldRemindRecovery(input: {
  readonly set: boolean;
  readonly snoozedUntil: number | null;
  readonly now: number;
}): boolean {
  if (input.set) return false;
  if (input.snoozedUntil === null) return true;
  return input.now >= input.snoozedUntil;
}

export function readSnoozeUntil(): number | null {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // stockage indisponible : on considère qu'aucune veille n'a été demandée
    return null;
  }
}

export function snoozeReminder(now: number = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_MS));
  } catch {
    // idem : le rappel reviendra à la prochaine visite
  }
}
