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
