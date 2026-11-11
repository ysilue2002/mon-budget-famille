# Assistant Commercial

Vendre, suivre le stock, savoir qui doit de l'argent, sur un téléphone.

- Fonctionne hors ligne (service worker), données dans le téléphone.
- Compte avec adresse e-mail et numéro de téléphone, synchronisation entre
  appareils (Cloudflare Worker + base D1, voir worker.js).
- Français, anglais, arabe inversé.
- Ventes, dépenses, prélèvement personnel, stock avec marge et alertes,
  crédits clients et dettes fournisseurs, relance WhatsApp à cinq variables.
- Devis DEV-… transformables en facture FAC-…, impression A4 et ticket 58 mm.
- Réglages : langue, texte de relance, sauvegarde et restauration, partage.

Interface : index.html, app.js, i18n.js, style.css, sw.js, manifest.webmanifest.
API : worker.js (comptes, sessions, synchronisation), base D1.
