import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBusinesses } from '@/hooks/useData';
import { updateBusiness } from '@/core/repo';
import { SECTORS, type ActivityProfile } from '@/core/profiles';
import { markWelcomeSeen, readWelcomeSeen, shouldShowWelcome } from '@/lib/welcome';
import { Card, btnPrimary } from '@/components/common';

/** Pictogramme de chaque profil, pour la question de bienvenue. */
const ICONS: Record<ActivityProfile, string> = {
  commerce: '🛒',
  artisan: '🏗️',
  services: '🧵',
  other: '🧭',
};

/**
 * Démarrage de l'espace Activité : à la première ouverture, la question du
 * métier (une seule fois), puis, tant qu'aucune activité n'existe, le rappel
 * pour créer la fiche. La réponse ne supprime rien : elle oriente le menu et
 * reste modifiable dans le profil.
 */
export function ActivityWelcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const businesses = useBusinesses();
  const [seen, setSeen] = useState(readWelcomeSeen);

  if (businesses === undefined) return null;

  const active = businesses.filter((row) => !row.archived);
  const welcome = shouldShowWelcome({
    seen,
    activeProfiles: active.map((row) => row.profile),
  });

  const choose = async (profile: ActivityProfile) => {
    markWelcomeSeen();
    setSeen(true);
    const missing = active.filter((row) => row.profile === undefined);
    const target = missing[0];
    // Une seule activité à compléter : un clic suffit. Sinon (aucune activité,
    // ou plusieurs à décrire), la fiche s'ouvre avec le profil déjà choisi.
    if (active.length === 0 || missing.length > 1) {
      navigate(`/profile?profil=${profile}`);
      return;
    }
    if (target) {
      await updateBusiness(target.id, { profile }).catch((error: unknown) =>
        console.error('profil de bienvenue', error),
      );
    }
  };

  if (!welcome) {
    if (active.length > 0) return null;
    return (
      <Card className="mb-4 border-amber-200 bg-amber-50/60">
        <p className="text-sm text-amber-900">{t('activity.noBusiness')}</p>
        <Link to="/profile" className={`${btnPrimary} mt-3`}>
          ＋ {t('activity.createBusiness')}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="mb-4 border-forest-200 bg-forest-50/60">
      <h2 className="text-base font-semibold text-forest-950">{t('activity.welcomeTitle')}</h2>
      <p className="mt-1 text-sm text-sage-600">{t('activity.welcomeHint')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {SECTORS.map((profile) => (
          <button
            key={profile}
            type="button"
            onClick={() => void choose(profile)}
            className="flex items-center gap-2 rounded-lg border border-forest-200 bg-white px-3 py-2 text-left text-sm font-medium text-forest-800 transition hover:bg-forest-50"
          >
            <span aria-hidden className="text-lg">
              {ICONS[profile]}
            </span>
            {t(`profile.kinds.${profile}`)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mt-3 text-xs font-semibold text-forest-700 underline"
        onClick={() => {
          markWelcomeSeen();
          setSeen(true);
        }}
      >
        {t('activity.welcomeLater')}
      </button>
    </Card>
  );
}
