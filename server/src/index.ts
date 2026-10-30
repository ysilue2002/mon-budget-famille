import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth';
import ratesRoutes from './routes/rates';
import syncRoutes from './routes/sync';

const app = express();

app.set('trust proxy', 1);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
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

export default app;
