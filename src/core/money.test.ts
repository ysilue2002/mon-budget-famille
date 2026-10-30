import { describe, expect, it } from 'vitest';
import { convertMinor, parseAmountInput, percentOf, rateBetween, toMajor, toMinor } from './money';
import type { RateSnapshot } from './types';

const snapshot: RateSnapshot = {
  base: 'USD',
  rates: { XOF: 600, XAF: 600, USD: 1, NGN: 1500, GBP: 0.78, EUR: 0.92, CHF: 0.88 } as Record<string, number>,
  fetchedAt: 1,
};

describe('money — saisie monétaire', () => {
  it('interprète les formats FR et EN', () => {
    expect(parseAmountInput('1 234,56', 'EUR')).toBe(123456);
    expect(parseAmountInput('1,234.56', 'USD')).toBe(123456);
    expect(parseAmountInput('1200', 'USD')).toBe(120000);
  });

  it('devise entière : décimales tronquées pour XOF / NGN', () => {
    expect(parseAmountInput('1250.99', 'XOF')).toBe(1251);
    expect(parseAmountInput('800.5', 'NGN')).toBe(801);
  });

  it('rejette les saisies invalides', () => {
    expect(parseAmountInput('', 'USD')).toBeNull();
    expect(parseAmountInput('abc', 'USD')).toBeNull();
    expect(parseAmountInput('-5', 'USD')).toBeNull();
    expect(parseAmountInput('1e309', 'USD')).toBeNull();
  });
});

describe('money — sous-unités', () => {
  it('convertit major <-> minor sans perte pour les devises en cents', () => {
    expect(toMinor(19.99, 'USD')).toBe(1999);
    expect(toMajor(1999, 'USD')).toBe(19.99);
  });

  it('devise entière : minor == major', () => {
    expect(toMinor(7000, 'XOF')).toBe(7000);
    expect(toMajor(7000, 'XOF')).toBe(7000);
  });
});

describe('money — conversion croisée', () => {
  it('calcule le taux entre deux devises via la base USD', () => {
    expect(rateBetween('XOF', 'XAF', snapshot)).toBe(1);
    expect(rateBetween('USD', 'EUR', snapshot)).toBeCloseTo(0.92);
    expect(rateBetween('GBP', 'XOF', snapshot)).toBeCloseTo(600 / 0.78);
  });

  it('convertit minor -> minor avec arrondi au plus proche', () => {
    // 1000 XOF (sous-unités = unités) vers USD (cents) : 1000/600 * 100 cents ≈ 167
    expect(convertMinor(1000, 'XOF', 'USD', snapshot)).toBe(Math.round((1000 / 600) * 100));
    // 5 (dollars en cents) vers USD : identique.
    expect(convertMinor(500, 'USD', 'USD', snapshot)).toBe(500);
  });

  it('retourne null si le taux manque ou snapshot absent', () => {
    expect(convertMinor(1000, 'XOF', 'USD', null)).toBeNull();
    expect(rateBetween('XOF', 'USD', { rates: {} })).toBeNull();
  });
});

describe('money — pourcentage', () => {
  it('protège contre la division par zéro et arrondit à 0,1', () => {
    expect(percentOf(50, 0)).toBe(0);
    expect(percentOf(80, 100)).toBe(80);
    expect(percentOf(1, 3)).toBe(33.3);
  });
});
