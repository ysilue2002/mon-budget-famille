# Tour complet avant de montrer l'application aux commerçants

Vérification faite sur la version en ligne, avec le compte de test, sur un écran
de téléphone (390 et 430 px), en français et en arabe. Aucune erreur dans la
console du navigateur, aucun débordement sauf celui noté ci-dessous.

## À corriger avant la première démonstration

1. **L'écran Documents déborde sur téléphone.** La page mesure 607 px de large
   pour un écran de 390 px : les boutons Imprimer / WhatsApp / Télécharger /
   Facture sortent de l'écran. Les faire passer à la ligne sous le titre du
   document. C'est le seul écran dans ce cas.

2. **Une erreur de saisie ne peut pas être corrigée.** Une vente, une dépense,
   un devis, une facture, un paiement ou une dette une fois enregistrés n'ont
   ni modification ni suppression. Pour un commerçant, une faute de frappe sur
   10 000 au lieu de 1 000 fausse la caisse, le stock et le bilan, sans recours.
   C'est le point qui peut le plus faire perdre confiance. À prévoir : supprimer
   ou corriger une ligne, avec confirmation et remise en stock si un article
   était concerné.

3. **« Mot de passe oublié » ne peut pas envoyer d'e-mail.** Sans clé Resend,
   le serveur répond honnêtement que l'envoi n'est pas activé. Un commerçant qui
   oublie son mot de passe perd l'accès à son compte et à ses données. Activer
   Resend et un domaine avant la démonstration, ou prévoir un dépannage manuel.

4. **Le bénéfice est faux pour les ventes sans article.** Le coût des
   marchandises n'est connu que si la vente est liée à un article du stock.
   Sinon le coût vaut zéro : le bilan affiche un bénéfice trop élevé. Demander
   le prix d'achat au moment de la vente, ou afficher un avertissement clair
   « bénéfice estimé ».

5. **WhatsApp n'envoie pas toujours le PDF.** Sur téléphone, la fenêtre de
   partage propose le PDF en pièce jointe. Sur ordinateur, le PDF se télécharge
   et WhatsApp s'ouvre avec le message seul. À expliquer dans l'application,
   sinon on croira que le fichier a été envoyé.

## Améliorations importantes

6. **Réglages trop longs.** 21 champs, 12 boutons, 3 509 px de haut sur un
   écran de 900 px. Un débutant s'y perd. Regrouper en sections repliées :
   Boutique, Documents, Compte, Informations légales, Sauvegarde.

7. **Moyens de paiement figés en français** (Espèces, Orange Money, Wave, MTN,
   Moov, Banque) dans une application trilingue. À traduire, et si possible à
   rendre modifiables selon le pays.

8. **Informations légales encore « à compléter »** dans les pages du même nom.

9. **Pas de rappel de sauvegarde.** Toutes les données d'un téléphone peuvent
   disparaître si l'on efface le navigateur ou si l'on réinstalle. Proposer un
   export tous les mois, ou un rappel à l'ouverture.

10. **Pas d'annulation d'un paiement.** Un paiement client ou fournisseur saisi
    par erreur reste dans l'historique et dans les totaux.

11. **Suppression d'un client ou d'un fournisseur sans avertissement** sur
    l'historique lié. Prévenir que les ventes et dettes resteront, mais sans
    coordonnées.

## Confort et finition

12. **Premiers écrans vides.** Prévoir un jeu d'exemple ou un message qui guide
    le premier geste (« Enregistrez votre première vente »), plutôt qu'un écran
    à zéro.
13. **Aide absente de l'application.** Le mode d'emploi et les fiches existent
    en dehors ; un bouton « Comment ça marche » dans Réglages aiderait.
14. **Montants arrondis à l'unité.** Correct en FCFA, gênant si la devise est
    l'euro ou le dirham. Prévoir les décimales quand la devise en a besoin.
15. **Pas de PDF du bilan** (seuls devis, factures, fiches et listes le sont).
16. **Mise à jour de l'application** : après un déploiement, il faut rafraîchir
    une fois. Une invitation « Nouvelle version disponible » serait plus claire.
17. **Aucun test automatisé.** Les vérifications sont manuelles ; une panne peut
    passer inaperçue après une modification.
18. **Accessibilité** : boutons petits sur téléphone, pas de contour de focus
    visible au clavier, contrastes parfois faibles sur les textes secondaires.

## Ce qui est déjà solide

- Trois langues, arabe de droite à gauche sans débordement.
- Fonctionne hors connexion, synchronisation multi-téléphones.
- Devis et factures au modèle fourni, PDF, impression A4 et ticket.
- Comptes, sessions, limitation des tentatives, en-têtes de sécurité.
- États fournisseurs, non-livraisons, relances, exports tableur.
- Pages légales et conditions d'utilisation intégrées, version PDF.
