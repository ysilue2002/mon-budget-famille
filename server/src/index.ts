import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth';
import ratesRoutes from './routes/rates';
import syncRoutes from './routes/sync';
import { purgeServerHistory } from './db/purge';

const app = express();

app.set('trust proxy', 1);

/**
 * Origines autorisées : `CORS_ORIGIN` (liste séparée par des virgules).
 * Sans réglage explicite, on n'ouvre que les origines de développement —
 * un `origin: true` reflétait n'importe quel site visiteur.
 */
const configuredOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const allowedOrigins =
  configuredOrigins.length > 0
    ? configuredOrigins
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(
  cors({
    origin(origin, callback) {
      // Pas d'en-tête Origin (curl, application mobile, serveur à serveur) :
      // la requête n'est pas soumise au CORS.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.includes(origin.replace(/\/$/, '')));
    },
  }),
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/v1/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/rates', ratesRoutes);
app.use('/api/v1/sync', syncRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'not-found' });
});

// Gestion d'erreurs globale (4 arguments nécessaires pour Express).
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[express]', error);
  res.status(500).json({ error: 'internal' });
});

// PORT peut être préexistant dans l'environnement (géré par l'hôte) : uniquement
// utilisé s'il est exploitable, sinon repli sur 4000 et sur la valeur du .env.
const portFromEnv = Number(process.env.PORT);
const port = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : 4000;
app.listen(port, () => {
  console.log(`[server] Mon Budget Famille API sur http://localhost:${port}`);
});

/**
 * Purge périodique de l'historique (`change_log`, `processed_ops`) : la base
 * serveur cesse de croître indéfiniment. Appelée une minute après le démarrage
 * puis toutes les six heures ; pour les tests, `PURGE_FIRST_DELAY_MS`=0 déclenche
 * immédiatement et `PURGE_INTERVAL_MS` réduit la période.
 */
const PURGE_FIRST_DELAY_MS = Number(process.env.PURGE_FIRST_DELAY_MS ?? 60_000);
const PURGE_INTERVAL_MS = Number(process.env.PURGE_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
const purgeTimer = setTimeout(() => {
  void purgeServerHistory()
    .then((stats) => {
      if (stats.changeLog + stats.processedOps + stats.expiredFamilies > 0) {
        console.log('[purge]', stats);
      }
    })
    .catch((error: unknown) => {
      console.error('[purge]', error);
    });
  setInterval(() => {
    void purgeServerHistory()
      .then((stats) => {
        if (stats.changeLog + stats.processedOps + stats.expiredFamilies > 0) {
          console.log('[purge]', stats);
        }
      })
      .catch((error: unknown) => {
        console.error('[purge]', error);
      });
  }, PURGE_INTERVAL_MS).unref();
}, Number.isFinite(PURGE_FIRST_DELAY_MS) && PURGE_FIRST_DELAY_MS >= 0 ? PURGE_FIRST_DELAY_MS : 60_000);
purgeTimer.unref();

export default app;
