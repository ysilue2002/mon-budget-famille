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

describe('inscription activité — profil retenu', () => {
  it('suggère le profil d’après la nature déclarée', () => {
    const [shop] = businessProfilesFromRegistration({ ...base, activities: ['Vente de tissus'] });
    expect(shop.profile).toBe('commerce');
    const [trade] = businessProfilesFromRegistration({ ...base, activities: ['Maçonnerie'] });
    expect(trade.profile).toBe('artisan');
    const [service] = businessProfilesFromRegistration({ ...base, activities: ['Prestation de couture'] });
    expect(service.profile).toBe('services');
  });

  it('reste sur « autre » sans nature ou sans indice reconnu', () => {
    const [empty] = businessProfilesFromRegistration(base);
    expect(empty.profile).toBe('other');
    const [other] = businessProfilesFromRegistration({ ...base, activities: ['Élevage de poulets'] });
    expect(other.profile).toBe('other');
  });

  it('respecte le profil choisi, même si la nature suggère autre chose', () => {
    const profiles = businessProfilesFromRegistration({
      ...base,
      activities: ['Vente de tissus', 'Maçonnerie'],
      profile: 'services',
    });
    expect(profiles.map((row) => row.profile)).toEqual(['services', 'services']);
  });

  it('suggère un profil par activité quand plusieurs natures sont déclarées', () => {
    const profiles = businessProfilesFromRegistration({
      ...base,
      activities: ['Vente de tissus', 'Maçonnerie'],
    });
    expect(profiles.map((row) => row.profile)).toEqual(['commerce', 'artisan']);
  });
});
