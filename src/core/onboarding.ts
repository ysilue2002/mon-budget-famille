/**
 * Inscription de l'assistant « Activité » : traduit le formulaire d'inscription
 * en profils d'activité enregistrés localement (puis synchronisés).
 *
 * Une activité est un contenant (nom d'entreprise, coordonnées, identifiant
 * fiscal) auquel s'ajoute la nature exercée. L'utilisateur peut déclarer
 * plusieurs natures d'un coup, ou aucune et les préciser au fur et à mesure :
 * dans ce cas une activité vide de nature est créée pour qu'il puisse
 * immédiatement établir devis et factures, puis la compléter.
 */

import { suggestActivityProfile, type ActivityProfile } from './profiles';

/** Coordonnées recueillies à l'inscription, communes aux activités déclarées. */
export interface RegistrationCompanyInput {
  /** Nom commercial — il s'imprime sur les devis et factures. */
  company: string;
  /** Nom de l'entrepreneur (profil). */
  ownerName?: string;
  phone?: string;
  email?: string;
  address?: string;
  /** Identifiant fiscal / RCCM (facultatif). */
  taxId?: string;
  /** Natures déclarées ; les entrées vides sont ignorées. */
  activities: readonly string[];
  /**
   * Profil choisi à l'inscription. Absent : il est suggéré d'après la nature
   * (et reste « autre », donc sans restriction, si rien n'est reconnu).
   */
  profile?: ActivityProfile;
}

/** Profil prêt pour `createBusiness`. */
export interface RegistrationBusinessProfile {
  name: string;
  activity: string;
  profile: ActivityProfile;
  ownerName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
}

/** Nombre maximal d'activités créées d'un coup (garde-fou de saisie). */
const MAX_ACTIVITIES = 6;

/** Natures nettoyées, sans doublon (comparaison insensible à la casse). */
export function normalizeActivities(activities: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of activities) {
    const value = raw.trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_ACTIVITIES) break;
  }
  return out;
}

/**
 * Profils d'activité à créer après l'inscription.
 *
 * - aucune nature : une activité au nom de l'entreprise, nature vide ;
 * - une nature : l'activité porte le nom de l'entreprise ;
 * - plusieurs : une activité par nature, suffixée pour rester distinguable
 *   dans le sélecteur d'activités.
 */
export function businessProfilesFromRegistration(
  input: RegistrationCompanyInput,
): RegistrationBusinessProfile[] {
  const company = input.company.trim().replace(/\s+/g, ' ');
  if (!company) return [];

  const shared = {
    ownerName: input.ownerName?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    address: input.address?.trim() || undefined,
    taxId: input.taxId?.trim() || undefined,
  };
  const natures = normalizeActivities(input.activities);
  // Le profil retenu par l'utilisateur prime ; sinon chaque activité reçoit la
  // suggestion tirée de sa propre nature.
  const profileFor = (nature: string) => input.profile ?? suggestActivityProfile(nature);

  if (natures.length === 0) {
    return [{ name: company, activity: '', profile: profileFor(''), ...shared }];
  }
  if (natures.length === 1) {
    return [{ name: company, activity: natures[0], profile: profileFor(natures[0]), ...shared }];
  }
  return natures.map((nature) => ({
    name: `${company} — ${nature}`,
    activity: nature,
    profile: profileFor(nature),
    ...shared,
  }));
}
