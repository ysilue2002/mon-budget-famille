import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
export const LANGUAGES = ['fr', 'en'];
const STORAGE_KEY = 'mbf.language';
function readStoredLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fr' || stored === 'en')
        return stored;
    return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
void i18n.use(initReactI18next).init({
    resources: {
        fr: { translation: fr },
        en: { translation: en },
    },
    lng: readStoredLanguage(),
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
});
i18n.on('languageChanged', (lng) => {
    localStorage.setItem(STORAGE_KEY, lng);
    document.documentElement.lang = lng;
});
export function setLanguage(lng) {
    void i18n.changeLanguage(lng);
}
export default i18n;
