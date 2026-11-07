/**
 * Mode « sans compte » : l'application reste utilisable hors ligne, mais
 * uniquement après un choix explicite (bouton « Plus tard » de la connexion).
 * Sans ce drapeau, un espace choisi impose la page de connexion.
 */
const OFFLINE_KEY = 'mbf.offline';

/** Vrai si l'utilisateur a choisi de continuer sans compte sur cet appareil. */
export function isOfflineMode(): boolean {
  try {
    return localStorage.getItem(OFFLINE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Active le mode sans compte (données locales seulement). */
export function setOfflineMode(): void {
  try {
    localStorage.setItem(OFFLINE_KEY, '1');
  } catch {
    // stockage indisponible : le mode reste valable pour la session
  }
}

/** Referme le mode sans compte : la connexion redevient obligatoire. */
export function clearOfflineMode(): void {
  try {
    localStorage.removeItem(OFFLINE_KEY);
  } catch {
    // idem
  }
}
