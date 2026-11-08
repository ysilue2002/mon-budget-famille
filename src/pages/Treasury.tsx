import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useAdvances,
  useBusinesses,
  usePrimaryCurrency,
  useProducts,
  usePurchases,
  useRates,
  useSales,
  useSettlements,
  useStockMovements,
  useTransactions,
} from '@/hooks/useData';
import { buildTreasurySnapshot, totalInPrimary } from '@/core/treasury';
import { periodRange, shiftAnchor } from '@/core/reports';
import { formatAmount } from '@/core/currencies';
import { currentMonth } from '@/lib/date';
import { Card, EmptyState, Page, StatCard, Tag, btnGhost, btnPrimary } from '@/components/common';
import type { AccountType, MobileProvider } from '@/core/types';

const GROUP_LABEL: Record<AccountType, string> = {
  cash: 'treasury.groupCash',
  bank: 'treasury.groupBank',
  mobile: 'treasury.groupMobile',
  other: 'treasury.groupOther',
};

const PROVIDER_LABEL: Record<Exclude<MobileProvider, null>, string> = {
  wave: 'accounts.mobileProviders.wave',
  orange: 'accounts.mobileProviders.orange',
  mtn: 'accounts.mobileProviders.mtn',
  moov: 'accounts.mobileProviders.moov',
  paypal: 'accounts.mobileProviders.paypal',
  other: 'accounts.mobileProviders.other',
};

function monthLabel(anchor: string, language: string): string {
  const [year, month] = anchor.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/**
 * Trésorerie de l'activité : où est l'argent (caisse, banques, Wave, Orange
 * Money, MTN, Moov), ce qui entre et sort, ce qui reste dû, et l'historique des
 * règlements. Les calculs viennent de `treasury.ts`, qui réutilise les formules
 * des bilans : un achat n'est donc jamais recompté en dépense.
 */
export default function Treasury() {
  const { t, i18n } = useTranslation();
  const accounts = useAccounts();
  const transactions = useTransactions();
  const sales = useSales();
  const purchases = usePurchases();
  const advances = useAdvances();
  const settlements = useSettlements();
  const stockMovements = useStockMovements();
  const products = useProducts();
  const businesses = useBusinesses();
  const primary = usePrimaryCurrency() ?? 'XOF';
  const { snapshot } = useRates();

  const [anchor, setAnchor] = useState(currentMonth());

  const business = (businesses ?? []).find((row) => !row.archived) ?? null;
  const range = periodRange('month', anchor);
  const lang = i18n.language;

  const fmt = (minor: number) => formatAmount(minor, primary, lang);

  const report = useMemo(
    () =>
      buildTreasurySnapshot({
        businessId: business?.id ?? '',
        accounts: accounts ?? [],
        transactions: transactions ?? [],
        sales: sales ?? [],
        purchases: purchases ?? [],
        products: products ?? [],
        stockMovements: stockMovements ?? [],
        advances: advances ?? [],
        settlements: settlements ?? [],
        from: range.from,
        to: range.to,
        year: range.year,
      }),
    [
      business?.id,
      accounts,
      transactions,
      sales,
      purchases,
      products,
      stockMovements,
      advances,
      settlements,
      range.from,
      range.to,
      range.year,
    ],
  );

  const available = snapshot ? totalInPrimary(report.lines, primary, snapshot) : report.available;
  const accountName = (id?: string) => (accounts ?? []).find((account) => account.id === id)?.name ?? '—';
  const documentDate = (documentId?: string, kind?: string) =>
    (kind === 'sale' ? (sales ?? []) : (purchases ?? [])).find((doc) => doc.id === documentId)?.date ?? '—';

  if (!business) {
    return (
      <Page title={t('treasury.title')}>
        <Card>
          <EmptyState label={t('trade.noBusiness')} icon="💧" />
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title={t('treasury.title')}
      actions={
        <div className="no-print flex flex-wrap gap-2">
          <Link to="/accounts" className={btnGhost}>
            🏦 {t('treasury.manageAccounts')}
          </Link>
          <Link to="/clients" className={btnGhost}>
            👤 {t('treasury.customerCredit')}
          </Link>
        </div>
      }
    >
      <p className="mb-4 max-w-3xl text-sm text-sage-700">{t('treasury.intro')}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={btnGhost} onClick={() => setAnchor(shiftAnchor('month', anchor, -1))}>
          ←
        </button>
        <span className="min-w-[10rem] text-center text-sm font-semibold text-forest-900">{monthLabel(anchor, lang)}</span>
        <button type="button" className={btnGhost} onClick={() => setAnchor(shiftAnchor('month', anchor, 1))}>
          →
        </button>
        <span className="text-xs text-sage-500">
          {range.from} → {range.to}
        </span>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('treasury.available')} value={fmt(available)} hint={t('treasury.availableHint')} />
        <StatCard
          label={t('treasury.customerCredit')}
          value={fmt(report.credits.customer)}
          hint={t('treasury.customerCreditHint')}
          valueClass={report.credits.customer > 0 ? 'text-amber-600' : undefined}
        />
        <StatCard
          label={t('treasury.supplierCredit')}
          value={fmt(report.credits.supplier)}
          hint={t('treasury.supplierCreditHint')}
          valueClass={report.credits.supplier > 0 ? 'text-amber-600' : undefined}
        />
        <StatCard label={t('treasury.advancesOpen')} value={fmt(report.report.advancesOpen)} hint={t('treasury.advancesOpenHint')} />
      </div>

      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-forest-900">{t('treasury.accounts')}</h2>
      <p className="mb-2 text-xs text-sage-600">{t('treasury.accountsHint')}</p>

      {report.lines.length === 0 ? (
        <Card className="mb-5">
          <p className="text-sm text-sage-700">{t('treasury.noAccounts')}</p>
          <Link to="/accounts" className={`${btnPrimary} mt-3 inline-block`}>
            ＋ {t('treasury.manageAccounts')}
          </Link>
        </Card>
      ) : (
        <div className="mb-5 grid gap-3 lg:grid-cols-3">
          {report.groups.map((group) => (
            <Card key={group.group}>
              <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-forest-100 pb-1">
                <h3 className="text-sm font-semibold text-forest-950">{t(GROUP_LABEL[group.group])}</h3>
                <span className="text-sm font-bold text-forest-800">
                  {fmt(snapshot ? totalInPrimary(group.lines, primary, snapshot) : group.total)}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {group.lines.map((line) => (
                  <li key={line.account.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-forest-900">{line.account.name}</span>
                      <span className="block text-[11px] text-sage-500">
                        {line.account.type === 'mobile' && line.account.provider
                          ? t(PROVIDER_LABEL[line.account.provider])
                          : t(`accounts.${line.account.type}`)}
                        {' · '}
                        {t('treasury.movements', { count: line.movements })}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-forest-800">{formatAmount(line.balance, line.account.currency, lang)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-forest-900">{t('treasury.flows')}</h2>
      <p className="mb-2 text-xs text-sage-600">{t('treasury.flowsHint')}</p>
      <Card className="mb-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
              <th className="py-1.5">{t('treasury.flows')}</th>
              <th className="py-1.5 text-right">{t('treasury.amount')}</th>
              <th className="py-1.5 text-right">{t('treasury.counted')}</th>
            </tr>
          </thead>
          <tbody>
            {report.flows.map((flow) => (
              <tr key={flow.key} className="border-b border-forest-50">
                <td className="py-1.5">
                  <span className="font-medium text-forest-950">{t(`treasury.${flow.key}`)}</span>
                  <span className="block text-[11px] text-sage-500">{t(`treasury.${flow.key}Hint`)}</span>
                </td>
                <td className="py-1.5 text-right font-semibold">{fmt(flow.amount)}</td>
                <td className="py-1.5 text-right">
                  {flow.counted === 'yes' ? (
                    <Tag tone="green">{t('treasury.countedYes')}</Tag>
                  ) : flow.counted === 'neutral' ? (
                    <Tag tone="amber">{t('treasury.countedNeutral')}</Tag>
                  ) : (
                    <Tag tone="sage">{t('treasury.countedNo')}</Tag>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-forest-900">{t('treasury.settlements')}</h2>
      <p className="mb-2 text-xs text-sage-600">{t('treasury.settlementsHint')}</p>
      {report.settlements.length === 0 ? (
        <Card>
          <EmptyState label={t('treasury.emptySettlements')} icon="🧾" />
          <p className="mt-2 text-center text-xs text-sage-600">{t('treasury.settlementsFromParties')}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1.5">{t('treasury.date')}</th>
                <th className="py-1.5">{t('treasury.party')}</th>
                <th className="py-1.5">{t('treasury.document')}</th>
                <th className="py-1.5 text-right">{t('treasury.amount')}</th>
                <th className="py-1.5">{t('treasury.method')}</th>
                <th className="py-1.5">{t('treasury.account')}</th>
              </tr>
            </thead>
            <tbody>
              {report.settlements.map((settlement) => (
                <tr key={settlement.id} className="border-b border-forest-50">
                  <td className="whitespace-nowrap py-1.5">{settlement.date}</td>
                  <td className="py-1.5">
                    <span className="font-medium text-forest-950">{settlement.partyName || '—'}</span>
                    <span className="block text-[11px] text-sage-500">
                      {settlement.kind === 'client' ? t('treasury.client') : t('treasury.supplier')}
                    </span>
                  </td>
                  <td className="py-1.5">{documentDate(settlement.documentId, settlement.documentKind)}</td>
                  <td className="py-1.5 text-right font-semibold">{fmt(settlement.amount)}</td>
                  <td className="py-1.5">{t(`trade.paymentMethods.${settlement.method}`)}</td>
                  <td className="py-1.5">{accountName(settlement.accountId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-2 text-xs text-sage-500">{t('treasury.hint')}</p>
      <p className="mt-1 text-xs text-sage-500">{t('trade.paymentMethods.cash')} · Wave · Orange Money · MTN · Moov</p>
    </Page>
  );
}
