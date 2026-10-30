/**
 * Exécute les migrations SQL de src/db/migrations dans l'ordre alphabétique.
 * Chaque migration est appliquée une seule fois (table schema_migrations).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pool, withTransaction } from './pool';

const CWD = resolve(process.cwd());

async function ensureSchemaTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function pendingMigrations(): Promise<string[]> {
  const dir = join(CWD, 'src', 'db', 'migrations');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const applied = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const known = new Set(applied.rows.map((row) => row.name));
  return files.filter((name) => !known.has(name));
}

async function main(): Promise<void> {
  await ensureSchemaTable();
  const pending = await pendingMigrations();
  if (pending.length === 0) {
    console.log('[migrate] aucune migration en attente');
    await pool.end();
    return;
  }
  for (const name of pending) {
    const sql = readFileSync(join(CWD, 'src', 'db', 'migrations', name), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    });
    console.log(`[migrate] appliquée : ${name}`);
  }
  await pool.end();
  console.log('[migrate] terminé');
}

main().catch((error) => {
  console.error('[migrate] échec :', error);
  process.exit(1);
});
