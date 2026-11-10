import type { ActivityProfile } from './core/profiles';
import { screenPlacement } from './core/screens';

/**
 * Menus des deux assistants. Un écran n'apparaît qu'à un seul endroit : les
 * pages partagées par les deux espaces (réglages, profil) restent accessibles
 * par leur adresse, mais le menu ne montre que ce qui sert l'espace courant.
 */
export interface NavItem {
  readonly to: string;
  readonly key: string;
  readonly icon: string;
}

/** Assistant « budget familial ». */
export const NAV_FAMILY: readonly NavItem[] = [
  { to: '/', key: 'nav.dashboard', icon: '📊' },
  { to: '/transactions', key: 'nav.transactions', icon: '🧾' },
  { to: '/accounts', key: 'nav.accounts', icon: '🏦' },
  { to: '/members', key: 'nav.members', icon: '👥' },
  { to: '/budgets', key: 'nav.budgets', icon: '🎯' },
  { to: '/savings', key: 'nav.savings', icon: '💰' },
  { to: '/debts', key: 'nav.debts', icon: '🤝' },
  { to: '/recurring', key: 'nav.recurring', icon: '🔁' },
  { to: '/converter', key: 'nav.converter', icon: '💱' },
  { to: '/reports', key: 'nav.reports', icon: '📈' },
  { to: '/statements', key: 'nav.statements', icon: '📄' },
  { to: '/settings', key: 'nav.settings', icon: '⚙️' },
];

/**
 * Assistant « activité » : ce qui sert au quotidien d'une petite entreprise.
 * Le grand livre du foyer (opérations), les rapports du foyer et le
 * convertisseur ne figurent plus ici : ils font doublon avec Ventes, Achats,
 * Dépenses, Bilans et États, qui sont déjà calculés pour l'activité.
 */
export const NAV_BUSINESS: readonly NavItem[] = [
  { to: '/', key: 'nav.home', icon: '🏠' },
  { to: '/sales', key: 'nav.sales', icon: '🛒' },
  { to: '/purchases', key: 'nav.purchases', icon: '📥' },
  { to: '/expenses', key: 'nav.expenses', icon: '🧾' },
  { to: '/products', key: 'nav.products', icon: '📦' },
  { to: '/projects', key: 'nav.projects', icon: '🏗️' },
  { to: '/quotes', key: 'nav.quotes', icon: '📝' },
  { to: '/invoices', key: 'nav.invoices', icon: '🧾' },
  { to: '/balances', key: 'nav.balances', icon: '📈' },
  { to: '/income', key: 'nav.income', icon: '🧮' },
  { to: '/treasury', key: 'nav.treasury', icon: '💧' },
  { to: '/states', key: 'nav.states', icon: '📋' },
  { to: '/settings', key: 'nav.settings', icon: '⚙️' },
];

const RANK = { essential: 0, useful: 1, hidden: 2 } as const;

/**
 * Menu de l'assistant Activité pour une ou plusieurs activités : les écrans
 * inutiles au métier disparaissent, l'essentiel passe devant le second rang.
 * Avec plusieurs profils, le menu réunit leurs besoins (voir `screenPlacement`).
 * Sans aucune activité, le menu reste complet.
 */
export function businessNav(profiles: readonly ActivityProfile[]): readonly NavItem[] {
  if (profiles.length === 0) return NAV_BUSINESS;
  return NAV_BUSINESS.map((item, position) => ({
    item,
    position,
    placement: screenPlacement(item.to, profiles),
  }))
    .filter((row) => row.placement !== 'hidden')
    .sort((a, b) => RANK[a.placement] - RANK[b.placement] || a.position - b.position)
    .map((row) => row.item);
}
