import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
import ar from './locales/ar.json';

export const LANGUAGES = ['fr', 'en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Libellés des langues (sélecteur des réglages). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  fr: '🇫🇷 Français',
  en: '🇬🇧 English',
  ar: '🇸🇦 العربية',
};

const STORAGE_KEY = 'mbf.language';

function readStoredLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (LANGUAGES as readonly string[]).includes(stored)) return stored as Language;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith('fr')) return 'fr';
  if (browser.startsWith('ar')) return 'ar';
  return 'en';
}

/** L'arabe se lit de droite à gauche : la direction est portée par <html>. */
function applyDirection(lng: string): void {
  document.documentElement.dir = lng.startsWith('ar') ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
}

const initial = readStoredLanguage();
applyDirection(initial);

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initial,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
  applyDirection(lng);
});

export function setLanguage(lng: Language): void {
  void i18n.changeLanguage(lng);
}

export default i18n;
