/**
 * Répartition des écrans de l'assistant Activité selon le profil de l'activité
 * (voir `files/repartition-ecrans-profils.md`).
 *
 * - `essential` : proposé en premier, il fait le quotidien du métier ;
 * - `useful` : proposé, mais rangé après l'essentiel ;
 * - `hidden` : retiré du menu. L'écran reste joignable par son adresse et ses
 *   données continuent d'alimenter les totaux : masquer ne supprime rien.
 *
 * Tous les profils gardent l'accueil, les ventes, les dépenses, la trésorerie,
 * les états et les réglages.
 */
import type { ActivityProfile } from './profiles';

export type ScreenPlacement = 'essential' | 'useful' | 'hidden';

/**
 * Les quatre entrées de la barre du bas sur téléphone, dans l'ordre du document
 * de répartition ; « Plus » ouvre le reste.
 */
export const BAR_PRIORITY: Readonly<Record<ActivityProfile, readonly string[]>> = {
  commerce: ['/', '/sales', '/purchases', '/products'],
  artisan: ['/', '/projects', '/sales', '/quotes'],
  services: ['/', '/sales', '/quotes', '/invoices'],
  other: ['/', '/sales', '/purchases', '/expenses'],
};

/** Placement de chaque écran, profil par profil. */
export const SCREEN_PLACEMENTS: Readonly<
  Record<string, Readonly<Record<ActivityProfile, ScreenPlacement>>>
> = {
  '/': { commerce: 'essential', artisan: 'essential', services: 'essential', other: 'essential' },
  '/sales': { commerce: 'essential', artisan: 'essential', services: 'essential', other: 'essential' },
  '/purchases': {
    commerce: 'essential',
    artisan: 'essential',
    services: 'useful',
    other: 'essential',
  },
  '/expenses': { commerce: 'essential', artisan: 'essential', services: 'essential', other: 'essential' },
  '/products': {
    commerce: 'essential',
    artisan: 'hidden',
    services: 'hidden',
    other: 'essential',
  },
  '/projects': {
    commerce: 'hidden',
    artisan: 'essential',
    services: 'hidden',
    other: 'essential',
  },
  '/quotes': { commerce: 'useful', artisan: 'essential', services: 'essential', other: 'essential' },
  '/invoices': { commerce: 'useful', artisan: 'essential', services: 'essential', other: 'essential' },
  '/balances': { commerce: 'useful', artisan: 'useful', services: 'useful', other: 'essential' },
  '/income': { commerce: 'useful', artisan: 'useful', services: 'useful', other: 'essential' },
  '/treasury': { commerce: 'essential', artisan: 'essential', services: 'essential', other: 'essential' },
  '/states': { commerce: 'essential', artisan: 'essential', services: 'essential', other: 'essential' },
  '/settings': { commerce: 'essential', artisan: 'essential', services: 'essential', other: 'essential' },
};

/**
 * Placement d'un écran pour une ou plusieurs activités.
 *
 * Avec deux métiers — une boutique et des chantiers — l'écran utile à l'un des
 * deux reste proposé : le menu est l'union des besoins, jamais l'intersection.
 * Sans aucune activité déclarée, rien n'est filtré.
 */
export function screenPlacement(
  path: string,
  profiles: readonly ActivityProfile[],
): ScreenPlacement {
  const rule = SCREEN_PLACEMENTS[path];
  if (!rule || profiles.length === 0) return 'essential';

  const placements = profiles.map((profile) => rule[profile]);
  if (placements.includes('essential')) return 'essential';
  if (placements.includes('useful')) return 'useful';
  return 'hidden';
}
