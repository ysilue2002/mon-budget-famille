import { pool } from './pool';

/**
 * Rétention de l'historique serveur.
 *
 * `change_log` et `processed_ops` grossissent à chaque synchronisation sans
 * jamais être relus après coup. Sans purge, la base serveur croît sans limite
 * (toutes les modifications, de toutes les entités, pour toujours).
 *
 * Conséquence assumée et documentée : un appareil resté hors ligne plus de
 * RETENTION_DAYS jours ne recevra pas les modifications purgées par le pull
 * incrémental (son curseur est antérieur). Dans ce cas il faut le réamorcer
 * (réinstallation / réinitialisation du foyer local). Les enregistrements
 * actuels (`records`) ne sont jamais touchés : seuls les flux d'historique
 * sont rognés.
 */
export const RETENTION_DAYS = 90;

export interface PurgeStats {
  changeLog: number;
  processedOps: number;
  expiredFamilies: number;
}

/**
 * Foyers « en attente de récupération » dont la fenêtre est terminée : les
 * données partent pour de bon (journal, opérations, records, foyer), dans
 * l'ordre des clés étrangères. Appelée par la purge périodique : la 
 * suppression d'un compte ne laisse jamais de données orphelines indéfiniment.
 */
export async function purgeExpiredFamilyRecoveries(
  client: Pick<typeof pool, 'query'> = pool,
): Promise<number> {
  const expired = await client.query<{ id: string }>(
    'SELECT id FROM families WHERE recovery_expires_at IS NOT NULL AND recovery_expires_at <= now()',
  );
  for (const row of expired.rows) {
    await client.query('DELETE FROM change_log WHERE family_id = $1', [row.id]);
    await client.query('DELETE FROM processed_ops WHERE family_id = $1', [row.id]);
    await client.query('DELETE FROM records WHERE family_id = $1', [row.id]);
    await client.query('DELETE FROM families WHERE id = $1', [row.id]);
  }
  return expired.rowCount ?? 0;
}

export async function purgeServerHistory(
  client: Pick<typeof pool, 'query'> = pool,
  retentionDays: number = RETENTION_DAYS,
): Promise<PurgeStats> {
  const changeLog = await client.query(
    'DELETE FROM change_log WHERE created_at < now() - make_interval(days => $1)',
    [retentionDays],
  );
  const processedOps = await client.query(
    'DELETE FROM processed_ops WHERE created_at < now() - make_interval(days => $1)',
    [retentionDays],
  );
  const expiredFamilies = await purgeExpiredFamilyRecoveries(client);
  return {
    changeLog: changeLog.rowCount ?? 0,
    processedOps: processedOps.rowCount ?? 0,
    expiredFamilies,
  };
}
