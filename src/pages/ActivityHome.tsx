import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useBusinesses,
  usePrimaryCurrency,
  useProducts,
  useTransactions,
} from '@/hooks/useData';
import { computeAccountBalance } from '@/core/selectors';
import { formatAmount } from '@/core/currencies';
import { lowStockProducts, stockProducts, stockValue } from '@/core/stock';
import { currentMonth, endOfMonth } from '@/lib/date';
import { Page, StatCard, btnGhost, btnPrimary } from '@/components/common';
import { ActivityWelcome } from '@/components/ActivityWelcome';

/**
 * Accueil de l'assistant Activité : huit chiffres compréhensibles d'un coup
 * d'œil et de gros raccourcis. Tous les montants proviennent de données réelles ;
 * aucune fonction absente n'est affichée comme disponible.
 */
export default function ActivityHome() {
  const { t, i18n } = useTranslation();
  const businesses = useBusinesses();
  const transactions = useTransactions();
  const accounts = useAccounts();
  const products = useProducts();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const lang = i18n.language;
  const fmt = (minor: number) => formatAmount(minor, primary, lang);

  // Mois en cours, bornes incluses (les dates sont ISO YYYY-MM-DD).
  const month = currentMonth();
  const from = `${month}-01`;
  const to = endOfMonth(month);

  const activeBusinesses = (businesses ?? []).filter((business) => !business.archived);
  const businessIds = new Set(activeBusinesses.map((business) => business.id));

  const tagged = (transactions ?? []).filter(
    (tx) => tx.businessId && businessIds.has(tx.businessId) && tx.type !== 'transfer',
  );
  const inMonth = tagged.filter((tx) => tx.date >= from && tx.date <= to);

  const sales = inMonth.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + tx.amountInPrimary, 0);
  const expenses = inMonth.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amountInPrimary, 0);
  // Crédit restant = montant facturé − part déjà encaissée (paiements partiels).
  const customerCredit = tagged
    .filter((tx) => tx.type === 'income' && tx.settled === false)
    .reduce((sum, tx) => sum + Math.max(0, tx.amountInPrimary - (tx.settledAmount ?? 0)), 0);
  const supplierCredit = tagged
    .filter((tx) => tx.type === 'expense' && tx.settled === false)
    .reduce((sum, tx) => sum + Math.max(0, tx.amountInPrimary - (tx.settledAmount ?? 0)), 0);

  const moneyAvailable = (accounts ?? []).reduce((sum, account) => {
    const related = (transactions ?? []).filter(
      (tx) => tx.accountId === account.id || tx.toAccountId === account.id,
    );
    return sum + computeAccountBalance(account, related);
  }, 0);

  const stock = stockValue(products ?? []);
  const alerts = lowStockProducts(products ?? []);
  const earnings = sales - expenses;

  const shortcuts = [
    { to: '/sales', icon: '🛒', label: t('activity.newSale'), tone: 'primary' as const },
    { to: '/purchases', icon: '📥', label: t('activity.newPurchase'), tone: 'ghost' as const },
    { to: '/transactions', icon: '🧾', label: t('activity.newExpense'), tone: 'ghost' as const },
    { to: '/products', icon: '📦', label: t('activity.openProducts'), tone: 'ghost' as const },
    { to: '/projects', icon: '🏗️', label: t('activity.openProjects'), tone: 'ghost' as const },
    { to: '/balances', icon: '📈', label: t('activity.openStatements'), tone: 'ghost' as const },
    { to: '/states', icon: '📄', label: t('activity.openDocuments'), tone: 'ghost' as const },
    { to: '/settings', icon: '⚙️', label: t('activity.openSettings'), tone: 'ghost' as const },
  ];

  return (
    <Page
      title={t('activity.title')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-sage-600">{t('activity.greeting')}</span>
          {/* Le profil de l'activité quitte le menu (place prise par les
              chantiers) : il reste à un clic depuis l'accueil. */}
          <Link to="/profile" className={btnGhost}>
            🧑‍💼 {t('nav.profile')}
          </Link>
        </div>
      }
    >
      <ActivityWelcome />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('activity.moneyAvailable')} value={fmt(moneyAvailable)} hint={t('activity.moneyHint')} />
        <StatCard label={t('activity.sales')} value={fmt(sales)} hint={t('activity.thisMonth')} />
        <StatCard label={t('activity.expenses')} value={fmt(expenses)} hint={t('activity.thisMonth')} />
        <StatCard
          label={t('activity.estimatedEarnings')}
          value={fmt(earnings)}
          valueClass={earnings >= 0 ? 'text-forest-700' : 'text-red-600'}
          hint={t('activity.thisMonth')}
        />
        <StatCard label={t('activity.customerCredit')} value={fmt(customerCredit)} hint={t('activity.customerCreditHint')} />
        <StatCard label={t('activity.supplierCredit')} value={fmt(supplierCredit)} hint={t('activity.supplierCreditHint')} />
        <StatCard
          label={t('activity.stockValue')}
          value={fmt(stock)}
          hint={t('activity.stockHint', { count: stockProducts(products ?? []).length })}
        />
        <StatCard
          label={t('activity.lowStock')}
          value={String(alerts.length)}
          valueClass={alerts.length > 0 ? 'text-amber-600' : undefined}
          hint={t('activity.lowStockHint')}
        />
      </div>

      <p className="mt-2 text-xs text-sage-500">{t('activity.simplifiedHint')}</p>

      <h2 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-forest-900">
        {t('activity.quickActions')}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {shortcuts.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className={`${item.tone === 'primary' ? btnPrimary : btnGhost} flex h-24 flex-col items-center justify-center gap-1 text-center text-sm`}
          >
            <span aria-hidden className="text-2xl">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
