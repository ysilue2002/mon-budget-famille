# Assistant Commercial

Application de gestion pour commerçants : ventes, dépenses, stock, crédit
clients, dettes fournisseurs, devis et factures, bilans, trois langues
(français, anglais, arabe) et sauvegarde dans le cloud.

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

Sans ces deux réglages, l'application fonctionne normalement ; seul l'envoi du
lien « mot de passe oublié » est désactivé.

## Développement local

Servir le dossier `public/` avec n'importe quel serveur statique, par exemple :

```bash
npx serve public
```

La synchronisation et les comptes nécessitent le Worker et la base D1 ; sans
eux, l'application reste utilisable hors ligne sur l'appareil.

## Données

Chaque compte possède un état JSON dans la table `state`. À chaque sauvegarde
le serveur incrémente une révision ; une sauvegarde basée sur une révision
ancienne est refusée puis fusionnée enregistrement par enregistrement côté
application (ventes, paiements, stock, documents).
