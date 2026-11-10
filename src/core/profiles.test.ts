import { describe, expect, it } from 'vitest';
import { ACTIVITY_PROFILES, SECTORS, isActivityProfile, suggestActivityProfile } from './profiles';

describe('profils d’activité — suggestion', () => {
  it('reconnaît un commerce', () => {
    expect(suggestActivityProfile('vente de tissus')).toBe('commerce');
    expect(suggestActivityProfile('Boutique de cosmétiques')).toBe('commerce');
    expect(suggestActivityProfile('épicerie de quartier')).toBe('commerce');
  });

  it('reconnaît un artisan', () => {
    expect(suggestActivityProfile('maçonnerie')).toBe('artisan');
    expect(suggestActivityProfile('Travaux de peinture et carrelage')).toBe('artisan');
    expect(suggestActivityProfile('plomberie générale')).toBe('artisan');
  });

  it('reconnaît des services', () => {
    expect(suggestActivityProfile('couture')).toBe('services');
    expect(suggestActivityProfile('prestation de couture à domicile')).toBe('services');
    expect(suggestActivityProfile('Coiffure et soins')).toBe('services');
  });

  it('ignore accents, casse et pluriels', () => {
    expect(suggestActivityProfile('ELECTRICITE')).toBe('artisan');
    expect(suggestActivityProfile('  électricité   générale ')).toBe('artisan');
  });

  it('ne confond pas un mot avec un fragment d’un autre', () => {
    // « cours » ne doit pas être reconnu dans « concours ».
    expect(suggestActivityProfile('concours de musique')).toBe('other');
  });

  it('renvoie « autre » sans indice exploitable', () => {
    expect(suggestActivityProfile('')).toBe('other');
    expect(suggestActivityProfile('   ')).toBe('other');
    expect(suggestActivityProfile('élevage de poulets')).toBe('other');
  });

  it('départage un métier mixte par le nombre de mots reconnus', () => {
    expect(suggestActivityProfile('boutique de tissus et couture')).toBe('commerce');
    expect(suggestActivityProfile('retouches et couture')).toBe('services');
  });

  it('reconnaît les métiers saisis dans les trois secteurs', () => {
    expect(suggestActivityProfile('vente de tomate')).toBe('commerce');
    expect(suggestActivityProfile('mécanicien')).toBe('artisan');
    expect(suggestActivityProfile('maçon')).toBe('artisan');
    expect(suggestActivityProfile('location de bâche')).toBe('services');
    expect(suggestActivityProfile('hôtel')).toBe('services');
  });

  it('propose trois secteurs, « autre » restant le repli interne', () => {
    expect(SECTORS).toEqual(['commerce', 'artisan', 'services']);
    expect(suggestActivityProfile('élevage de poulets')).toBe('other');
  });

  it('expose les quatre profils et les reconnaît', () => {
    expect(ACTIVITY_PROFILES).toEqual(['commerce', 'artisan', 'services', 'other']);
    expect(isActivityProfile('artisan')).toBe(true);
    expect(isActivityProfile('boulangerie')).toBe(false);
    expect(isActivityProfile(undefined)).toBe(false);
  });
});
