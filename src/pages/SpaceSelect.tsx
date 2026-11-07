import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LangSwitcher } from '@/components/LangSwitcher';
import { getAuth } from '@/lib/api';
import { useSpace, type Space } from '@/spaces/space';

/**
 * Écran d'ouverture : choisir l'assistant (budget familial ou activité).
 * Le choix est mémorisé, mais reste changeable depuis la navigation. Sans
 * session ouverte, l'écran de connexion de l'assistant choisi s'affiche
 * ensuite ; une fois connecté, l'utilisateur arrive sur sa page de garde.
 */
export default function SpaceSelect() {
  const { t } = useTranslation();
  const { setSpace } = useSpace();
  const navigate = useNavigate();

  const options: { space: Space; icon: string; title: string; hint: string }[] = [
    { space: 'family', icon: '🏠', title: t('spaces.familyTitle'), hint: t('spaces.familyHint') },
    { space: 'business', icon: '💼', title: t('spaces.businessTitle'), hint: t('spaces.businessHint') },
  ];

  const choose = (space: Space) => {
    setSpace(space);
    const signedIn = Boolean(getAuth());
    void navigate(signedIn ? '/' : '/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-forest-50/60">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <span className="text-sm font-bold text-forest-950">{t('app.title')}</span>
        </div>
        <LangSwitcher />
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 pb-12">
        <h1 className="text-center text-2xl font-bold text-forest-950 sm:text-3xl">{t('spaces.headline')}</h1>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-sage-600">{t('spaces.intro')}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {options.map((option) => (
            <button
              key={option.space}
              type="button"
              onClick={() => choose(option.space)}
              className="group flex flex-col items-start gap-3 rounded-2xl border border-forest-200 bg-white p-6 text-left shadow-sm transition hover:border-forest-500 hover:shadow-md"
            >
              <span className="text-3xl" aria-hidden>
                {option.icon}
              </span>
              <span className="text-lg font-bold text-forest-950">{option.title}</span>
              <span className="text-sm text-sage-600">{option.hint}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-forest-700 group-hover:text-forest-900">
                {t('spaces.open')} <span aria-hidden>→</span>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-sage-500">{t('spaces.sameAccount')}</p>
      </main>
    </div>
  );
}
