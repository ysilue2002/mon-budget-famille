import type { OutboxOperation } from '@/core/types';

/**
 * Protocole de synchronisation offline-first.
 *
 * Niveau 1 : si `baseRev` == révision serveur ⇒ application directe (rev+1).
 * Niveau 2 : sinon, fusion par champ. Le client envoie la liste des champs
 * qu'il a modifiés et leur valeur de base à `baseRev`. Le serveur calcule les
 * champs qu'IL a modifiés (valeur courante ≠ valeur de base). Champs disjoints
 * ⇒ fusion automatique (les deux gestes sont conservés). Chevauchement ⇒
 * conflit explicite renvoyé au client : jamais de « last-write-wins » aveugle.
 */

export type SyncEntity = OutboxOperation['entity'];

export interface PushOp {
  opId: string;
  entity: SyncEntity;
  entityId: string;
  op: 'upsert' | 'delete';
  payload: unknown;
  baseRev: number;
  /** Champs modifiés localement depuis baseRev (upsert). */
  changedFields?: string[];
  /** Valeur de ces champs à la révision baseRev (pour calculer le diff serveur). */
  baseSnapshot?: Record<string, unknown>;
}

export interface PushConflict {
  field: string;
  /** Valeur courante du serveur (à comparer à la valeur proposée). */
  remoteValue: unknown;
  /** Valeur du champ à la base (point commun des deux gestes). */
  baseValue: unknown;
}

export interface PushResult {
  opId: string;
  status: 'applied' | 'conflict' | 'duplicate';
  rev: number;
  /** Payload fusionné appliqué par le serveur (dans le cas d'une fusion auto). */
  mergedPayload?: unknown;
  conflicts?: PushConflict[];
}

export interface PushResponse {
  results: PushResult[];
  serverTime: number;
}

export interface PullChange {
  entity: SyncEntity;
  record: Record<string, unknown>;
}

export interface PullResponse {
  cursor: string;
  serverTime: number;
  changes: PullChange[];
}

export type SyncedEntityRow = { rev?: number };

const SYNC_META_KEYS = new Set(['rev', 'baseRev', 'updatedAt', 'deviceId', 'syncStatus', 'id', 'createdAt']);

/** Champs modifiés entre deux états (référence commune base). */
export function diffFields(
  base: Record<string, unknown> | null,
  current: Record<string, unknown>,
): string[] {
  const keys = base ? new Set([...Object.keys(current), ...Object.keys(base)]) : new Set(Object.keys(current));
  const fields: string[] = [];
  for (const key of keys) {
    if (SYNC_META_KEYS.has(key)) continue;
    if (JSON.stringify(current[key]) !== JSON.stringify(base?.[key])) fields.push(key);
  }
  return fields;
}

/**
 * Décide de fusionner ou signaler un conflit.
 * Seuls les champs modifiés par le client sont appliqués — les autres
 * modifications du serveur sont préservées (pas d'écrasement accidentel).
 * Un champ modifié des deux côtés avec des valeurs différentes = conflit.
 */
export function decideMerge(
  changedFields: string[],
  baseSnapshot: Record<string, unknown>,
  serverCurrent: Record<string, unknown>,
  clientPayload: Record<string, unknown>,
): { merge: Record<string, unknown> | null; conflicts: PushConflict[] } {
  const merged: Record<string, unknown> = { ...serverCurrent };
  const conflicts: PushConflict[] = [];
  for (const field of changedFields) {
    const baseValue = baseSnapshot[field];
    const remoteValue = serverCurrent[field];
    const localValue = clientPayload[field];
    const serverChanged = JSON.stringify(remoteValue ?? null) !== JSON.stringify(baseValue ?? null);
    if (!serverChanged) {
      merged[field] = localValue;
      continue;
    }
    const same = JSON.stringify(localValue ?? null) === JSON.stringify(remoteValue ?? null);
    if (!same) {
      conflicts.push({ field, remoteValue, baseValue });
    }
    // valeurs identiques : rien à faire, la valeur courante est déjà la bonne.
  }
  return conflicts.length === 0 ? { merge: merged, conflicts: [] } : { merge: null, conflicts };
}
