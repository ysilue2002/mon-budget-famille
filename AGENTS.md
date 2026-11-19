# Assistant Commercial — règles du projet

## À qui parle l'application
Des commerçants et des vendeurs, sur un téléphone, souvent peu à l'aise avec
l'écrit. Chaque écran doit rester utilisable par quelqu'un qui lit peu ou pas.

## Règles d'interface (à respecter dans chaque lot)
- Une action = un gros bouton avec une icône **et** un mot simple. Jamais une
  phrase à comprendre avant de pouvoir agir.
- Textes courts : une ligne. Pas de jargon (« rattacher », « synchroniser »,
  « identifiant ») sans mot courant à côté.
- L'information importante passe aussi par une couleur, une forme ou une icône,
  pas seulement par du texte.
- Tout ce qui se touche fait au moins 44 px de haut, avec une police d'au moins
  16 px. Les sélecteurs et les champs comptent.
- Un message d'erreur dit **quoi faire**, pas ce qui a échoué techniquement.
- Pas de menu caché ni de geste non signalé ; le chemin principal tient en deux
  tapes.
- Filtrer avec de gros boutons plutôt qu'avec un champ de recherche seul.
- Confirmer avant de supprimer ; proposer un choix plutôt qu'une saisie libre.
- Le français est la langue de référence ; toute nouvelle phrase doit exister en
  fr/en/ar dans `public/i18n.js`.

## Vérification avant de livrer
- Tester en dev sur un écran étroit et se poser la question : « un vendeur qui
  lit peu peut-il faire ça seul, du premier coup ? »
- Vérifier que rien d'essentiel n'est écrit en petit ou en gris clair.
