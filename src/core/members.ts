/**
 * Rattachement entre la session et les membres du foyer — logique PURE.
 *
 * Les opérations portent un nom de membre (champ synchronisé) : l'utilisateur
 * connecté doit donc être retrouvé par son identifiant serveur, à défaut par son
 * e-mail, puis par son nom.
 */
import type { HouseholdMember } from './types';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export type MemberIdentity = Pick<HouseholdMember, 'id' | 'userId' | 'name' | 'email'>;

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/** Membre du foyer représentant l'utilisateur connecté (`null` si aucun). */
export function defaultMemberFor<T extends MemberIdentity>(
  members: readonly T[],
  user: SessionUser | null | undefined,
): T | null {
  if (!user) return null;
  if (user.id) {
    const byId = members.find((member) => member.userId && member.userId === user.id);
    if (byId) return byId;
  }
  const email = normalize(user.email);
  if (email) {
    const byEmail = members.find((member) => normalize(member.email) === email);
    if (byEmail) return byEmail;
  }
  const name = normalize(user.name);
  if (name) {
    const byName = members.find((member) => normalize(member.name) === name);
    if (byName) return byName;
  }
  return null;
}
