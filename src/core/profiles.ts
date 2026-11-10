/**
 * Secteur d'activité : commerce, artisanat ou prestation de service. C'est lui
 * qui décide du menu ; le métier précis (boutique de tomates, mécanicien,
 * location de bâche…) s'écrit ensuite en texte libre, dans le secteur choisi.
 * Il se choisit à l'inscription, puis se change dans le profil de l'activité.
 *
 * Rien n'est deviné en silence : le métier saisi ne sert qu'à pré-remplir le
 * secteur, que l'entrepreneur voit et peut changer.
 */

export type ActivityProfile = 'commerce' | 'artisan' | 'services' | 'other';

/** Tous les profils connus, « autre » compris (activité sans secteur choisi). */
export const ACTIVITY_PROFILES: readonly ActivityProfile[] = ['commerce', 'artisan', 'services', 'other'];

/** Les trois secteurs proposés à l'utilisateur, dans l'ordre d'affichage. */
export const SECTORS: readonly ActivityProfile[] = ['commerce', 'artisan', 'services'];

export function isActivityProfile(value: unknown): value is ActivityProfile {
  return typeof value === 'string' && (ACTIVITY_PROFILES as readonly string[]).includes(value);
}

/** Mots-clés (sans accent, en minuscules) qui trahissent un métier. */
const KEYWORDS: Record<Exclude<ActivityProfile, 'other'>, readonly string[]> = {
  commerce: [
    'boutique',
    'magasin',
    'epicerie',
    'alimentation',
    'superette',
    'quincaillerie',
    'mercerie',
    'tissu',
    'pret a porter',
    'cosmetique',
    'telephone',
    'pieces detachees',
    'kiosque',
    'revente',
    'commerce',
    'commercant',
    'commercante',
    'vente',
    'vendeur',
    'vendeuse',
    'bijoux',
    'chaussures',
    'tomate',
    'tomates',
    'legumes',
    'fruits',
    'poisson',
    'viande',
    'cereales',
  ],
  artisan: [
    'chantier',
    'macon',
    'maconnerie',
    'plombier',
    'plomberie',
    'electricien',
    'electricite',
    'menuisier',
    'menuiserie',
    'ebeniste',
    'ebenisterie',
    'peintre',
    'peinture',
    'carreleur',
    'carrelage',
    'couvreur',
    'toiture',
    'soudure',
    'soudeur',
    'ferronnerie',
    'batiment',
    'construction',
    'travaux',
    'forage',
    'mecanique',
    'mecanicien',
    'mecano',
    'garage',
    'soudeur',
  ],
  services: [
    'couture',
    'couturier',
    'couturiere',
    'coiffure',
    'coiffeur',
    'coiffeuse',
    'conseil',
    'consultant',
    'formation',
    'formateur',
    'traiteur',
    'restauration',
    'transport',
    'chauffeur',
    'reparation',
    'depannage',
    'menage',
    'nettoyage',
    'prestation',
    'independant',
    'freelance',
    'informatique',
    'graphisme',
    'design',
    'cours',
    'enseignement',
    'soins',
    'photographie',
    'animation',
    'hotel',
    'auberge',
    'location',
    'bache',
    'tente',
    'salle',
    'evenementiel',
    'hebergement',
  ],
};

/** Texte comparable : minuscules, sans accent, mots séparés par une espace. */
function comparable(value: string): string {
  return ` ${value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

/**
 * Secteur suggéré d'après le métier saisi (« vente de tissus » → commerce,
 * « maçonnerie » → artisan, « location de bâche » → prestation de service). Le métier
 * qui reconnaît le plus de mots-clés l'emporte ; sans indice, « autre », pour
 * ne rien restreindre par erreur. Une espace précède chaque mot-clé comparé,
 * si bien que « tissu » reconnaît « tissus » mais pas « concours » pour « cours ».
 */
export function suggestActivityProfile(nature: string): ActivityProfile {
  const text = comparable(nature);
  if (text.trim() === '') return 'other';

  let best: ActivityProfile = 'other';
  let bestScore = 0;
  for (const profile of ['commerce', 'artisan', 'services'] as const) {
    let score = 0;
    for (const keyword of KEYWORDS[profile]) {
      if (text.includes(` ${keyword}`)) score += 1;
    }
    if (score > bestScore) {
      best = profile;
      bestScore = score;
    }
  }
  return best;
}
