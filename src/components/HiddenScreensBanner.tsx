import { useTranslation } from 'react-i18next';
import { useProducts, useProjects } from '@/hooks/useData';
import { revealNavScreen } from '@/lib/navPrefs';
import type { NavItem } from '@/navigation';

/**
 * Bandeau discret : un écran que le profil a masqué contient déjà des données.
 * Un clic le réaffiche pour de bon (choix gardé sur l'appareil) ; rien n'est
 * réaffiché tout seul, et rien n'est jamais supprimé.
 */
const LABELS: Record<string, { one: string; many: string }> = {
  '/projects': { one: 'nav.bannerProjectsOne', many: 'nav.bannerProjectsMany' },
  '/products': { one: 'nav.bannerProductsOne', many: 'nav.bannerProductsMany' },
};

export function HiddenScreensBanner({ hidden }: { hidden: readonly NavItem[] }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const products = useProducts();
  const counts: Record<string, number> = {
    '/projects': (projects ?? []).filter((row) => !row.archived).length,
    '/products': (products ?? []).filter((row) => !row.archived).length,
  };

  const rows = hidden.flatMap((item) => {
    const label = LABELS[item.to];
    const count = counts[item.to] ?? 0;
    return label && count > 0 ? [{ item, label, count }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <div className="no-print mb-3 flex flex-col gap-2">
      {rows.map(({ item, label, count }) => (
        <div
          key={item.to}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-forest-200 bg-forest-50/60 px-3 py-2 text-sm text-forest-900"
        >
          <span>{count > 1 ? t(label.many, { count }) : t(label.one)}</span>
          <button
            type="button"
            onClick={() => revealNavScreen(item.to)}
            className="rounded-lg border border-forest-300 bg-white px-3 py-1 text-xs font-semibold text-forest-800 transition hover:bg-forest-50"
          >
            {t('nav.bannerShow')}
          </button>
        </div>
      ))}
    </div>
  );
}
