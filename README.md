# Mon Budget Famille / My Family Budget

PWA de gestion financière familiale **offline-first**, bilingue (FR/EN) et multidevise
(XOF, XAF, USD, NGN, GBP, EUR, CHF). Adaptée aux comptes Mobile Money
(Wave, Orange Money, MTN MoMo, Moov Money…), banques et espèces.

## Arborescence

```
mon-budget-famille/
├── src/                    # Frontend React 18 + Vite + Tailwind
│   ├── core/               # Métier pur : types, devises, money (entiers), taux, repo, selectors
│   ├── db/                 # Dexie.js (IndexedDB), amorçage
│   ├── sync/               # File d'attente idempotente, protocole, conflits, SyncProvider
│   ├── i18n/               # react-i18next — locales/fr.json + locales/en.json
│   ├── pages/              # Dashboard, Opérations, Comptes, Budgets, Épargne, Dettes,
│   │                       # Convertisseur, Rapports, Réglages, Conflits
│   ├── hooks/ et lib/      # useData, apiFetch (JWT), dates, uuid
│   └── App.tsx             # Shell responsive + PWA
├── server/                 # Backend Node.js/Express/TypeScript
│   ├── src/db/             # pool pg + migrations SQL (schema_migrations)
│   ├── src/middleware/     # JWT + rôles (admin > manager > member > readonly)
│   ├── src/routes/         # auth (register/login), sync (push idempotent + pull cursor), rates
│   └── src/db/migrations/  # PostgreSQL : families, users, memberships, records, change_log, processed_ops
├── public/                 # Icônes PWA
└── .env.example            # Variables VITE_RATES_API_URL, VITE_API_BASE_URL
```

## Règle des montants

Aucun flottant n'est stocké : les montants sont des **entiers en sous-unités**
(cents pour USD/EUR/GBP/CHF, unités entières pour XOF/XAF/NGN). Toute
saisie passe par `parseAmountInput`, toute conversion par `convertMinor`
(arrondi ½ supérieur). Les tests `src/core/money.test.ts` verrouillent ce contrat.

## Démarrage (développement)

```bash
# Frontend
npm install
cp .env.example .env          # VITE_RATES_API_URL, VITE_API_BASE_URL (facultatif)
npm run dev                   # http://localhost:5173 (PWA + i18n FR/EN)

# Backend
cd server
npm install
cp .env.example .env          # DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm run migrate               # crée le schéma PostgreSQL
npm run dev                   # http://localhost:4000 (proxy /api côté Vite)
```

## Synchronisation & conflits

- **File d'attente** : chaque écriture locale place une opération **idempotente**
  (UUID) dans la table Dexie `outbox` ; le réseau qui revient déclenche le push.
- **Idempotence serveur** : `processed_ops` empêche toute double application d'un opId.
- **Fusion à trois composantes** : le client envoie les champs modifiés et la base
  commune (`changedFields` + `baseSnapshot`) ; les champs touchés des deux côtés
  avec des valeurs différentes produisent un **conflit explicite** consultable et
  résoluable champ par champ (page /conflicts) — jamais de *last-write-wins* silencieux.
- **Pull incrémental** : curseur sur `change_log`, jusqu'à 500 changements par cycle.

## Tests

```bash
npm run test        # Vitest : money, exchange, selectors, protocole de fusion
cd server && npm run typecheck
npm run typecheck   # frontend (tsc --noEmit)
npm run build       # production (Vite + service worker PWA)
```

## Identités de session

Les jetons JWT (`server/src/routes/auth.ts`) sont transmis via
`Authorization: Bearer` par `src/lib/api.ts`. La session est stockée
côté client uniquement (`localStorage`), jamais dans le code source.
