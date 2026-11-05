import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '@/i18n';

/** Sélecteur compact FR / EN / AR (entête et écran d'accueil). */
export function LangSwitcher() {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find((lng) => i18n.language.startsWith(lng)) ?? 'fr';
  return (
    <div className="flex overflow-hidden rounded-lg border border-forest-200 bg-white text-xs font-semibold">
      {LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => setLanguage(lng)}
          className={`px-2.5 py-1 ${
            lng === current ? 'bg-forest-600 text-white' : 'text-forest-700 hover:bg-forest-50'
          }`}
          aria-pressed={lng === current}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
