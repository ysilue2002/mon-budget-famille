import { describe, expect, it } from 'vitest';
import { shouldRemindRecovery } from './recoveryReminder';

const now = 1_000_000;

describe('rappel de la phrase de secours', () => {
  it('ne rappelle rien quand la phrase est définie', () => {
    expect(shouldRemindRecovery({ set: true, snoozedUntil: null, now })).toBe(false);
    expect(shouldRemindRecovery({ set: true, snoozedUntil: now + 10_000, now })).toBe(false);
  });

  it('rappelle dès la connexion quand aucune phrase n’existe', () => {
    expect(shouldRemindRecovery({ set: false, snoozedUntil: null, now })).toBe(true);
  });

  it('respecte « plus tard » puis revient une fois la veille écoulée', () => {
    expect(shouldRemindRecovery({ set: false, snoozedUntil: now + 1_000, now })).toBe(false);
    expect(shouldRemindRecovery({ set: false, snoozedUntil: now, now })).toBe(true);
    expect(shouldRemindRecovery({ set: false, snoozedUntil: now - 1, now })).toBe(true);
  });
});
