# Ancienne adresse Render et nom de domaine

## 1. Faire pointer l'ancienne adresse Render vers l'application

Le dépôt GitHub contient maintenant deux petits fichiers, `package.json` et
`server.js`. Ce serveur ne stocke rien : il redirige simplement vers
l'application en ligne.

Étapes sur Render (compte « mon budget famille ») :

1. Ouvrir le service `mon-budget-famille-web`.
2. Aller dans **Settings**.
3. **Build Command** : écrire `npm install`.
4. **Start Command** : écrire `npm start`.
5. Enregistrer, puis **Manual Deploy** → **Clear build cache & deploy**.
6. Attendre la fin du déploiement, puis ouvrir
   `https://mon-budget-famille-web.onrender.com` : la page doit basculer
   immédiatement vers Assistant Commercial.

À savoir : ce service faisait tourner l'ancienne application « Mon Budget
Famille ». Elle sera remplacée par cette redirection. Si vous voulez la garder,
créez un second service Render pour la redirection au lieu de réutiliser
celui-ci.

## 2. Adresse plus courte avec un nom de domaine

L'application est en ligne ici :
https://site-a48ebaa71ce945cc8ab9ac9be7f59aa8.freebuff.page

Pour une adresse du type `assistant-commercial.com` :

1. Choisir et acheter le nom chez un registrar (Namecheap, OVH, Gandi, ou un
   registrar local pour `.ci`, `.sn`, `.bf`). Compter 10 à 15 € par an.
2. Le nom doit être à votre nom, avec une adresse e-mail que vous consultez.
3. Ensuite, le nom se rattache à l'application depuis le tableau de bord de
   l'hébergement, ou en me donnant le nom choisi pour que je prépare les
   réglages.
4. Vérifier après rattachement : ouverture du site, connexion au compte, et
   téléchargement d'un devis PDF.

Noms proposés (à vérifier disponibles) : `assistant-commercial.com`,
`monassistantcommercial.com`, `assistantboutique.com`, `macaisse.app`.

Tant que le domaine n'est pas rattaché, l'adresse Render redirigée et l'adresse
Freebuff restent utilisables.

## 3. Après la redirection

- Les données ne changent pas : elles restent dans votre compte, sur la
  nouvelle application.
- Sur un téléphone, si l'ancienne adresse est installée comme application,
  la désinstaller puis réinstaller depuis la nouvelle adresse.
- Les PDF de devis et factures ne dépendent pas de l'adresse : ils se
  téléchargent et s'envoient comme avant.
