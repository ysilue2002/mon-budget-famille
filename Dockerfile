# syntax=docker/dockerfile:1

# Image d'exécution de l'API Mon Budget Famille (le front PWA est servi par le
# bundle Vite / Pages : cette image ne porte que le serveur de synchronisation).
FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# Dépendances serveur complètes (compilation), lockfile respecté.
FROM base AS build
COPY server/package.json server/package-lock.json ./
# NODE_ENV=production (hérité) ferait npm ci sauter les devDependencies dont la
# compilation a besoin : --include=dev les force, puis élagage après le tsc.
RUN npm ci --include=dev
COPY server/ .
# Si la compilation ou le typecheck échoue, l'image n'est pas construite.
RUN npx tsc -p tsconfig.json && npm prune --omit=dev

# Image finale : dist/ + dépendances de production + fichiers SQL de migration
# (migrate.ts lit src/db/migrations relativement au répertoire courant).
FROM base AS runtime
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/src/db/migrations ./src/db/migrations
EXPOSE 4000
USER node
# Démarrage : migrations idempotentes (schema_migrations) puis API.
# Un hébergement (Render) ne change pas la commande ; le conteneur
# s'auto-charge de mettre la base a jour a chaque deploiement.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
