# Mon Budget Famille / My Family Budget

PWA de gestion financière familiale **offline-first**, trilingue (FR/EN/AR, avec affichage RTL) et multidevise
(XOF, XAF, USD, NGN, GBP, EUR, CHF). Adaptée aux comptes Mobile Money
(Wave, Orange Money, MTN MoMo, Moov Money…), banques et espèces.

## Arborescence

```
mon-budget-famille/
├── src/                    # Frontend React 18 + Vite + Tailwind
│   ├── core/               # Métier pur : types, devises, money (entiers), taux, repo, selectors
│   ├── db/                 # Dexie.js (IndexedDB), amorçage
│   ├── sync/               # File d'attente idempotente, protocole, conflits, SyncProvider
│   ├── i18n/               # react-i18next — locales/fr.json + en.json + ar.json (RTL)
│   ├── pages/              # Dashboard, Opérations, Comptes, Budgets, Épargne, Dettes,
│   │                       # Membres, Récurrents, Convertisseur, Rapports, États, Réglages,
│   │                       # Conflits
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
cp .env.example .env          # DATABASE_URL, CORS_ORIGIN
# JWT_SECRET obligatoire (32 caractères min.), sinon l'API refuse de démarrer :
# openssl rand -base64 48 puis reporter la valeur dans server/.env
npm run migrate               # crée le schéma PostgreSQL
npm run dev                   # http://localhost:4000 (proxy /api côté Vite)
```

## Opérations récurrentes

Les règles (loyer, salaire, abonnement…) portent une fréquence (`weekly`,
`monthly`, `yearly`) et un intervalle. Les échéances dues sont matérialisées
automatiquement au démarrage, chaque minute et au retour de l'onglet au premier
plan (`src/core/recurring.ts`), ou manuellement depuis l'écran **Récurrents**.

L'identifiant de l'opération générée est **déterministe** (`rec-<ruleId>-<date>`)
et `nextDueDate` avance à chaque échéance : la génération est donc idempotente,
y compris entre appareils. Les échéances antérieures à la création de la règle
ne sont jamais générées rétroactivement, et le jour de `startDate` sert d'ancre
(31 janvier → 28 février → 31 mars).

## États financiers (bilan)

L'écran **États** (`src/pages/Statements.tsx`) produit un bilan mensuel ou annuel
à partir de la logique pure de `src/core/statements.ts` :

- **résultat de la période** : revenus, dépenses, résultat net, taux d'épargne et
  nombre de transferts internes (exclus du résultat) ;
- **revenus et dépenses par catégorie**, du plus lourd au plus léger, avec nombre
  d'opérations et part du total ;
- **mouvements de comptes** : solde d'ouverture, entrées, sorties, solde de
  clôture, dans la devise d'origine de chaque compte, plus l'équivalent consolidé ;
- **patrimoine** : soldes des comptes + épargne + créances − dettes ;
- **répartition par membre** : revenus, dépenses, solde et part de chaque membre du
  foyer (`Transaction.member`, renseigné en option à la saisie ; à défaut l'auteur
  de l'opération est utilisé) ;
- **comparaison** : totaux de la période précédente (mois précédent, année
  précédente, ou fenêtre de même longueur) avec écart absolu et en pourcentage
  (`previousPeriod()`), y compris **par catégorie** (catégorie, précédente, période,
  écart), triée par écart le plus fort.

### Patrimoine d'époque

L'épargne et les dettes ne conservent que leur montant courant : sans relevé, un
bilan de septembre afficherait le patrimoine d'aujourd'hui. `WealthTracker`
(`src/components/WealthTracker.tsx`) écrit donc une **valorisation datée** par
jour d'ouverture — id déterministe `wealth-<date>`, une seule ligne même entre
appareils, et aucune écriture si les montants n'ont pas bougé. Le bilan utilise
le dernier relevé antérieur à sa clôture et indique la date retenue ; s'il n'en
existe aucun, il retombe sur les montants actuels en le signalant.

Les **fins de mois** sont complétées même si l'application n'a pas été ouverte ce
jour-là (`ensureMonthEndValuations`) : chaque fin de mois révolue non couverte
reçoit un relevé daté, qui reporte le dernier relevé connu (les montants n'ont
pas pu changer sans ouverture) ou, à défaut, les montants du jour marqués comme
**estimation** dans le bilan.

Le bilan affiche aussi l'**évolution du patrimoine net** (épargne + créances −
dettes) sur les douze derniers relevés jusqu'à sa clôture, en courbe SVG — donc
imprimable telle quelle et également dessinée dans l'export PDF. Les points
creux signalent les valeurs estimées, des repères annuels séparent les millésimes,
et une infobulle au survol donne la date et la valeur du relevé (même repères
annuels dans le PDF).

L'entité `wealth` se synchronise comme les autres (`records`), d'où la migration
`server/src/db/migrations/003_wealth_entity.sql` qui élargit la contrainte CHECK.

Le bouton **Imprimer** déclenche `window.print()` ; les règles `@media print` de
`src/index.css` masquent la navigation (`.app-chrome`) et les contrôles
(`.no-print`) pour ne garder que la feuille A4 (`.print-sheet`, `@page`). Le bouton
**PDF** produit le même état via jsPDF + autoTable, détail des opérations inclus
si l'option est cochée. Aucune donnée n'est envoyée : tout est calculé localement.

## Activité (espace « Activité »)

L'espace **Activité** suit les recettes et charges d'une ou plusieurs activités,
à côté du budget du foyer. L'identité de l'activité (nom, gérant, coordonnées,
identifiant fiscal) se règle dans **Profil** (`src/pages/Profile.tsx`), où elle
peut aussi être archivée sans perdre son historique.

- Une opération s'y rattache via `Transaction.businessId` (champ « Activité pro »
  du formulaire d'opération, jamais pour un transfert). Le drapeau
  `Transaction.settled` distingue une facture **réglée** (défaut) d'une facture
  **encaissée/payée plus tard**.
- Les états financiers d'une période sont rendus par **Bilans**
  (`src/pages/Balances.tsx`, calculs dans `src/core/reports.ts`), la trésorerie
  par **Trésorerie** (`src/core/treasury.ts`) et les documents imprimables par
  **États** (`src/pages/ActivityDocs.tsx`).
- **Compte de résultat** (`src/pages/Income.tsx`, `buildIncomeStatement` dans
  `src/core/reports.ts`) détaille les produits, les achats de marchandises et
  les autres charges catégorie par catégorie, puis un bilan simplifié (argent,
  stock, crédits clients, dettes fournisseurs, situation nette). L'écran
  s'imprime et s'exporte en PDF comme les autres états.
- Le **bénéfice est calculé hors taxe**, et sur les seules marchandises vendues :
  les achats hors taxe sont diminués du stock restant en fin de période
  (`stockValueAt` dans `src/core/stock.ts`, au prix d'achat). Un achat qui dort
  en magasin ne pèse donc pas sur le mois où il a été payé, et son coût arrive
  le mois de la vente.
- Le **journal daté du stock** (`StockMovement`, table `stockMovements`) porte
  chaque entrée et sortie avec sa date : achat, vente, quantité de départ à la
  création de la marchandise, et correction d'inventaire datée du jour. La
  valeur d'une période passée se lit dans ce journal, elle ne dépend donc plus
  du stock d'aujourd'hui. `ensureStockLedger` reprend une fois l'existant depuis
  les documents déjà saisis (ids déterministes, donc rejouable sans doublon) ;
  les écrans Articles affichent les derniers mouvements, et l'état
  « Journal du stock » (`buildStockLedger`) s'imprime sur une période avec le
  stock de début, les entrées, les sorties, le stock de fin et le détail des
  mouvements.
- **Articles et prestations** : une fiche est soit un article stocké
  (marchandise, matière première, pièce détachée), soit une **prestation**
  (`kind: 'service'`) — main d'œuvre, pose, réparation, location. Une prestation
  se facture normalement mais ne touche pas au stock, n'entre pas dans la valeur
  du stock et ne déclenche pas d'alerte de réapprovisionnement. C'est ce qui rend
  l'espace Activité utilisable par un maçon, un menuisier, un mécanicien ou un
  prestataire de services, et pas seulement par un commerce.
- **Chantiers** (`Project`, écran `/projects`) : une vente, un achat, un devis,
  une dépense et un acompte peuvent porter un `projectId`. L'écran additionne
  alors, par chantier, les ventes hors taxe (séparées en main d'œuvre et
  fournitures), les achats hors taxe, les dépenses, les acomptes reçus et le
  reste à encaisser, et en déduit la **marge** (`projectTotals` dans
  `src/core/projects.ts`). Un chantier ne crée aucune écriture : il étiquette
  des documents existants, et le supprimer ne touche ni aux montants ni au
  stock. L'opération de journal générée par une vente ou un achat est exclue du
  calcul des dépenses (`isDocumentTransaction`), sinon elle doublerait le
  document. Les listes de ventes, d'achats, de dépenses, de devis et de factures
  affichent une colonne « Chantier » et un filtre qui restreint la liste et ses
  totaux au chantier choisi (`ProjectFilter`). Le filtre vit dans l'adresse
  (`?chantier=<id>`), donc la fiche d'un chantier ouvre directement ses ventes,
  ses achats, ses devis, ses factures et ses dépenses, et un rechargement garde
  le filtre. Le bouton « État » de la fiche affiche un état de rentabilité
  imprimable (`print-sheet`) : la liste détaillée de ses documents hors taxe,
  puis ventes, achats, dépenses, marge, acomptes et reste à encaisser ; le même
  état s'exporte en PDF (`downloadPdf`, avec bascule vers l'impression en
  arabe). « État global » compare tous les chantiers en cours dans un tableau
  unique avec ligne de totaux. Le profil de l'activité reste à un clic depuis
  l'accueil : le menu garde treize entrées.
- La **TVA facturée n'est pas un gain** : elle est reversée, jamais gagnée.
  `documentsTax` relit la TVA sur les lignes et le taux de chaque document ; la
  TVA collectée moins la TVA déductible donne la **TVA à payer** (négative, elle
  devient un crédit de TVA). L'écran affiche ces trois lignes, Bilans affiche la
  TVA à payer et des ventes/achats rappelés TVA incluse. Les montants de
  trésorerie et les crédits restent TTC : c'est l'argent réellement échangé.
- Les menus des deux espaces vivent dans `src/navigation.ts` et sont verrouillés
  par `src/navigation.test.ts` (pas de doublon, treize entrées au plus, libellés
  traduits dans les trois langues).

## Membres du foyer

L'écran **Membres** gère la liste utilisée pour attribuer les opérations et pour
la répartition du bilan. Chaque opération porte un `member` (nom, synchronisé) ;
la table locale `members` n'est qu'un index : elle est alimentée au premier
affichage depuis les noms déjà présents (`syncMemberNames`).

- **Ajouter / renommer / retirer** un membre ; le renommage reporte le nouveau nom
  sur toutes ses opérations, le retrait les désattribue.
- **Attribution rapide** : les 20 opérations les plus récentes sans membre sont
  listées avec un sélecteur, et le champ « Membre » du formulaire d'opération
  propose la liste gérée ici.
- **Membre par défaut** : l'utilisateur connecté est retrouvé parmi les membres
  (identifiant serveur, puis e-mail, puis nom — `defaultMemberFor`) et son nom est
  pré-rempli sur les nouvelles opérations et repris par `createTransaction`
  lorsqu'aucun membre n'est fourni. Une opération ajoutée hors session reste
  sans attribution.

## Synchronisation & conflits

- **File d'attente** : chaque écriture locale place une opération **idempotente**
  (UUID) dans la table Dexie `outbox` ; le réseau qui revient déclenche le push.
- **Idempotence serveur** : `processed_ops` empêche toute double application d'un opId.
- **Fusion à trois composantes** : le client envoie les champs modifiés et la base
  commune (`changedFields` + `baseSnapshot`) ; les champs touchés des deux côtés
  avec des valeurs différentes produisent un **conflit explicite** consultable et
  résoluable champ par champ (page /conflicts) — jamais de *last-write-wins* silencieux.
- **Pull incrémental** : curseur sur `change_log`, jusqu'à 500 changements par cycle,
  suppressions incluses (`recordId` + tombstone).
- **Isolation des échecs** : une opération refusée par le serveur
  (`status: failed`) est réessayée seule, avec un repli exponentiel de 30 s à
  15 min ; elle ne bloque plus les opérations suivantes ni le pull.
- **Purge de l'historique serveur** : `change_log` et `processed_ops` sont
  purgés périodiquement (1 min après le démarrage, puis toutes les 6 heures —
  `server/src/db/purge.ts`, variable `PURGE_INTERVAL_MS`). Rétention de 90
  jours : les enregistrements actuels ne sont jamais touchés, mais un appareil
  resté hors ligne **plus de 90 jours** ne recevra pas les modifications purgées
  par le pull incrémental — dans ce cas, réamorcez-le (réinstallation). Les
  données sauvegardées au format JSON restent restaurables. Les opérations
  poussées à nouveau après plus de 90 jours perdent leur déduplication par
  `opId` (la garde anti-résurrection par révisions, elle, reste active).
- **Suppression contre édition hors ligne** : un `upsert` construit sur une base
  antérieure au tombstone (`baseRev` < révision de la suppression) ne ressuscite
  jamais la ligne. Le serveur répond `conflict` + `deleted: true` (champs
  abandonnés listés), le client retire sa ligne locale et l'utilisateur voit le
  conflit. Une recréation délibérée sur une base à jour reprend la numérotation
  après le tombstone (`rev` continu, jamais de retour à 1).

## Sauvegarde & restauration

Les exports XLSX/PDF sont des **rapports** (figés, non réimportables). La section
**Réglages → Sauvegarde** produit en plus une **archive JSON** de tout le foyer
(`src/core/backup.ts`) : comptes, catégories, opérations, budgets, épargne,
dettes, récurrences, valorisations du patrimoine, activités pro et membres.

- **Export** : fichier `budget-famille-AAAA-MM-JJ.json`, produit localement —
  aucun envoi réseau. Le fichier ne contient **ni jeton d'authentification, ni
  curseur de synchronisation, ni file d'attente, ni taux de change** : rien de
  transitoire ni de secret ne doit traîner dans une sauvegarde.
- **Restauration** : chaque enregistrement est réécrit dans Dexie puis **repasse
  par la file de synchronisation** (pas d'écriture directe côté serveur), avec
  `familyId` réécrit sur le foyer actif. Un enregistrement identique (hors champs
  de synchronisation) est ignoré : restaurer deux fois la même archive n'empile
  pas d'opérations. Une ligne déjà connue conserve sa révision comme base de
  fusion, donc seuls les champs réellement divergents côté serveur produisent des
  conflits — jamais d'écrasement silencieux.
- Le profil du foyer (nom, devise) n'est repris que si l'archive vient du **même
  foyer** ; sinon il est laissé intact.
- Un fichier étranger, un JSON invalide, une version future ou une table
  endommagée sont refusés avec un message explicite (`BackupError`).

## Invitation de foyer

Un foyer n'est plus réservé à un seul compte : l'administrateur génère un **code
d'invitation** depuis *Membres → Inviter un membre*, et la personne rejoint le
foyer soit à l'inscription (champ facultatif « Code d'invitation »), soit
depuis la page *Rejoindre un foyer* (`/join`).

- Code à 8 caractères lisibles **sans ambiguïté** (pas de I, L, O ni de 0, 1),
  usage **unique**, validité de **7 jours** ; rattaché en rôle `member`.
- Le rattachement serveur est une ligne `memberships` (migration `005`) :
  `requireAuth` résoud le foyer par la **plus récente adhésion**, aucune
  réémission de jeton n'est nécessaire. La logique sécurisée reste intacte :
  sans jeton vérifié, aucune route ne bouge.
- Le code validé n'accepte le nouveau compte qu'en **transaction** (verrou
  `FOR UPDATE`) : deux usages simultanés sont impossibles ; les erreurs sont
  distinctes (`invitation-unknown` / `invitation-expired` / `invitation-used`).
- Si le compte est **déjà membre** du foyer visé, `/auth/join` répond sans
  consommer le code (idempotent).
- Côté appareil, rejoindre un foyer **réamorce** la base locale autour du foyer
  distant (curseur remis à zéro, pull intégral, catégories d'amorce abandonnées)
  — les données locales non synchronisées sont perdues, l'écran le fait
  confirmer. Une inscription **par code** ne crée pas de foyer éphémère côté
  serveur.
- Les données du foyer partagé se synchronisent dans les deux sens (push/pull
  ordinaires) : testé de bout en bout contre PostgreSQL réel
  (`e2e-invite.mjs` à la racine du déploiement).
- Limites assumées : le rôle d'invité est `member` (personne ne gagne de droits
  administrateur par invitation) ; un compte peut être membre de plusieurs
  foyers, et le foyer actif est alors toujours la **plus récente** adhésion.
## Réinitialisation de mot de passe

Le serveur n'envoie pas d'e-mail. Deux voies autonomes, aucune dépendance
extérieure :

### 1. Code de l'administrateur du foyer

- Administration : *Membres → Réinitialiser un mot de passe* → code d'un usage
  unique, **30 minutes**, adresse e-mail **du même foyer** uniquement — le
  serveur rejette en `404 not-a-member` tout e-mail inconnu ou hors foyer.
- Le membre ouvre **Mot de passe oublié ?** sur l'écran de connexion (`/reset`) :
  adresse + code + nouveau mot de passe. Sans authentification, mais le code
  est vérifié **en transaction avec verrou `FOR UPDATE`** et une seule table
  (`password_resets`) : usage unique garanti.
- Seul le **SHA-256 du code** est stocké ; lire la base ne permet ni de
  retrouver un code, ni de s'authentifier. Les réponses de refus sont
  indiscernables (code inconnu, expiré ou déjà servi → `reset-invalid`) :
  rien n'oriente un essayage.

### 2. Phrase de secours personnelle (*Réglages → Phrase de secours*)

Indépendant du foyer et de l'administrateur : l'utilisateur enregistre une
**phrase personnelle** (16 caractères minimum, générable localement sur
l'appareil avec un bouton). Le serveur n'en garde qu'un **bcrypt** — personne
ne peut la relire ni la proposer. La phrase permet :

- la **réinitialisation de mot de passe** sans code ni adminnistrateur :
  `POST /auth/recovery-reset` (adresse + phrase + nouveau mot de passe),
  plafonnée par IP et par couple IP+e-mail (5 essais / 15 min) ;
- la **reprise d'un foyer en attente de récupération** (voir suppression) :
  `/auth/register` avec le même e-mail + `recoveryPhrase` (5 essais / 15 min).

Sans phrase de secours enregistrée, aucune revendication impossible : le
code d'administrateur reste la seule voie de secours.

## Suppression du compte

Réglages bas de page : **Supprimer mon compte** exige de **retaper son adresse
e-mail** (l'appareil est réamorcé : IndexedDB recréé, jeton jeté).

- Serveur, en transaction : toutes les **adhésions** sont retirées et la ligne
  utilisateur supprimée — l'adresse e-mail est **libérée immédiatement**
  (réinscription possible, 401 sur les anciens jetons).
- **Foyers partagés** (d'autres membres restent) : aucun changement, le foyer
  continue de vivre pour les autres.
- **Foyers dont vous étiez le seul membre**, avec phrase de secours :
  le foyer passe en **attente de récupération** pendant **30 jours** (fenêtre
  `recovery_expires_at`, migration `007`) — une réinscription du même e-mail
  avec la phrase le réactive en mode `admin`, **données intactes** (records,
  journal, opérations). À l'expiration, la purge périodique du serveur le
  supprime définitivement.
- **Foyers dont vous étiez le seul membre**, sans phrase de secours : aucune
  preuve de reprise possible — suppression **immédiate** avec leurs données
  (records, `change_log`, `processed_ops`), comme auparavant.

## Docker

```bash
cd mon-budget-famille
JWT_SECRET=$(openssl rand -base64 48) docker compose up --build
# API disponible sur http://localhost:4000 (front : votre bundle PWA habituel)
```

`Dockerfile` compile le serveur (`tsc`), ne garde que les dépendances de
production et tourne sous l'utilisateur `node` ; `docker-compose.yaml` fournit
PostgreSQL 17 et applique les migrations SQL au démarrage
(`node dist/db/migrate.js` est idempotent via `schema_migrations`).

Le chemin de production a été validé sans moteur Docker en suivant les mêmes
étapes que le stage `runtime` de l'image : `npm ci` → `tsc` →
`npm ci --omit=dev` → `node dist/db/migrate.js` → `node dist/index.js` +
`GET /api/v1/health` en 200. Le job CI Docker fait en plus un `docker compose
up --build` réel et sonde la santé de l'API sur `localhost:4000`.

Variables attendues (fichier `.env` côté compose, voir ci-dessus) :
`DATABASE_URL` (dérivé de `POSTGRES_*`), `JWT_SECRET` **obligatoire**
(32 caractères minimum), `CORS_ORIGIN`, `PURGE_*` (purge périodique).

## Intégration continue

`.github/workflows/ci.yml` exécute à chaque push ou PR :

- **Front** : typecheck + Vitest (188 tests) + build PWA.
- **API** : typecheck + migrations + les scripts E2E contre un vrai
  PostgreSQL 17 en service (`e2e-sync`, `e2e-delete`, `e2e-purge`,
  `e2e-invite`, `e2e-reset-delete`, `e2e-recovery-revival`), API relancée
  entre les scripts (`REGISTER_LIMIT_MAX` plafonne en mémoire le débit
  d'inscriptions, ajustable via une variable d'environnement).
- **Docker** : `docker compose up --build` et sonde HTTP de santé de l'API.

## Icônes et installation

`scripts/make-icons.mjs` génère sans dépendance les icônes PNG de la PWA
(`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`) à partir de la
géométrie de `public/icon.svg` : Android n'affiche son invite d'installation
qu'avec ces tailles, iOS ignore les SVG pour l'écran d'accueil. Le manifeste
déclare `scope`, `id` et n'impose plus d'orientation (tablette et ordinateur).

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

Une **réinitialisation de mot de passe** (code administrateur ou phrase de
secours) incrémente `users.token_version` (migration `014`) : les jetons émis
avant cessent immédiatement d'être acceptés, et il faut se reconnecter. Un jeton
sans `tv` (émis avant cette évolution) reste valable tant que le compte n'a pas
été réinitialisé.

Le secret est obligatoire (`server/src/config.ts`) : l'API refuse de démarrer
s'il est absent ou fait moins de 32 caractères. `CORS_ORIGIN` est une liste
blanche (séparée par des virgules) ; sans réglage, seules les origines de
développement `localhost:5173` / `127.0.0.1:5173` sont acceptées. Les routes
`/auth/login` (30 requêtes par IP et 10 par IP + e-mail / 15 min),
`/auth/register` (10 par heure et par IP, ajustable via `REGISTER_LIMIT_MAX`),
`/auth/recovery-reset` et la reprise de foyer (5 par IP+e-mail / 15 min) sont
limitées en mémoire.
