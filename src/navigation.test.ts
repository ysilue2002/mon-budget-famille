import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAV_BUSINESS, NAV_FAMILY, businessNav } from './navigation';
import { SCREEN_PLACEMENTS, screenPlacement } from './core/screens';
import type { ActivityProfile } from './core/profiles';

/**
 * Le menu est la première chose qu'un utilisateur voit : il doit tenir sur un
 * écran de téléphone et ne jamais proposer deux fois le même écran.
 */

type Dict = { [key: string]: string | Dict };

function load(locale: string): Dict {
  return JSON.parse(readFileSync(new URL(`./i18n/locales/${locale}.json`, import.meta.url), 'utf8')) as Dict;
}

function has(dict: Dict, path: string): boolean {
  const value = path.split('.').reduce<string | Dict | undefined>((node, key) => {
    if (!node || typeof node === 'string') return undefined;
    return node[key];
  }, dict);
  return typeof value === 'string' && value.trim() !== '';
}

describe('menus', () => {
  const menus = [
    { name: 'budget familial', items: NAV_FAMILY },
    { name: 'activité', items: NAV_BUSINESS },
  ];

  it('aucun écran n’apparaît deux fois', () => {
    for (const menu of menus) {
      const paths = menu.items.map((item) => item.to);
      expect(new Set(paths).size, menu.name).toBe(paths.length);
    }
  });

  it('tient sur un téléphone : treize entrées au plus', () => {
    for (const menu of menus) {
      expect(menu.items.length, menu.name).toBeLessThanOrEqual(13);
    }
  });

  it('l’activité ne reprend pas les écrans du foyer', () => {
    const paths = NAV_BUSINESS.map((item) => item.to);
    for (const duplicate of ['/transactions', '/reports', '/converter', '/business', '/members']) {
      expect(paths, duplicate).not.toContain(duplicate);
    }
  });

  it('chaque libellé existe dans les trois langues', () => {
    const locales = ['fr', 'en', 'ar'].map(load);
    for (const menu of menus) {
      for (const item of menu.items) {
        for (const locale of locales) {
          expect(has(locale, item.key), `${item.key} (${menu.name})`).toBe(true);
        }
      }
    }
  });

  it('chaque entrée a une icône et une adresse valide', () => {
    for (const menu of menus) {
      for (const item of menu.items) {
        expect(item.to.startsWith('/'), item.to).toBe(true);
        expect(item.icon.length, item.key).toBeGreaterThan(0);
      }
    }
  });
});

describe('menu selon le profil d’activité', () => {
  const paths = (profiles: ActivityProfile[]) => businessNav(profiles).map((item) => item.to);
  const full = NAV_BUSINESS.map((item) => item.to);

  it('chaque écran du menu a un placement décidé dans la table', () => {
    for (const item of NAV_BUSINESS) {
      expect(SCREEN_PLACEMENTS[item.to], item.to).toBeDefined();
    }
  });

  it('un commerce garde son stock et perd les chantiers', () => {
    const menu = paths(['commerce']);
    expect(menu).toContain('/products');
    expect(menu).not.toContain('/projects');
    // La facture reste utile, mais au second rang (pas dans la barre du bas).
    expect(menu.indexOf('/invoices')).toBeGreaterThanOrEqual(5);
  });

  it('un artisan garde ses chantiers et perd le stock séparé', () => {
    const menu = paths(['artisan']);
    expect(menu).toContain('/projects');
    expect(menu).not.toContain('/products');
  });

  it('les services n’ont ni stock ni chantier, mais devis et factures', () => {
    const menu = paths(['services']);
    expect(menu).not.toContain('/products');
    expect(menu).not.toContain('/projects');
    expect(menu).toContain('/quotes');
    expect(menu).toContain('/invoices');
  });

  it('« autre » et l’absence d’activité gardent le menu complet', () => {
    expect(paths(['other'])).toEqual(full);
    expect(paths([])).toEqual(full);
  });

  it('bilans et résultat passent au second rang hors « autre »', () => {
    for (const profile of ['commerce', 'artisan', 'services'] as const) {
      expect(screenPlacement('/balances', [profile]), profile).toBe('useful');
      expect(screenPlacement('/income', [profile]), profile).toBe('useful');
    }
    expect(screenPlacement('/balances', ['other'])).toBe('essential');
  });

  it('deux métiers : le menu réunit leurs besoins', () => {
    const menu = paths(['commerce', 'artisan']);
    expect(menu).toContain('/products');
    expect(menu).toContain('/projects');
    expect(menu).toHaveLength(full.length);
  });

  it('l’essentiel passe devant le second rang', () => {
    const menu = businessNav(['commerce']);
    const placements = menu.map((item) => screenPlacement(item.to, ['commerce']));
    const lastEssential = placements.lastIndexOf('essential');
    const firstUseful = placements.indexOf('useful');
    expect(firstUseful).toBeGreaterThan(lastEssential);
  });

  it('le menu filtré ne propose jamais deux fois le même écran', () => {
    for (const profile of ['commerce', 'artisan', 'services', 'other'] as const) {
      const menu = paths([profile]);
      expect(new Set(menu).size, profile).toBe(menu.length);
    }
  });
});
