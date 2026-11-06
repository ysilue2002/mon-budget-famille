import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Les trois langues doivent rester alignées : aucune clé manquante, aucune clé
 * orpheline. Une traduction absente s'afficherait en français au milieu d'un
 * écran arabe.
 */

type Dict = { [key: string]: string | Dict };

function load(locale: string): Dict {
  return JSON.parse(readFileSync(new URL(`./locales/${locale}.json`, import.meta.url), 'utf8')) as Dict;
}

function flatten(input: Dict, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = String(value);
  }
  return out;
}

const fr = flatten(load('fr'));
const en = flatten(load('en'));
const ar = flatten(load('ar'));

describe('traductions', () => {
  it('les trois langues ont exactement les mêmes clés', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    expect(Object.keys(ar).sort()).toEqual(Object.keys(fr).sort());
  });

  it('aucune valeur vide', () => {
    for (const dict of [fr, en, ar]) {
      const empty = Object.entries(dict).filter(([, value]) => value.trim() === '');
      expect(empty).toEqual([]);
    }
  });

  it('les écrans de la phase 2 sont traduits dans les trois langues', () => {
    const required = [
      'trade.salesTitle',
      'trade.purchasesTitle',
      'trade.newSale',
      'trade.newPurchase',
      'trade.stockLeft',
      'trade.stockShort',
      'products.title',
      'products.stockQty',
      'parties.clients',
      'parties.suppliers',
      'expenses.title',
      'expenses.amount',
    ];
    for (const key of required) {
      expect(fr[key], `fr ${key}`).toBeTruthy();
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(ar[key], `ar ${key}`).toBeTruthy();
    }
  });

  it('les variables d’interpolation sont identiques d’une langue à l’autre', () => {
    const variables = (value: string) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
    const mismatches = Object.keys(fr).filter((key) => {
      if (!en[key] || !ar[key]) return false;
      const expected = variables(fr[key]).join(',');
      return variables(en[key]).join(',') !== expected || variables(ar[key]).join(',') !== expected;
    });
    expect(mismatches).toEqual([]);
  });
});
