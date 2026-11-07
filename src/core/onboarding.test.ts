import { describe, expect, it } from 'vitest';
import { businessProfilesFromRegistration, normalizeActivities } from './onboarding';

const base = {
  company: 'Épicerie du marché',
  ownerName: 'Awa Diop',
  phone: '+221 77 000 00 00',
  email: 'awa@epicerie.sn',
  address: 'Marché Sandaga, Dakar',
  taxId: 'NIF-123',
  activities: [] as string[],
};

describe('inscription activité — profils créés', () => {
  it('crée une activité sans nature quand l’utilisateur les précisera plus tard', () => {
    const profiles = businessProfilesFromRegistration(base);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      name: 'Épicerie du marché',
      activity: '',
      ownerName: 'Awa Diop',
      address: 'Marché Sandaga, Dakar',
      taxId: 'NIF-123',
    });
  });

  it('reprend la nature unique et les coordonnées sur les documents', () => {
    const [profile] = businessProfilesFromRegistration({ ...base, activities: ['Vente de tissus'] });
    expect(profile).toMatchObject({
      name: 'Épicerie du marché',
      activity: 'Vente de tissus',
      phone: '+221 77 000 00 00',
      email: 'awa@epicerie.sn',
    });
  });

  it('distingue plusieurs natures déclarées d’un coup', () => {
    const profiles = businessProfilesFromRegistration({
      ...base,
      activities: ['Vente de tissus', 'Prestation de couture'],
    });
    expect(profiles.map((row) => row.name)).toEqual([
      'Épicerie du marché — Vente de tissus',
      'Épicerie du marché — Prestation de couture',
    ]);
    expect(profiles.map((row) => row.activity)).toEqual(['Vente de tissus', 'Prestation de couture']);
  });

  it('ignore les lignes vides et les doublons', () => {
    expect(normalizeActivities(['  Vente  de tissus ', '', 'vente de tissus', 'Couture'])).toEqual([
      'Vente de tissus',
      'Couture',
    ]);
    const profiles = businessProfilesFromRegistration({ ...base, activities: ['  ', ''] });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].activity).toBe('');
  });

  it('ne crée rien sans nom d’entreprise', () => {
    expect(businessProfilesFromRegistration({ ...base, company: '   ' })).toEqual([]);
  });
});
