import { describe, expect, it } from 'vitest';
import { DEFAULT_NAV_PREFS, parseNavPrefs } from './navPrefs';

describe('préférences de menu', () => {
  it('sans rien de mémorisé, le menu suit le profil', () => {
    expect(parseNavPrefs(null, null)).toEqual(DEFAULT_NAV_PREFS);
  });

  it('relit le menu complet et les écrans réaffichés', () => {
    expect(parseNavPrefs('true', '["/projects","/products"]')).toEqual({
      showAll: true,
      revealed: ['/projects', '/products'],
    });
  });

  it('ignore une entrée abîmée plutôt que de casser le menu', () => {
    expect(parseNavPrefs('oui', 'pas du json')).toEqual({ showAll: false, revealed: [] });
    expect(parseNavPrefs('true', '{"a":1}')).toEqual({ showAll: true, revealed: [] });
    expect(parseNavPrefs('true', '[1,"/products",null]')).toEqual({
      showAll: true,
      revealed: ['/products'],
    });
  });
});
