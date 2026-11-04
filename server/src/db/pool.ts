import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

/**
 * Chargement minimal de .env (sans dépendance dotenv) :
 * une ligne `CLE=valeur`, les commentaires `#` ignorés,
 * aucune variable existante du processus écrasée.
 */
function loadEnvFile(relPath: string): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), relPath), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2];
      }
    }
  } catch {
    // fichier facultatif
  }
}

loadEnvFile('.env');
loadEnvFile('../.env');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL manquant : copier server/.env.example vers server/.env');
}

/**
 * SSL pour les bases PostgreSQL hébergées (Supabase, etc.) :
 * actif quand l'hôte est un pooler Supabase ou quand DB_SSL=true.
 * `rejectUnauthorized: false` : le pooler Supabase présente un certificat
 * signé mais dont la chaîne ne valide pas toujours côté Node ; la connexion
 * reste chiffrée (TLS) même vérification laissée de côté.
 */
let ssl: PoolConfig['ssl'];
const dbHost = (() => {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return '';
  }
})();
if (process.env.DB_SSL === 'true' || dbHost.includes('supabase')) {
  ssl = { rejectUnauthorized: false };
}

export const pool = new Pool({ connectionString, max: 10, ssl });

/** Exécute une requête paramétrée. */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query(text, params) as Promise<QueryResult<T>>;
}

/** Exécute plusieurs requêtes dans une transaction. */
export async function withTransaction<T>(fn: (client: TxClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client as TxClient);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export type TxClient = Pick<Pool, 'query'>;
