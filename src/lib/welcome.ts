/**
 * Parcours de bienvenue de l'espace Activité : à la première ouverture, on
 * demande ce que fait l'entrepreneur, une fois, sans jamais le redemander.
 *
 * Le choix reste modifiable dans le profil de l'activité ; « Plus tard » range
 * la question et laisse le menu complet. La réponse « déjà vue » est gardée sur
 * l'appareil, pas dans les données synchronisées.
 */
import type { ActivityProfile } from '@/core/profiles';

const WELCOME_KEY = 'mbf.activity.welcome';

/** La question se pose tant qu'elle n'a pas été vue et qu'un profil manque. */
export function shouldShowWelcome(input: {
  readonly seen: boolean;
  readonly activeProfiles: readonly (ActivityProfile | undefined)[];
}): boolean {
  if (input.seen) return false;
  if (input.activeProfiles.length === 0) return true;
  return input.activeProfiles.some((profile) => profile === undefined);
}

export function readWelcomeSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === 'done';
  } catch {
    // stockage indisponible : la question revient à la prochaine visite
    return false;
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_KEY, 'done');
  } catch {
    // idem : rien à mémoriser, la question revient plus tard
  }
}
