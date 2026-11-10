/**
 * Préférences de menu, gardées sur l'appareil et jamais synchronisées :
 *
 * - « Afficher toutes les options » rétablit le menu complet, quel que soit le
 *   profil de l'activité ;
 * - un écran réaffiché depuis le bandeau revient pour de bon.
 *
 * Le profil propose un menu ; l'utilisateur garde le dernier mot, appareil par
 * appareil. Une préférence abîmée est ignorée : on revient au menu du profil.
 */
export interface NavPrefs {
  readonly showAll: boolean;
  readonly revealed: readonly string[];
}

export const DEFAULT_NAV_PREFS: NavPrefs = { showAll: false, revealed: [] };

const SHOW_ALL_KEY = 'mbf.nav.showAll';
const REVEALED_KEY = 'mbf.nav.revealed';

/** Relit ce qui a été mémorisé sans jamais faire échouer l'affichage. */
export function parseNavPrefs(rawShowAll: string | null, rawRevealed: string | null): NavPrefs {
  let revealed: string[] = [];
  if (rawRevealed) {
    try {
      const parsed: unknown = JSON.parse(rawRevealed);
      if (Array.isArray(parsed)) {
        revealed = parsed.filter(
          (path): path is string => typeof path === 'string' && path.startsWith('/'),
        );
      }
    } catch {
      revealed = [];
    }
  }
  return { showAll: rawShowAll === 'true', revealed };
}

function read(): NavPrefs {
  try {
    return parseNavPrefs(localStorage.getItem(SHOW_ALL_KEY), localStorage.getItem(REVEALED_KEY));
  } catch {
    // stockage indisponible (navigation privée) : menu du profil
    return DEFAULT_NAV_PREFS;
  }
}

let current: NavPrefs = read();
const listeners = new Set<() => void>();

function emit(next: NavPrefs): void {
  current = next;
  try {
    localStorage.setItem(SHOW_ALL_KEY, String(next.showAll));
    localStorage.setItem(REVEALED_KEY, JSON.stringify(next.revealed));
  } catch {
    // le choix reste valable pour la session
  }
  for (const listener of listeners) listener();
}

export function subscribeNavPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function navPrefsSnapshot(): NavPrefs {
  return current;
}

/** Case « Afficher toutes les options » des réglages. */
export function setNavShowAll(showAll: boolean): void {
  if (showAll === current.showAll) return;
  emit({ ...current, showAll });
}

/** Bouton « Afficher » du bandeau : l'écran masqué revient au menu. */
export function revealNavScreen(path: string): void {
  if (current.revealed.includes(path)) return;
  emit({ ...current, revealed: [...current.revealed, path] });
}
