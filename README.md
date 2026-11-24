# Assistant Commercial

Application de gestion pour commerçants : ventes, dépenses, stock, crédit
clients, dettes fournisseurs, devis et factures, bilans, trois langues
(français, anglais, arabe) et sauvegarde dans le cloud.

Toute écriture enregistrée peut être corrigée ou supprimée (vente, dépense,
devis, facture, paiement, achat fournisseur) : les totaux et le stock sont
recalculés, et la suppression ne revient pas après synchronisation. Le coût
d'achat est demandé sur les ventes hors stock, et le bilan le signale quand il
manque (bénéfice estimé).

## Ce qu'il y a ici

- `public/` : l'application (HTML, CSS, JavaScript, service worker, icônes).
  Aucune compilation n'est nécessaire.
- `worker.js` : le serveur (comptes, sessions, synchronisation, mot de passe
  oublié) pour Cloudflare Workers avec une base D1.
- `sites-manifest.json` : la description du déploiement.

## Déploiement

L'application est hébergée sur Freebuff Sites (Cloudflare Workers + D1) :

- production : https://site-a48ebaa71ce945cc8ab9ac9be7f59aa8.freebuff.page
- aperçu : https://site-76790ebf295d4dc6ace09a7ebc4544ad.freebuff.page

Le serveur a besoin de la liaison D1 `DB`. Pour activer l'envoi des e-mails de
réinitialisation, ajouter dans Sites → Secrets :

- `RESEND_API_KEY` : clé API Resend ;
- `MAIL_FROM` : adresse d'expédition vérifiée, par exemple
  `Assistant Commercial <compte@votre-domaine.com>`.

Pour que les codes de récupération partent aussi par SMS (utile aux boutiques
inscrites avec un simple numéro), ajouter :

- `SENT_API_KEY` : clé API du fournisseur SMS (sent.dm) ;
- `SENT_PROJECT_ID` : identifiant du projet chez ce même fournisseur.

L'adresse du support se règle dans `/admin` (onglet Réglages) : numéro WhatsApp
et, en repli, e-mail du support. Ni l'un ni l'autre n'est écrit dans le code.

Sans ces réglages, l'application fonctionne normalement ; seuls l'envoi
automatique des codes et les boutons d'assistance sont désactivés.

## Développement local

```bash
npm install     # une seule fois (installe Wrangler)
npm run dev     # Worker + application + base D1 locale sur http://127.0.0.1:8787
```

`npm run dev` démarre Wrangler avec la configuration `wrangler.jsonc` : les
assets de `public/`, l'API `/api/*` et une base D1 **locale** (aucun compte
Cloudflare, aucune donnée en ligne). On peut donc créer un compte, se
connecter et vérifier la synchronisation entre deux navigateurs.

- Les données locales sont dans `.wrangler/state` ; `npm run dev:reset` les
efface (comptes et boutiques comprises).
- `npm test` vérifie les calculs (crédit, TVA, stock, montants) et la fusion
  entre deux appareils, sans dépendance : `node --test`.
- `public/sw.js` et `public/version.json` sont **générés** : `npm run cache`
  (appelé aussi par `npm run dev`) calcule une version à partir du contenu de
  `public/` et la liste des fichiers préchargés. Ne pas les modifier à la main ;
  `npm test` échoue si `sw.js` est périmé.
- En développement, le service worker est désactivé pour que chaque
  modification soit visible ; `http://127.0.0.1:8787/?sw=1` l'active pour
  tester une mise à jour (bannière « Nouvelle version prête »).
- `npx wrangler d1 execute assistant-commercial --local --command "SELECT email FROM users"`
  permet de relire la base.

Servir `public/` seul (`npx serve public`) n'affiche que l'interface : sans le
Worker, l'inscription et la synchronisation restent bloquées sur l'écran de
connexion, puisque le compte est obligatoire.

## Données

Chaque compte possède un état JSON dans la table `state`. À chaque sauvegarde
le serveur incrémente une révision ; une sauvegarde basée sur une révision
ancienne est refusée puis fusionnée enregistrement par enregistrement côté
application (ventes, paiements, stock, documents).

Les dix états précédents sont conservés dans `state_history`. Réglages →
« Versions enregistrées » permet de restaurer une version ; l'état remplacé
passe lui-même dans l'historique, donc une restauration reste réversible.

## Icônes de l'application

`npm run icons` régénère les quatre icônes d'installation depuis
`docs/logo-source.webp`, l'image fournie par la boutique. Elle contient la
tuile carrée du logo **et** le mot « ASSISTANT COMMERCIAL » : seule la tuile
est reprise, le nom est affiché par le système.

- Géométrie : tuile de 365 px de côté, coin supérieur gauche en (519, 186) dans
  l'image 1408 × 768 ; ce sont les trois valeurs à ajuster si le logo change.
- Sorties : `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (logo à
  86 % du carré, contenu dans la zone sûre de 80 % d'Android) et
  `apple-touch-icon.png` (180 px, fond opaque).
- Encodage : PNG **truecolor**, sans palette, pour ne pas aplatir le dégradé.
  Attention : sur `sharp`, `png({ effort: 10 })` quantifie en palette ; le
  script s'en tient à `compressionLevel: 9` (vérifiable avec l'octet
  `colorType` de l'en-tête PNG : 2 ou 6, jamais 3).
- Après génération, `npm run cache` : les icônes font partie du préchargement
  et changent donc la version du service worker.

## Préparer une publication

Avant de publier, `npm run deploy:prepare` régénère `sw.js` et `version.json`,
vérifie qu'ils sont à jour et contrôle que `sites-manifest.json` publie bien
`public/` avec le service worker. Un `sw.js` périmé ferait servir une ancienne
version de l'application.

## Ancienne adresse Render

Le dépôt contient un petit serveur (`server.js`) qui ne fait qu'une chose :
rediriger l'ancienne adresse Render vers l'application en ligne. Aucune donnée
n'y est stockée.

Sur Render, dans le service existant :

- Build Command : `npm install`
- Start Command : `npm start`
- puis « Manual Deploy » → « Clear build cache & deploy ».

L'adresse `https://mon-budget-famille-web.onrender.com` ouvrira alors
directement Assistant Commercial. Attention : ce service servait l'ancienne
application « Mon Budget Famille » ; elle sera remplacée par cette redirection.
