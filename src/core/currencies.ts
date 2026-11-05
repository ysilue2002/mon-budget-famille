import { CURRENCY_CODES, type CurrencyCode } from './types';

export interface CurrencyMeta {
  code: CurrencyCode;
  /** Sous-unités : 0 => entier direct, 2 => cents. */
  decimals: 0 | 2;
  symbol: string;
  nameFr: string;
  nameEn: string;
  nameAr: string;
  /** Pays / zones où la devise est courante. */
  zones: string[];
}

/**
 * Les devises supportées (XOF et XAF regroupés en une entrée Franc CFA).
 * Décimales conformes à la règle métier : cents pour USD/EUR/GBP/CHF/EGP/MAD/AED,
 * entiers directs pour XOF/XAF/NGN.
 */
export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  XOF: {
    code: 'XOF',
    decimals: 0,
    symbol: 'FCFA',
    nameFr: 'Franc CFA (Afrique de l’Ouest)',
    nameEn: 'CFA franc (West Africa)',
    nameAr: 'فرنك CFA (غرب أفريقيا)',
    zones: ['Sénégal', 'Côte d’Ivoire', 'Mali', 'Burkina Faso', 'Bénin', 'Togo', 'Guinée-Bissau', 'Niger'],
  },
  XAF: {
    code: 'XAF',
    decimals: 0,
    symbol: 'FCFA',
    nameFr: 'Franc CFA (Afrique centrale)',
    nameEn: 'CFA franc (Central Africa)',
    nameAr: 'فرنك CFA (وسط أفريقيا)',
    zones: ['Cameroun', 'Gabon', 'RD Congo', 'Tchad', 'RCA', 'Congo', 'Guinée équatoriale'],
  },
  USD: {
    code: 'USD',
    decimals: 2,
    symbol: '$',
    nameFr: 'Dollar américain',
    nameEn: 'US dollar',
    nameAr: 'دولار أمريكي',
    zones: ['États-Unis', 'Équateur', 'Panama'],
  },
  NGN: {
    code: 'NGN',
    decimals: 0,
    symbol: '₦',
    nameFr: 'Naira nigérian',
    nameEn: 'Nigerian naira',
    nameAr: 'نايرا نيجيري',
    zones: ['Nigeria'],
  },
  GBP: {
    code: 'GBP',
    decimals: 2,
    symbol: '£',
    nameFr: 'Livre sterling',
    nameEn: 'Pound sterling',
    nameAr: 'جنيه إسترليني',
    zones: ['Royaume-Uni'],
  },
  EUR: {
    code: 'EUR',
    decimals: 2,
    symbol: '€',
    nameFr: 'Euro',
    nameEn: 'Euro',
    nameAr: 'يورو',
    zones: ['Zone euro', 'France', 'Allemagne', 'Espagne', 'Italie'],
  },
  CHF: {
    code: 'CHF',
    decimals: 2,
    symbol: 'CHF',
    nameFr: 'Franc suisse',
    nameEn: 'Swiss franc',
    nameAr: 'فرنك سويسري',
    zones: ['Suisse', 'Liechtenstein'],
  },
  EGP: {
    code: 'EGP',
    decimals: 2,
    symbol: 'E£',
    nameFr: 'Livre égyptienne',
    nameEn: 'Egyptian pound',
    nameAr: 'جنيه مصري',
    zones: ['Égypte'],
  },
  MAD: {
    code: 'MAD',
    decimals: 2,
    symbol: 'DH',
    nameFr: 'Dirham marocain',
    nameEn: 'Moroccan dirham',
    nameAr: 'درهم مغربي',
    zones: ['Maroc', 'Sahara occidental'],
  },
  AED: {
    code: 'AED',
    decimals: 2,
    symbol: 'AED',
    nameFr: 'Dirham des Émirats arabes unis',
    nameEn: 'UAE dirham',
    nameAr: 'درهم إماراتي',
    zones: ['Émirats arabes unis'],
  },
};

export const SUPPORTED_CURRENCIES = CURRENCY_CODES;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCY_CODES as readonly string[]).includes(value);
}

/** Facteur de conversion montant majeur -> sous-unités (1 ou 100). */
export function minorUnitFactor(code: CurrencyCode): number {
  return CURRENCIES[code].decimals === 0 ? 1 : 100;
}

/** Locale Intl : arabe avec chiffres latins (usage courant en finance). */
function localeOf(lang: string): string {
  if (lang.startsWith('fr')) return 'fr-FR';
  if (lang.startsWith('ar')) return 'ar-EG-u-nu-latn';
  return 'en-US';
}

export function formatNumber(majorValue: number, code: CurrencyCode, lang: string): string {
  const decimals = CURRENCIES[code].decimals;
  return new Intl.NumberFormat(localeOf(lang), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(majorValue);
}

/**
 * Formatage d'un montant en sous-unités.
 * fr / ar : `123 456 FCFA` / `1 234,50 €` / `١٢٣٤٫٥٠ د.إ` (chiffres latins)
 * en       : `XOF 123,456` / `USD 1,234.50`
 */
export function formatAmount(minor: number, code: CurrencyCode, lang: string): string {
  const meta = CURRENCIES[code];
  const factor = minorUnitFactor(code);
  const number = formatNumber(minor / factor, code, lang);
  if (lang.startsWith('ar') || lang.startsWith('fr')) {
    return `${number} ${meta.symbol}`;
  }
  return `${code} ${number}`;
}

/** Libellé localisé d'une devise. */
export function currencyLabel(code: CurrencyCode, lang: string): string {
  const meta = CURRENCIES[code];
  const name = lang.startsWith('ar') ? meta.nameAr : lang.startsWith('fr') ? meta.nameFr : meta.nameEn;
  return `${name} (${code})`;
}
