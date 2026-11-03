import { db } from '@/db/dexie';
import type { CurrencyCode } from '@/core/types';

/**
 * Adhésion à un foyer distant (invitation).
 *
 * Le compte est rattaché au serveur via `memberships` ; ce module s'occupe de
 * l'appareil local : la base Dexie est récréée autour du foyer distant, avec son
 * identifiant exact. Les données locales (y compris l'amorce et les catégories
 * par défaut) sont ABANDONNÉES : la vérité proviendra du pull, qui repart du
 * curseur 0. L'écran appelant doit le faire confirmer à l'utilisateur.
 */
export interface InvitedFamily {
  id: string;
  name: string;
  primaryCurrency: CurrencyCode;
}

export type JoinFailureReason = 'invalid-invitation' | 'invitation-expired' | 'invitation-used';

/** Réinitialise la base locale autour du foyer distant reçu du serveur. */
export async function adoptInvitedFamily(family: InvitedFamily): Promise<void> {
  await db.delete();
  await db.open();
  await db.transaction('rw', db.families, db.meta, async () => {
    await db.families.put({
      id: family.id,
      name: family.name,
      primaryCurrency: family.primaryCurrency,
      createdAt: Date.now(),
    });
    await db.meta.put({ key: 'bootstrapped', value: { at: Date.now() } });
    await db.meta.put({ key: 'familyId', value: family.id });
  });
}

/** Traduit le code HTTP/token de l'API en raison lisible côté UI. */
export function joinFailureReason(status: number, body: unknown): JoinFailureReason | null {
  const error = typeof body === 'object' && body !== null ? String((body as { error?: unknown }).error ?? '') : '';
  if (error === 'invitation-expired') return 'invitation-expired';
  if (error === 'invitation-used') return 'invitation-used';
  if (status === 410 || status === 404 || status === 400) return 'invalid-invitation';
  return null;
}
