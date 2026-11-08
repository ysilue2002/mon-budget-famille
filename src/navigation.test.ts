import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAV_BUSINESS, NAV_FAMILY } from './navigation';

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
