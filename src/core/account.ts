import { db } from '@/db/dexie';
import { apiFetch, clearAuth } from '@/lib/api';

/**
 * Suppression du compte côté client.
 *
 * Le serveur supprime les adhésions, les foyers devenus vides (données,
 * journal de synchronisation, opérations) et la ligne utilisateur. Ici on
 * réamorce l'appareil : IndexedDB recréé vide, jeton jeté, retour à l'écran
 * de connexion. À ne lancer qu'après une confirmation explicite
 * (l'interface double le contrôle).
 */
export async function deleteAccountRemotely(): Promise<{ deletedFamilies: number }> {
  const result = await apiFetch<{ deletedFamilies: number }>('/api/v1/auth/account', {
    method: 'DELETE',
  });
  await db.delete();
  await db.open();
  clearAuth();
  return result;
}
