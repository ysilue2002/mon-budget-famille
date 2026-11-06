import { Router, type Request, type Response } from 'express';
import { pool, withTransaction, type TxClient } from '../db/pool';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth';
import { pushSchema, type PushOpInput } from '../validation';
import { rateLimit } from '../middleware/rateLimit';

/**
 * Push : file d'opérations idempotentes (opId UUID) + merge à trois
 * composantes (local / base / serveur) champ par champ. Un champ touché
 * des deux côtés depuis la base commune devient un conflit signalé,
 * jamais un "last-write-wins" silencieux.
 * Pull : flux incrémental depuis un curseur (id de change_log).
 */

const router = Router();

/**
 * Garde-fou de débit sur la synchronisation : un client normal envoie quelques
 * opérations par minute et un pull toutes les cinq minutes. Le plafond large
 * (300 requêtes / 5 min / IP) arrête un script qui martèle la base sans gêner
 * un foyer nombreux derrière la même connexion.
 */
const syncLimiter = rateLimit({ name: 'sync-ip', windowMs: 5 * 60_000, max: 300 });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface RecordRow {
  record: Record<string, unknown>;
  rev: number;
  deleted: boolean;
}

async function getRecord(client: TxClient, familyId: string, entity: string, recordId: string): Promise<RecordRow | null> {
  const rows = await client.query(
    'SELECT record, rev, deleted FROM records WHERE family_id = $1 AND entity = $2 AND record_id = $3 FOR UPDATE',
    [familyId, entity, recordId],
  );
  const row = rows.rows[0] as { record: Record<string, unknown>; rev: string | number; deleted: boolean } | undefined;
  if (!row) return null;
  return { record: row.record, rev: Number(row.rev), deleted: row.deleted };
}

interface MergeOutcome {
  merged: Record<string, unknown>;
  conflicts: { field: string; remoteValue: unknown; localValue: unknown }[];
}

/**
 * Merge 3 composantes sur les champs listés par le client.
 * - champ inchangé côté serveur depuis la base : valeur locale appliquée ;
 * - champ modifié localement ET côté serveur : conflit (les deux valeurs retournées) ;
 * - champ absent de la liste : inchangé par cette opération.
 */
function mergeRecord(base: Record<string, unknown>, incoming: Record<string, unknown>, current: Record<string, unknown>, changedFields: string[]): MergeOutcome {
  const merged: Record<string, unknown> = { ...current };
  const conflicts: MergeOutcome['conflicts'] = [];
  for (const field of changedFields) {
    const localValue = incoming[field];
    const plainRecord = base;
    const baseValue = field in plainRecord ? plainRecord[field] : undefined;
    const serverValue = current[field];
    const localChanged = JSON.stringify(localValue ?? null) !== JSON.stringify(baseValue ?? null);
    const serverChanged = JSON.stringify(serverValue ?? null) !== JSON.stringify(baseValue ?? null);
    if (localChanged && serverChanged) {
      const same = JSON.stringify(localValue ?? null) === JSON.stringify(serverValue ?? null);
      if (same) {
        merged[field] = localValue;
      } else {
        conflicts.push({ field, remoteValue: serverValue, localValue });
      }
    } else if (localChanged) {
      merged[field] = localValue;
    }
    // ni l'un ni l'autre : rien à faire
  }
  return { merged, conflicts };
}

async function logChange(client: TxClient, familyId: string, entity: string, recordId: string, record: Record<string, unknown> | null, rev: number, deleted: boolean): Promise<void> {
  await client.query(
    'INSERT INTO change_log (family_id, entity, record_id, record, rev, deleted) VALUES ($1, $2, $3, $4, $5, $6)',
    [familyId, entity, recordId, record ? JSON.stringify(record) : null, rev, deleted],
  );
}

interface PushResult {
  opId: string;
  rev: number;
  status: 'applied' | 'conflict' | 'duplicate' | 'failed';
  mergedPayload: Record<string, unknown> | null;
  conflicts?: { field: string; remoteValue: unknown; localValue: unknown }[];
  /** La ligne est supprimée côté serveur : le client doit retirer la sienne. */
  deleted?: boolean;
}

async function applyUpsert(client: TxClient, familyId: string, op: PushOpInput, rev: number): Promise<PushResult> {
  // Le foyer et l'identifiant viennent du jeton et de l'URL, jamais de la
  // charge utile : un client ne peut donc pas estampiller un enregistrement
  // avec le foyer d'un autre utilisateur.
  const payload: Record<string, unknown> = {
    ...(isPlainObject(op.payload) ? op.payload : {}),
    id: op.entityId,
    familyId,
  };
  const existing = await getRecord(client, familyId, op.entity, op.entityId);
  const changedFields = op.changedFields ?? Object.keys(payload);
  const baseSnapshot = isPlainObject(op.baseSnapshot) ? op.baseSnapshot : {};

  if (existing?.deleted && op.baseRev < existing.rev) {
    // Le client a construit son opération avant d'apprendre la suppression :
    // la suppression gagne, l'upsert ne ressuscite pas la ligne. Les champs
    // abandonnés remontent en conflit pour que l'utilisateur le voie.
    return {
      opId: op.opId,
      rev: existing.rev,
      status: 'conflict',
      mergedPayload: null,
      deleted: true,
      conflicts: changedFields.map((field) => ({ field, remoteValue: null, localValue: payload[field] })),
    };
  }

  if (!existing || existing.deleted) {
    // Création, ou recréation après une suppression connue du client : la
    // révision reprend après le tombstone au lieu de revenir à 1, sinon le
    // client se croit à jour d'une révision que le serveur a dépassée.
    const baseRev = existing?.rev ?? 0;
    const newRev = baseRev + 1;
    const record: Record<string, unknown> = { ...payload, id: op.entityId, rev: newRev, baseRev: newRev, syncStatus: 'synced' };
    await client.query(
      `INSERT INTO records (family_id, entity, record_id, record, rev, deleted, updated_at)
       VALUES ($1, $2, $3, $4, $5, false, now())
       ON CONFLICT (family_id, entity, record_id)
       DO UPDATE SET record = $4, rev = $5, deleted = false, updated_at = now()`,
      [familyId, op.entity, op.entityId, JSON.stringify(record), newRev],
    );
    await logChange(client, familyId, op.entity, op.entityId, record, newRev, false);
    return { opId: op.opId, rev: newRev, status: 'applied', mergedPayload: null };
  }

  const outcome = mergeRecord(baseSnapshot, payload, existing.record, changedFields);
  const newRev = existing.rev + 1;
  const merged: Record<string, unknown> = { ...outcome.merged, rev: newRev, baseRev: newRev, syncStatus: 'synced' };
  await client.query(
    'UPDATE records SET record = $4, rev = $5, deleted = false, updated_at = now() WHERE family_id = $1 AND entity = $2 AND record_id = $3',
    [familyId, op.entity, op.entityId, JSON.stringify(merged), newRev],
  );
  await logChange(client, familyId, op.entity, op.entityId, merged, newRev, false);
  return { opId: op.opId, rev: newRev, status: outcome.conflicts.length > 0 ? 'conflict' : 'applied', mergedPayload: merged, conflicts: outcome.conflicts };
}

async function applyDelete(client: TxClient, familyId: string, op: PushOpInput): Promise<PushResult> {
  const existing = await getRecord(client, familyId, op.entity, op.entityId);
  const newRev = (existing?.rev ?? 0) + 1;
  const tombstone: Record<string, unknown> = { id: op.entityId };
  await client.query(
    `INSERT INTO records (family_id, entity, record_id, record, rev, deleted, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, now())
     ON CONFLICT (family_id, entity, record_id)
     DO UPDATE SET record = $4, rev = $5, deleted = true, updated_at = now()`,
    [familyId, op.entity, op.entityId, JSON.stringify(tombstone), newRev],
  );
  await logChange(client, familyId, op.entity, op.entityId, null, newRev, true);
  return { opId: op.opId, rev: newRev, status: 'applied', mergedPayload: null };
}

router.post('/push', syncLimiter, requireAuth, requireRole('member'), async (req: Request, res: Response) => {
  const auth = (req as AuthRequest).auth!;
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation', details: parsed.error.flatten() });
    return;
  }
  try {
    const ops = parsed.data.ops;
    const results: PushResult[] = [];

    for (const op of ops) {
      const single = await pool.connect();
      try {
        await single.query('BEGIN');
        const client = single as unknown as TxClient;
        // Idempotence : op déjà traité → renvoyer l'état courant sans réexécuter.
        const seen = await client.query('SELECT 1 FROM processed_ops WHERE op_id = $1', [op.opId]);
        if (seen.rowCount && seen.rowCount > 0) {
          const current = await getRecord(client, auth.familyId, op.entity, op.entityId);
          await single.query('COMMIT');
          results.push({
            opId: op.opId,
            rev: current?.rev ?? 0,
            status: 'duplicate',
            mergedPayload: current && !current.deleted ? current.record : null,
            deleted: current?.deleted ?? false,
          });
          continue;
        }

        const result = op.op === 'delete' ? await applyDelete(client, auth.familyId, op) : await applyUpsert(client, auth.familyId, op, op.payload ? 1 : 0);
        await client.query('INSERT INTO processed_ops (op_id, family_id, entity, record_id) VALUES ($1, $2, $3, $4)', [
          op.opId,
          auth.familyId,
          op.entity,
          op.entityId,
        ]);
        await single.query('COMMIT');
        results.push(result);
      } catch (error) {
        await single.query('ROLLBACK').catch(() => undefined);
        // Isolation par opération : une écriture invalide ne doit pas faire
        // échouer tout le lot ni bloquer les opérations suivantes du client.
        // Le détail reste dans les journaux serveur (pas de fuite SQL au client).
        console.error('[sync/push]', op.opId, error);
        results.push({ opId: op.opId, rev: 0, status: 'failed', mergedPayload: null });
      } finally {
        single.release();
      }
    }
    res.json({
      results: results.map((result) => ({
        opId: result.opId,
        rev: result.rev,
        status: result.status,
        mergedPayload: result.mergedPayload,
        conflicts: result.conflicts,
        ...(result.deleted ? { deleted: true } : {}),
        ...(result.status === 'failed' ? { error: 'operation-failed' } : {}),
      })),
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('[sync/push]', error);
    res.status(500).json({ error: 'internal' });
  }
});

const PULL_LIMIT = 500;

router.get('/pull', syncLimiter, requireAuth, async (req: Request, res: Response) => {
  const auth = (req as AuthRequest).auth!;
  const rawCursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
  const cursor = /^\d+$/.test(rawCursor) ? Number(rawCursor) : 0;
  try {
    const rows = await pool.query<{
      id: string;
      entity: string;
      record_id: string;
      record: Record<string, unknown> | null;
      rev: string | number;
      deleted: boolean;
    }>(
      `SELECT id, entity, record_id, record, rev, deleted
       FROM change_log
       WHERE family_id = $1 AND id > $2
       ORDER BY id ASC
       LIMIT ${PULL_LIMIT}`,
      [auth.familyId, cursor],
    );
    const changes = rows.rows.map((row) => ({
      entity: row.entity,
      // `record` est null pour un tombstone : le client a besoin de
      // `recordId` pour savoir quelle ligne locale supprimer.
      recordId: row.record_id,
      record: row.record,
      deleted: row.deleted,
      rev: Number(row.rev),
    }));
    const lastId = rows.rows.length > 0 ? Number(rows.rows[rows.rows.length - 1].id) : cursor;
    res.json({
      cursor: String(lastId),
      changes,
      hasMore: rows.rowCount === PULL_LIMIT,
      serverTime: Date.now(),
    });
  } catch (error) {
    console.error('[sync/pull]', error);
    res.status(500).json({ error: 'internal' });
  }
});

export default router;
