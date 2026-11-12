# Assistant Commercial — application en ligne

Adresse de production : https://site-a48ebaa71ce945cc8ab9ac9be7f59aa8.freebuff.page

Adresse d'aperçu (base séparée) : https://site-76790ebf295d4dc6ace09a7ebc4544ad.freebuff.page

Code : dépôt `ysilue2002/mon-budget-famille`, branche `assistant-commercial`.
L'ancienne application n'y existe plus.

## Ce qui est fait et vérifié

| Exigence du cahier des charges | État |
| --- | --- |
| PWA installable, hors ligne | Fait : manifeste, service worker, ouverture sans réseau |
| **Compte avec e-mail et numéro de téléphone** | **Fait, testé** : création, connexion, déconnexion |
| **Synchronisation entre appareils** | **Fait, testé** : envoi, récupération, rafraîchissement automatique et fusion écriture par écriture |
| **Mot de passe oublié** | **Fait, testé côté application** : lien par e-mail valable 1 heure ; envoi à activer avec une clé Resend |
| Accueil : choix de la langue puis connexion | Fait, testé : français / anglais / arabe, puis connexion ou création de compte **obligatoire** |
| Connexion par e-mail **ou** par téléphone | Fait, testé : un seul champ accepte l'un ou l'autre |
| Informations de la société | Fait : pays, ville, quartier, adresse, forme de société, repris sur les documents |
| Monnaie selon le pays | Fait : déduite du pays (pas de liste de monnaies), appliquée à tous les montants |
| Bouton Paramètres dans la barre | Fait : sixième bouton en bas, ouvre le profil et la déconnexion depuis n'importe quel écran |
| Logo de la boutique | Fait : choisi dans Réglages, affiché en haut des devis et factures imprimés |
| Aperçu avant impression | Fait, testé : logo et informations de la société, choix A4 ou ticket 58 mm |
| Changement de mot de passe | Fait, testé : depuis Réglages, avec le mot de passe actuel, sans e-mail |
| Dupliquer un document | Fait, testé : copie un devis ou une facture avec un nouveau numéro et la date du jour |
| PDF par WhatsApp | Fait : vrai fichier PDF, partagé via le menu du téléphone (WhatsApp) ; sinon téléchargé et WhatsApp ouvert |
| Rechercher un document | Fait, testé : par client, numéro, date ou montant, sans recharger l'écran |
| Reçu WhatsApp après une vente | Fait, testé : proposition après chaque vente, plus un bouton « Reçu » sur chaque vente du jour |
| Historique des ventes | Fait, testé : écran dédié, filtre par période, par moyen de paiement et recherche (client, article, montant), avec total vendu, encaissé et restant |
| Reçu en PDF | Fait, testé : reçu format ticket (80 mm) avec logo et infos boutique, à partager par WhatsApp ; téléchargé si le téléphone ne sait pas partager |
| Coordonnées du client sur les documents | Fait, testé : nom, téléphone et adresse du client sont saisis sur le devis et apparaissent à l'impression, dans l'aperçu et dans le PDF |
| TVA | Fait, testé : taux réglable dans les Paramètres, appliqué aux nouveaux devis, avec Total HT, montant de la TVA et Total TTC (18 % essayé : 10 000 HT → 1 800 de TVA → 11 800 TTC) |
| PDF du devis téléchargeable et envoyable | Fait, testé : bouton Télécharger (fichier PDF valide), envoi WhatsApp et envoi e-mail avec le fichier joint sur téléphone ; sur ordinateur, l'e-mail s'ouvre sans pièce jointe (limite du navigateur) |
| Fournisseurs | Fait, testé : liste des fournisseurs avec téléphone et adresse, fiche d'ajout, bouton WhatsApp, et l'onglet s'appelle « Clients / Fournisseurs » |
| Achats de marchandise | Fait, testé : achat comptant, partiel ou à crédit, avec article et quantité, indicateur « Non livré », bouton « Marquer livré » qui entre la marchandise en stock, et paiement partiel au fournisseur |
| Précision sur une dépense | Fait, testé : champ libre en plus du motif (exemple : transport marché Adjamé), affiché dans la liste du jour |
| Marchandise livrée ou non | Fait, testé : en choisissant « Marchandise » comme motif, une case « Marchandise livrée » apparaît (cochée par défaut) ; décochée, la dépense porte « Non livré » dans la liste du jour et dans l'écran « Achats non livrés », avec un bouton « Marquer livré ». Les autres motifs n'affichent pas cette case |
| Fournisseur saisi depuis la dépense | Fait, testé : pour Marchandise, champs nom du fournisseur, téléphone, adresse et paiement Comptant / Partiel / À crédit (montant déjà payé si partiel). Le fournisseur est créé ou complété automatiquement, sans passer par la fiche fournisseur. Essai : 30 000 à crédit partiel avec 12 000 payés → fiche fournisseur créée avec téléphone et adresse, 18 000 restants dans l'état du fournisseur |
| Toutes les non-livraisons | Fait, testé : l'écran « Achats non livrés » affiche le nombre et le total des marchandises non livrées (achats fournisseurs et dépenses marchandise), avec le nombre de jours au-delà de 7 jours et un bouton « Marquer livré » qui met à jour la dépense liée |
| Compte par e-mail ou par téléphone | Fait, testé : à l'inscription, l'utilisateur choisit « Par e-mail » ou « Par téléphone » et ne remplit qu'un seul champ. Le serveur accepte un compte sans e-mail (colonne facultative, migration atomique de la table). Essai sur l'aperçu : inscription au +225 07 99 12 34 56 sans e-mail, compte créé (e-mail vide), déconnexion puis reconnexion avec le même numéro. Les comptes e-mail existants fonctionnent toujours |
| Icône d'installation | Fait, vérifié : nouveau logo (reçu blanc et sceau vert sur fond vert dégradé), icônes 192, 512, maskable et Apple 180. Les quatre fichiers répondent en ligne et le manifeste les déclare |
| Ajouter un e-mail à un compte téléphone | Fait, testé : dans Réglages, un compte sans e-mail voit « Ajouter mon e-mail » avec une phrase expliquant la récupération du mot de passe. Essai sur l'aperçu : ajout de artisan.telephone@exemple.com à un compte créé par téléphone, confirmation affichée, déconnexion puis connexion avec cette adresse réussie. Un e-mail invalide ou déjà pris est refusé, et l'envoi sans compte est bloqué |
| Pages légales en PDF et en trois langues | Fait, testé : bouton PDF sur chaque page légale (passage par la fenêtre d'impression, puis « Enregistrer au format PDF »). Le texte reste en français, référence légale ; en anglais et en arabe la note de référence est traduite et la page reste lisible de gauche à droite |
| Pages légales dans l'application | Fait, testé : Réglages contient « Informations légales » (raison sociale, adresse du siège, RCCM, IFU, contact, responsable de la publication) et deux boutons ouvrant « Mentions légales et confidentialité » et « Conditions d'utilisation ». Les champs non remplis s'affichent « à compléter ». Essai : informations enregistrées puis affichées dans la page, aucune mention manquante, 10 sections des conditions présentes |
| Clients et fournisseurs sans formulaire | Fait, testé : les cartes « Ajouter un client », « Ajouter un fournisseur » et « Achat de marchandise » ont été retirées. Les clients viennent des ventes, les fournisseurs et achats de la dépense Marchandise ; les listes et les états restent affichés |
| Coordonnées à la vente | Fait, testé : la fenêtre de vente demande le nom, le téléphone et l'adresse du client. Un client inconnu est créé automatiquement, un client connu est complété s'il manquait ses coordonnées. Essai : vente à « Client TestCoordonnees » → fiche créée avec 0700000088 et Adjamé |
| Bilan : coût des ventes et non encaissé | Fait, testé : le bilan affiche le coût des articles vendus sur la période et l'argent non encore encaissé (ventes de la période moins ce qui a été reçu) |
| Documents : WhatsApp avec PDF | Fait, testé : les boutons Dupliquer, PDF et E-mail sont retirés. Un seul bouton « Envoyer par WhatsApp » partage le PDF (devis ou facture) avec le message ; le téléchargement et l'impression restent |
| Modèle de devis | Fait, testé : le devis et la facture imprimés et en PDF reprennent le modèle fourni — barres noires haut et bas, grand titre DEVIS / FACTURE avec le numéro, Numéro et Date à droite, deux cadres arrondis (entreprise avec logo et coordonnées, client), tableau bordé Description / Quantité / Prix unitaire HT / Total HT, encadré TVA et Total TTC, mentions de bas de page. Aperçu vérifié et PDF généré (1 page) |
| État des fournisseurs | Fait, testé : dans Clients / Fournisseurs, l'onglet Fournisseurs montre d'abord l'état : total des achats, total restant à payer, nombre de marchandises non livrées, puis « Ce que je dois » par fournisseur, « Marchandises à recevoir » avec bouton Marquer livré et rappel WhatsApp, et « Fournisseurs à jour ». Les fiches s'ouvrent avec un bouton Payer par achat. Essai : 10 000 non livrés et 5 000 soldés → reste 10 000 affiché, paiement de 4 000 enregistré, reste 6 000, livraison marquée |
| Modifier ou supprimer un article | Fait, testé : modification du nom, des prix, du seuil d'alerte et de la quantité ; suppression avec confirmation. L'historique des ventes reste intact |
| Exporter l'historique des ventes | Fait, testé : bouton « Exporter (tableur) » qui respecte la période, le moyen de paiement et la recherche en cours ; fichier CSV lisible par Excel (colonnes Date, Client, Article, Quantité, Total, Payé, Reste, Moyen de paiement) |
| Modifier ou supprimer un client | Fait, testé : fiche client (nom, téléphone, adresse) modifiable ; un changement de nom met à jour ses ventes et ses documents ; la suppression retire la fiche et garde l'historique |
| Modifier ou supprimer un fournisseur | Fait, testé : même principe, avec mise à jour de ses achats ; l'historique est conservé |
| Détail par fournisseur | Fait, testé : bouton « Détail » qui affiche le total des achats, le montant payé, le reste à payer et la liste des achats avec l'état livré / non livré (essai : 65 000 achetés, 35 000 payés, 30 000 restants) |
| Exporter les contacts | Fait, testé : fichier CSV avec Type, Nom, Téléphone, Adresse, Reste dû, clients et fournisseurs réunis ; le reste dû est calculé pour chacun |
| Détail par client | Fait, testé : bouton « Détail » avec total des ventes, argent encaissé, reste à payer et liste de ses ventes (essai : 21 000 vendus, 11 000 encaissés, 10 000 restants) |
| Récapitulatif des achats non livrés | Fait, testé : écran « Achats non livrés » groupé par fournisseur avec le reste à payer, bouton « Imprimer la liste » (en-tête boutique, une ligne par achat, total) et envoi du récapitulatif par WhatsApp au fournisseur |
| Fiche fournisseur imprimable | Fait, testé : depuis « Détail », bouton « Imprimer la fiche » avec en-tête boutique, coordonnées du fournisseur, totals acheté / payé / restant, tableau des achats (avec livré ou non) et tableau des paiements enregistrés |
| Relances des clients en retard | Fait, testé : carte « À relancer » qui détecte seule les crédits dépassant le délai réglé, avec ancienneté, montant dû et bouton Relancer qui ouvre WhatsApp avec le message de relance (le message rappelle tout ce que le client doit) |
| Délai de relance réglable | Fait, testé : réglage « Délai de relance (jours) » dans les Paramètres, 30 par défaut. Essai : 30 → 1 client en retard, 60 → 0, 10 → 1, et le texte de la carte suit la valeur |
| Fiche client imprimable | Fait, testé : depuis « Détail », bouton « Imprimer la fiche » avec en-tête boutique, coordonnées du client, totals vendu / encaissé / restant, tableau des ventes et tableau de ses documents (essai : 34 000 vendus, 29 000 restants, 2 ventes, 1 devis) |
| Mode de paiement d'un achat | Fait, testé : mention automatique « Comptant », « Partiellement payé » ou « À crédit » selon le montant déjà payé, dans la liste des achats, la fiche fournisseur et la feuille imprimée |
| Livraison des ventes | Fait, testé : case « Marchandise livrée » à l'enregistrement d'une vente (cochée par défaut). Une vente non livrée porte la mention « Non livré » dans la liste du jour et l'historique, avec un bouton « Marquer livré » |
| E-mail du client et envoi serveur du PDF | Fait, testé côté serveur : champ « E-mail du client » sur le devis, affiché sur le document, puis envoi du PDF en pièce jointe par le serveur (Resend). Sans session → refusé (401), PDF vide ou e-mail invalide → refusé (400), origine étrangère → refusée (403), 20 envois par jour et par compte maximum. L'envoi réel reste inactif tant que `RESEND_API_KEY` n'est pas ajoutée : l'application propose alors le partage du fichier par le téléphone |
| Limites et sécurité | Fait, testé : 20 échecs de connexion par 15 minutes et par adresse, 10 inscriptions et 30 demandes de mot de passe par heure, en-têtes `x-frame-options`, `x-content-type-options`, `referrer-policy` et `permissions-policy` présents sur le site |
| Icône d'état de synchronisation | Fait : « sauvegardé », « envoi… », « en attente », « hors ligne » |
| Ventes et dépenses en deux gestes | Fait, moyens de paiement séparés |
| Prélèvement personnel isolé | Fait, hors bénéfice |
| Stock : achat, vente, marge, alertes, valeur | Fait |
| Crédit clients, paiement partiel | Fait, « argent dehors » recalculé |
| Dettes fournisseurs | Fait |
| Numérotation DEV/FAC par année | Fait, sans trou |
| Devis en facture en un geste | Fait |
| PDF et impression A4 / ticket 58 mm | Fait par la fenêtre d'impression (« Enregistrer en PDF ») |
| Partage WhatsApp et e-mail | Fait pour chaque document |
| Relance WhatsApp à cinq variables | Fait, texte modifiable et suivi par langue |
| Trois langues, arabe inversé | Fait |
| Bilans jour / mois / année | Fait |
| Publicité haut et bas, fermable, masquée hors ligne | Emplacements présents, désactivés par défaut |
| Partage de l'application | Fait : partage natif, sinon copie du lien |
| Mise en production | Faite sur l'hébergement Sites (Cloudflare), base séparée de l'aperçu |
| Code QR de partage | Fait, testé : code affiché dans Réglages → Partager, avec le lien et la copie |
| Bouton d'installation | Fait : Réglages → Installer l'application, avec les étapes Android et iPhone |

## À la première ouverture

1. Choix de la langue : français, anglais ou arabe (l'arabe inverse l'écran).
2. Écran de connexion ou de création de compte. **Le compte est obligatoire** :
   il n'y a plus de mode « sans compte ».
3. À la création : e-mail, téléphone, mot de passe, ainsi que la forme de
   société, le pays, la ville, le quartier et l'adresse. La monnaie est déduite
   du pays (par exemple Côte d'Ivoire → FCFA, France → €) : il n'y a pas de
   liste de monnaies à parcourir.
4. Ensuite, le nom de la boutique est demandé, puis l'application s'ouvre.

Pour se connecter, un seul champ suffit : l'e-mail **ou** le numéro de
Téléphone, avec le mot de passe. Un numéro peut s'écrire avec ou sans
indicatif pays. Un même numéro ne peut pas servir à deux comptes.

## Le compte, en détail

- L'écran **Réglages → Mon compte** demande l'adresse e-mail, le numéro de
  téléphone et un mot de passe de huit caractères minimum.
- Le mot de passe est haché en PBKDF2-SHA256 (100 000 tours, sel aléatoire) et
  n'est jamais stocké en clair.
- La session est un cookie `HttpOnly`, `Secure`, valable 30 jours.
- Une adresse déjà utilisée est refusée, même écrite en majuscules.
- Une fois connecté, chaque saisie est envoyée au serveur 1,2 seconde plus
  tard ; l'indicateur en haut à droite passe à « sauvegardé ».
- Sur un second téléphone : se connecter avec le même e-mail et le même mot de
  passe, les données reviennent.
- **Deux téléphones ouverts en même temps** : chaque téléphone redemande le
  cloud toutes les 20 secondes, et dès qu'il revient à l'écran, au clic ou à la
  reconnexion réseau. Une vente saisie sur le premier apparaît donc sur le
  second sans rien recharger. L'écran Réglages → Mon compte affiche l'heure de
  la dernière sauvegarde.
- Le serveur tient un **numéro de révision** incrémenté à chaque sauvegarde :
  un téléphone qui envoie une version plus ancienne est refusé et reçoit la
  version du cloud. Cela protège même si les horloges des deux téléphones ne
  sont pas à la même heure.

## Informations sur les documents

Les devis et factures imprimés (A4 et ticket) portent en en-tête : le logo
facultatif, le nom de la boutique, la forme de société, l'adresse, le quartier,
la ville, le pays, le téléphone et l'e-mail du compte. Tous les montants utilisent la monnaie du pays
choisi. Ces informations se modifient dans Réglages, et se synchronisent entre
les téléphones.

## Vérifié en conditions réelles

Essai complet, avec de vrais clics et de vraies requêtes :

- Refus d'un e-mail invalide, d'un téléphone de trois chiffres, d'un mot de
  passe trop court.
- Création d'un compte `awa2@exemple.com` avec le numéro `+225 05 44 33 22 11`,
  session ouverte, compte relu depuis le serveur.
- Envoi des données : sauvegarde confirmée (révision 2).
- Vidage du stockage local, puis récupération : la boutique « Chez Awa » revient,
  indicateur « sauvegardé ».
- Déconnexion : l'accès aux données est refusé (401). Reconnexion avec un
  mauvais mot de passe : refusée. Avec le bon : acceptée.
- Création en double avec la même adresse en majuscules : refusée.
- **Deux téléphones simulés** avec deux sessions séparées sur le même compte :
  le second reçoit la boutique, y ajoute une vente, le premier la voit arriver
  au rafraîchissement automatique. Une version périmée envoyée par le premier
  est refusée et remplacée par celle du cloud. Après déconnexion, l'accès est
  refusé (401).
- Le reste de l'application (vente, stock, crédit, avenant, impression, trois
  langues) a été testé à l'étape précédente et fonctionne toujours.

## Limites à connaître

1. **Le numéro de téléphone est enregistré, mais pas vérifié par SMS.** Il sert
   à vous joindre et à retrouver le compte, pas de seconde preuve.
2. **La fusion est faite écriture par écriture** : ventes, dépenses, articles,
   clients, documents et mouvements de stock s'additionnent, y compris les
   paiements partiels. Si les deux téléphones modifient le *même*
   enregistrement au même moment, la dernière modification de cet
   enregistrement gagne.
3. **Le mot de passe oublié envoie un e-mail**, mais l'envoi doit être activé
   avec une clé Resend et une adresse d'expédition vérifiée (voir plus bas).
4. Les données sont stockées en un seul bloc JSON par compte, ce qui suffit pour
   une boutique mais pas pour des milliers d'écritures.
5. La publicité reste éteinte sans compte AdSense.
6. **La production Sites remplace l'ancien site Render** : nouvelle adresse et
   base de données séparée (les comptes créés en aperçu n'y sont pas).
7. **Le compte est obligatoire** : la première ouverture demande une connexion
   internet pour créer le compte. Ensuite, l'application fonctionne hors ligne
   sur le téléphone et se resynchronise au retour du réseau.

## Mot de passe oublié

1. Réglages → Mon compte → « Mot de passe oublié ? ».
2. Le commerçant écrit l'adresse du compte ; le serveur crée un jeton valable
   une heure (un seul par compte, l'ancien est effacé, un nouvel envoi n'est
   possible qu'après 5 minutes).
3. Le lien reçu ouvre l'application avec un formulaire « nouveau mot de passe ».
4. Après l'enregistrement, toutes les sessions du compte sont fermées ; il faut
   se reconnecter avec le nouveau mot de passe.
5. La réponse est toujours la même, que le compte existe ou non : impossible de
   deviner les adresses inscrites.

Pour que les e-mails partent vraiment, deux réglages sont nécessaires dans
Sites → Assistant Commercial → Secrets :

- `RESEND_API_KEY` : clé créée sur resend.com (offre gratuite).
- `MAIL_FROM` : adresse d'expédition vérifiée dans Resend, par exemple
  `Assistant Commercial <compte@votre-domaine.com>`.

Sans ces réglages, le formulaire répond « l'envoi d'e-mails n'est pas encore
activé » et aucune donnée n'est modifiée.

## Prochaines étapes

1. Activer l'envoi d'e-mails avec Resend pour le mot de passe oublié.
2. Reprendre un nom de domaine propre.
3. Vérifier le numéro de téléphone par SMS.

## Dépôt GitHub

Le dépôt `ysilue2002/mon-budget-famille`, branche `main`, ne contient plus
l'ancienne application : tout le code React/Express a été retiré et remplacé
par `public/`, `worker.js`, `sites-manifest.json` et ce README. Le commit est
`e2a150d`.

Le projet Supabase et les services Render existent toujours dans leurs
tableaux de bord, avec leurs adresses. En revanche, Render ne peut pas
construire cette version (ce n'est plus une application Node) : l'ancien site
ne sera plus mis à jour et peut être suspendu depuis Render. La nouvelle
application est hébergée sur Sites.

Le détail de l'application est dans le `README.md` à la racine du dépôt.
