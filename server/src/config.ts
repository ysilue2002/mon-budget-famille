/**
 * Configuration sensible du serveur.
 *
 * Le chargement du `.env` (ou du `.env` parent) est assuré par `./db/pool` :
 * cet import doit précéder toute lecture de `process.env`.
 *
 * Le secret JWT est **obligatoire** : aucun repli en dur, sinon un déploiement
 * sans variable d'environnement accepterait des jetons forgés par n'importe qui.
 */
import './db/pool';

const secret = process.env.JWT_SECRET?.trim();

if (!secret) {
  throw new Error(
    'JWT_SECRET manquant : définissez un secret aléatoire dans server/.env (ex. `openssl rand -base64 48`).',
  );
}

if (secret.length < 32) {
  throw new Error(
    'JWT_SECRET trop court (32 caractères minimum) : générez-en un avec `openssl rand -base64 48`.',
  );
}

export const JWT_SECRET = secret;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
