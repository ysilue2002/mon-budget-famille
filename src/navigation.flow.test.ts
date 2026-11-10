import { describe, expect, it } from 'vitest';
import { NAV_BUSINESS, businessNav, hiddenScreens, mobileBarItems } from './navigation';
import { DEFAULT_NAV_PREFS, navPrefsSnapshot, revealNavScreen, setNavShowAll } from './lib/navPrefs';
import type { ActivityProfile } from './core/profiles';

/**
 * Parcours du menu de l'activité, de bout en bout côté application : menu
 * filtré par le métier, barre du téléphone avec « Plus », bandeau de
 * récupération d'un écran masqué, puis case « Afficher toutes les options ».
 * Les préférences passent par le vrai magasin ; sous Node, faute de
 * localStorage, le choix reste simplement en mémoire.
 */
const paths = (profiles: readonly ActivityProfile[]) =>
  businessNav(profiles, DEFAULT_NAV_PREFS).map((item) => item.to);

describe('parcours du menu de l’activité', () => {
  it('chaque métier a ses écrans et sa barre du bas', () => {
    expect(paths(['commerce'])).not.toContain('/projects');
    expect(paths(['commerce'])).toContain('/products');
    expect(paths(['artisan'])).not.toContain('/products');
    expect(paths(['artisan'])).toContain('/projects');
    expect(paths(['services'])).not.toContain('/products');
    expect(paths(['services'])).not.toContain('/projects');
    expect(paths(['other'])).toEqual(NAV_BUSINESS.map((item) => item.to));

    expect(mobileBarItems(businessNav(['artisan'], DEFAULT_NAV_PREFS), ['artisan']).map((i) => i.to))
      .toEqual(['/', '/projects', '/sales', '/quotes']);
    expect(mobileBarItems(businessNav(['services'], DEFAULT_NAV_PREFS), ['services']).map((i) => i.to))
      .toEqual(['/', '/sales', '/quotes', '/invoices']);
  });

  it('commerce : bandeau, récupération, puis menu complet', () => {
    const menu = () => businessNav(['commerce'], navPrefsSnapshot()).map((item) => item.to);
    const banner = () => hiddenScreens(['commerce'], navPrefsSnapshot()).map((item) => item.to);
    const bar = () =>
      mobileBarItems(businessNav(['commerce'], navPrefsSnapshot()), ['commerce']).map((i) => i.to);

    // 1. Menu du commerce : les chantiers sont masqués, le bandeau les signale.
    expect(menu()).not.toContain('/projects');
    expect(banner()).toEqual(['/projects']);
    expect(bar()).toEqual(['/', '/sales', '/purchases', '/products']);

    // 2. Clic sur « Afficher » : l'écran revient, au second rang, sans bandeau.
    revealNavScreen('/projects');
    expect(navPrefsSnapshot().revealed).toContain('/projects');
    expect(banner()).toEqual([]);
    expect(menu()).toContain('/projects');
    expect(menu().indexOf('/projects')).toBeGreaterThan(menu().indexOf('/products'));

    // 3. Réglages : « Afficher toutes les options » rétablit le menu complet.
    setNavShowAll(true);
    expect(menu()).toEqual(NAV_BUSINESS.map((item) => item.to));
    expect(banner()).toEqual([]);

    // 4. Décochée : retour au menu du commerce, écran récupéré compris.
    setNavShowAll(false);
    expect(menu()).toContain('/projects');
    expect(menu()).not.toContain('/states-x');
    expect(bar()).toEqual(['/', '/sales', '/purchases', '/products']);
  });
});
