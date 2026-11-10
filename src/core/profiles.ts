/**
 * Profil d'activité : ce que l'entrepreneur fait pour vivre (commerce,
 * artisanat, services…). Il est choisi à l'inscription, puis modifiable dans le
 * profil de l'activité, et servira à ne proposer que les écrans utiles.
 *
 * Rien n'est deviné en silence : la nature saisie en texte libre ne sert qu'à
 * pré-remplir le choix, que l'entrepreneur voit et peut changer.
 */

export type ActivityProfile = 'commerce' | 'artisan' | 'services' | 'other';

/** Profils proposés, dans l'ordre d'affichage. */
export const ACTIVITY_PROFILES: readonly ActivityProfile[] = ['commerce', 'artisan', 'services', 'other'];

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
 * Profil suggéré d'après la nature saisie (« vente de tissus » → commerce,
 * « maçonnerie » → artisan, « prestation de couture » → services). Le métier
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
