import { db } from './dexie';
import { uuid, getDeviceId } from '@/lib/id';
import { todayISO } from '@/lib/date';
import type { Category, Family, FinancialAccount } from '@/core/types';

/**
 * Catégories par défaut : identifiants stables (déterministes)
 * pour éviter les conflits de synchronisation entre appareils.
 */
export const DEFAULT_CATEGORIES: Omit<Category, 'familyId'>[] = [
  { id: 'cat-salaire', nameFr: 'Salaire', nameEn: 'Salary', type: 'income', icon: '💼' },
  { id: 'cat-activite', nameFr: 'Activité informelle', nameEn: 'Informal work', type: 'income', icon: '🧺' },
  { id: 'cat-cadeaux', nameFr: 'Cadeaux reçus', nameEn: 'Gifts received', type: 'income', icon: '🎁' },
  { id: 'cat-autres-revenus', nameFr: 'Autres revenus', nameEn: 'Other income', type: 'income', icon: '➕' },
  { id: 'cat-alimentation', nameFr: 'Alimentation', nameEn: 'Groceries', type: 'expense', icon: '🛒' },
  { id: 'cat-logement', nameFr: 'Logement', nameEn: 'Housing', type: 'expense', icon: '🏠' },
  { id: 'cat-transport', nameFr: 'Transport', nameEn: 'Transport', type: 'expense', icon: '🚌' },
  { id: 'cat-sante', nameFr: 'Santé', nameEn: 'Health', type: 'expense', icon: '💊' },
  { id: 'cat-education', nameFr: 'Éducation', nameEn: 'Education', type: 'expense', icon: '📚' },
  { id: 'cat-telecom', nameFr: 'Télécom & Internet', nameEn: 'Phone & Internet', type: 'expense', icon: '📱' },
  { id: 'cat-vetements', nameFr: 'Vêtements', nameEn: 'Clothing', type: 'expense', icon: '👕' },
  { id: 'cat-loisirs', nameFr: 'Loisirs', nameEn: 'Leisure', type: 'expense', icon: '🎬' },
  { id: 'cat-epargne', nameFr: 'Épargne', nameEn: 'Savings', type: 'expense', icon: '🏦' },
  { id: 'cat-autres', nameFr: 'Divers', nameEn: 'Miscellaneous', type: 'expense', icon: '📦' },
];

const BOOTSTRAP_KEY = 'bootstrapped';

export function syncFields() {
  return {
    baseRev: 0,
    rev: 0,
    updatedAt: Date.now(),
    deviceId: getDeviceId(),
    syncStatus: 'pending' as const,
  };
}

/**
 * Amorçage idempotent exécuté au démarrage :
 * foyer par défaut (devise XOF), catégories, un compte espèces.
 */
export async function bootstrapApp(): Promise<{ family: Family; changed: boolean }> {
  const existing = await db.families.toCollection().first();
  if (existing) {
    return { family: existing, changed: false };
  }

  const family: Family = {
    id: uuid(),
    name: 'Ma famille',
    primaryCurrency: 'XOF',
    createdAt: Date.now(),
  };

  const cashAccount: FinancialAccount = {
    id: uuid(),
    familyId: family.id,
    name: 'Espèces',
    type: 'cash',
    provider: null,
    currency: family.primaryCurrency,
    initialBalance: 0,
    archived: false,
    ...syncFields(),
  };

  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({ ...c, familyId: family.id }));

  await db.transaction('rw', db.families, db.accounts, db.categories, db.meta, async () => {
    await db.families.put(family);
    await db.accounts.put(cashAccount);
    await db.categories.bulkPut(categories);
    await db.meta.put({ key: BOOTSTRAP_KEY, value: { at: Date.now() } });
    await db.meta.put({ key: 'familyId', value: family.id });
  });

  return { family, changed: true };
}

export async function getActiveFamily(): Promise<Family | undefined> {
  return db.families.toCollection().first();
}

export async function resetLocalData(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Date du jour utilitaire réexportée pour les écrans. */
export const today = todayISO;
