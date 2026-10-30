import { CURRENCY_CODES } from './types';
/**
 * Les 6 devises supportées (XOF et XAF regroupés en une entrée Franc CFA).
 * Décimales conformes à la règle métier : cents pour USD/EUR/GBP/CHF,
 * entiers directs pour XOF/XAF/NGN.
 */
export const CURRENCIES = {
    XOF: {
        code: 'XOF',
        decimals: 0,
        symbol: 'FCFA',
        nameFr: 'Franc CFA (Afrique de l’Ouest)',
        nameEn: 'CFA franc (West Africa)',
        zones: ['Sénégal', 'Côte d’Ivoire', 'Mali', 'Burkina Faso', 'Bénin', 'Togo', 'Guinée-Bissau', 'Niger'],
    },
    XAF: {
        code: 'XAF',
        decimals: 0,
        symbol: 'FCFA',
        nameFr: 'Franc CFA (Afrique centrale)',
        nameEn: 'CFA franc (Central Africa)',
        zones: ['Cameroun', 'Gabon', 'RD Congo', 'Tchad', 'RCA', 'Congo', 'Guinée équatoriale'],
    },
    USD: {
        code: 'USD',
        decimals: 2,
        symbol: '$',
        nameFr: 'Dollar américain',
        nameEn: 'US dollar',
        zones: ['États-Unis', 'Équateur', 'Panama'],
    },
    NGN: {
        code: 'NGN',
        decimals: 0,
        symbol: '₦',
        nameFr: 'Naira nigérian',
        nameEn: 'Nigerian naira',
        zones: ['Nigeria'],
    },
    GBP: {
        code: 'GBP',
        decimals: 2,
        symbol: '£',
        nameFr: 'Livre sterling',
        nameEn: 'Pound sterling',
        zones: ['Royaume-Uni'],
    },
    EUR: {
        code: 'EUR',
        decimals: 2,
        symbol: '€',
        nameFr: 'Euro',
        nameEn: 'Euro',
        zones: ['Zone euro', 'France', 'Allemagne', 'Espagne', 'Italie'],
    },
    CHF: {
        code: 'CHF',
        decimals: 2,
        symbol: 'CHF',
        nameFr: 'Franc suisse',
        nameEn: 'Swiss franc',
        zones: ['Suisse', 'Liechtenstein'],
    },
};
export const SUPPORTED_CURRENCIES = CURRENCY_CODES;
export function isCurrencyCode(value) {
    return typeof value === 'string' && CURRENCY_CODES.includes(value);
}
/** Facteur de conversion montant majeur -> sous-unités (1 ou 100). */
export function minorUnitFactor(code) {
    return CURRENCIES[code].decimals === 0 ? 1 : 100;
}
export function formatNumber(majorValue, code, lang) {
    const decimals = CURRENCIES[code].decimals;
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(majorValue);
}
/**
 * Formatage d'un montant en sous-unités.
 * fr : `123 456 FCFA` / `1 234,50 €`
 * en : `XOF 123,456` / `USD 1,234.50`
 */
export function formatAmount(minor, code, lang) {
    const meta = CURRENCIES[code];
    const factor = minorUnitFactor(code);
    const number = formatNumber(minor / factor, code, lang);
    if (lang === 'fr') {
        const symbol = meta.symbol === 'CHF' ? 'CHF' : meta.symbol;
        return `${number} ${symbol}`;
    }
    return `${code} ${number}`;
}
/** Libellé localisé d'une devise. */
export function currencyLabel(code, lang) {
    const meta = CURRENCIES[code];
    return `${lang === 'fr' ? meta.nameFr : meta.nameEn} (${code})`;
}
