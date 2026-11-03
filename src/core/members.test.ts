import { describe, expect, it } from 'vitest';
import { defaultMemberFor } from '@/core/members';

const members = [
  { id: 'm1', userId: '', name: 'Awa', email: '' },
  { id: 'm2', userId: 'u2', name: 'Koffi', email: 'koffi@example.com' },
];

describe('members', () => {
  it('retrouve le membre de l’utilisateur connecté par identifiant, e-mail puis nom', () => {
    expect(defaultMemberFor(members, { id: 'u2', name: 'Koffi D.', email: 'autre@example.com' })?.id).toBe('m2');
    expect(defaultMemberFor(members, { id: 'u9', name: 'Autre', email: ' KOFFI@example.com ' })?.id).toBe('m2');
    expect(defaultMemberFor(members, { id: 'u9', name: ' awa ', email: '' })?.id).toBe('m1');
  });

  it('ne trouve rien sans session ou sans correspondance', () => {
    expect(defaultMemberFor(members, null)).toBeNull();
    expect(defaultMemberFor(members, { id: 'u9', name: 'Nina', email: 'nina@example.com' })).toBeNull();
    expect(defaultMemberFor([], { id: 'u2', name: 'Koffi', email: '' })).toBeNull();
  });
});
