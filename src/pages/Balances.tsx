import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useAdvances,
  useBusinesses,
  usePrimaryCurrency,
  useProducts,
  usePurchases,
  useSales,
  useTransactions,
} from '@/hooks/useData';
import {
  anchorFor,
  buildPeriodReport,
  percentChange,
  periodRange,
  previousAnchor,
  shiftAnchor,
  type PeriodKind,
} from '@/core/reports';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import { downloadPdf, pdfFileName, pdfSupportsLanguage } from '@/core/pdf';
import { Card, EmptyState, Page, StatCard, btnGhost, btnPrimary } from '@/components/common';

const KINDS: PeriodKind[] = ['month', 'quarter', 'year'];

/** Libellé lisible de la période, dans la langue de l'utilisateur. */
function usePeriodLabel() {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith('ar') ? 'ar' : i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US';
  return (kind: PeriodKind, anchor: string, from: string) => {
    if (kind === 'year') return anchor;
    if (kind === 'quarter') {
      const year = anchor.slice(0, 4);
      const quarter = anchor.slice(6);
      return `${i18n.language.startsWith('fr') ? 'T' : 'Q'}${quarter} ${year}`;
    }
    const date = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1);
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  };
}

/**
 * Bilans de l'activité : mois, trimestre ou année, avec comparaison à la
 * période précédente et graphique des ventes et charges mois par mois.
 * Tout est calculé à partir des données locales (IndexedDB) : la page
 * fonctionne donc sans connexion, comme le reste de l'assistant.
 */
export default function Balances() {
  const { t, i18n } = useTranslation();
  const sales = useSales();
  const purchases = usePurchases();
  const products = useProducts();
  const advances = useAdvances();
  const accounts = useAccounts();
  const transactions = useTransactions();
  const businesses = useBusinesses();
  const primary = usePrimaryCurrency() ?? 'XOF';
  const label = usePeriodLabel();

  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(() => anchorFor('month', todayISO()));
  const [businessId, setBusinessId] = useState('');

  const activeBusinesses = (businesses ?? []).filter((business) => !business.archived);
  const selected = activeBusinesses.find((business) => business.id === businessId) ?? activeBusinesses[0] ?? null;
  const selectedId = selected?.id ?? '';

  const changeKind = (next: PeriodKind) => {
    setKind(next);
    setAnchor(anchorFor(next, todayISO()));
  };

  const range = periodRange(kind, anchor);
  const previous = periodRange(kind, previousAnchor(kind, anchor));

  const build = (from: string, to: string, year?: number) =>
    buildPeriodReport({
      businessId: selectedId,
      transactions: transactions ?? [],
      sales: sales ?? [],
      purchases: purchases ?? [],
      products: products ?? [],
      advances: advances ?? [],
      accounts: accounts ?? [],
      from,
      to,
      year,
    });

  const report = useMemo(
    () => build(range.from, range.to, range.year),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, transactions, sales, purchases, products, advances, accounts, range.from, range.to, range.year],
  );
  const before = useMemo(
    () => build(previous.from, previous.to, previous.year),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, transactions, sales, purchases, products, advances, accounts, previous.from, previous.to, previous.year],
  );

  const fmt = (value: number) => formatAmount(value, primary, i18n.language);
  const monthShort = (month: string) => {
    const locale = i18n.language.startsWith('ar') ? 'ar' : i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US';
    return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString(locale, {
      month: 'short',
    });
  };

  const exportPdf = () => {
    if (!pdfSupportsLanguage(i18n.language)) {
      window.print();
      return;
    }
    downloadPdf({
      fileName: pdfFileName(`bilan-${kind}`, range.from),
      title: `${t('balances.title')} — ${label(kind, anchor, range.from)}`,
      business: selected,
      reference: `${range.from} → ${range.to}`,
      meta: [[t('balances.range', { from: range.from, to: range.to }), label(kind, anchor, range.from)]],
      head: [t('balances.comparison'), label(kind, anchor, range.from), label(kind, previousAnchor(kind, anchor), previous.from)],
      body: [
        [t('balances.sales'), fmt(report.sales), fmt(before.sales)],
        [t('balances.purchases'), fmt(report.purchases), fmt(before.purchases)],
        [t('balances.otherExpenses'), fmt(report.otherExpenses), fmt(before.otherExpenses)],
        [t('balances.result'), fmt(report.result), fmt(before.result)],
        [t('balances.taxDue'), fmt(report.taxDue), fmt(before.taxDue)],
        [t('balances.cashIn'), fmt(report.cashIn), fmt(before.cashIn)],
        [t('balances.cashOut'), fmt(report.cashOut), fmt(before.cashOut)],
        [t('balances.customerCredit'), fmt(report.customerCredit), fmt(before.customerCredit)],
        [t('balances.supplierCredit'), fmt(report.supplierCredit), fmt(before.supplierCredit)],
      ],
      totals: [
        [t('balances.result'), fmt(report.result)],
        [t('balances.taxDue'), fmt(report.taxDue)],
        [t('balances.cashAvailable'), fmt(report.cashAvailable)],
      ],
      footer: t('documents.footer'),
    });
  };

  const maxBar = Math.max(
    1,
    ...report.monthly.map((point) => Math.max(point.sales, point.expenses)),
  );

  if (businesses === undefined || transactions === undefined) {
    return (
      <Page title={t('balances.title')}>
        <EmptyState label={t('common.loading')} />
      </Page>
    );
  }

  if (activeBusinesses.length === 0) {
    return (
      <Page title={t('balances.title')}>
        <Card>
          <EmptyState label={t('balances.noBusiness')} icon="📈" />
          <p className="mt-2 text-center text-xs text-sage-600">{t('balances.noBusinessHint')}</p>
        </Card>
      </Page>
    );
  }

  return (
    <Page title={t('balances.title')}>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => window.print()}>
          🖨 {t('documents.print')}
        </button>
        <button type="button" className={btnGhost} onClick={exportPdf}>
          ⬇ {t('documents.pdf')}
        </button>
      </div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-forest-200">
            {KINDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeKind(value)}
                aria-pressed={kind === value}
                className={`px-3 py-2 text-sm font-medium ${
                  kind === value ? 'bg-forest-600 text-white' : 'bg-white text-forest-800 hover:bg-forest-50'
                }`}
              >
                {t(`balances.kind.${value}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={btnGhost}
              onClick={() => setAnchor(shiftAnchor(kind, anchor, -1))}
              aria-label={t('balances.previousPeriod')}
            >
              ←
            </button>
            <span className="min-w-[9rem] text-center text-sm font-semibold text-forest-950">
              {label(kind, anchor, range.from)}
            </span>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setAnchor(shiftAnchor(kind, anchor, 1))}
              aria-label={t('balances.nextPeriod')}
            >
              →
            </button>
          </div>
          {activeBusinesses.length > 1 && (
            <select
              className="ml-auto rounded-lg border border-forest-200 bg-white px-2 py-2 text-sm text-forest-900"
              value={selectedId}
              onChange={(event) => setBusinessId(event.target.value)}
              aria-label={t('balances.business')}
            >
              {activeBusinesses.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="mt-2 text-xs text-sage-500">
          {t('balances.range', { from: range.from, to: range.to })}
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('balances.sales')} value={fmt(report.sales)} hint={t('balances.salesHint', { count: report.salesCount })} />
        <StatCard label={t('balances.purchases')} value={fmt(report.purchases)} hint={t('balances.purchasesHint', { count: report.purchasesCount })} />
        <StatCard label={t('balances.otherExpenses')} value={fmt(report.otherExpenses)} hint={t('balances.otherExpensesHint')} />
        <StatCard
          label={t('balances.result')}
          value={fmt(report.result)}
          valueClass={report.result >= 0 ? 'text-forest-700' : 'text-red-600'}
          hint={t('balances.marginHint', { value: report.margin.toFixed(1) })}
        />
        <StatCard
          label={t('balances.taxDue')}
          value={fmt(report.taxDue)}
          hint={t('balances.taxDueHint')}
          valueClass={report.taxDue > 0 ? 'text-amber-700' : undefined}
        />
        <StatCard label={t('balances.cashIn')} value={fmt(report.cashIn)} hint={t('balances.cashInHint')} />
        <StatCard label={t('balances.cashOut')} value={fmt(report.cashOut)} hint={t('balances.cashOutHint')} />
        <StatCard label={t('balances.cashAvailable')} value={fmt(report.cashAvailable)} hint={t('balances.cashAvailableHint')} />
        <StatCard label={t('balances.stockValue')} value={fmt(report.stockValue)} hint={t('balances.stockHint')} />
        <StatCard label={t('balances.customerCredit')} value={fmt(report.customerCredit)} hint={t('balances.customerCreditHint')} />
        <StatCard label={t('balances.supplierCredit')} value={fmt(report.supplierCredit)} hint={t('balances.supplierCreditHint')} />
        <StatCard label={t('balances.advancesReceived')} value={fmt(report.advancesReceived)} hint={t('balances.advancesReceivedHint')} />
        <StatCard label={t('balances.advancesOpen')} value={fmt(report.advancesOpen)} hint={t('balances.advancesOpenHint')} />
      </div>

      <p className="mt-2 text-xs text-sage-500">{t('balances.taxNote')}</p>
      <p className="mt-1 text-xs text-sage-500">{t('balances.stockNote')}</p>
      <p className="mt-1 text-xs text-sage-500">{t('balances.resultVsCash')}</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-forest-900">{t('balances.comparison')}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1" />
                <th className="py-1 text-right">{label(kind, anchor, range.from)}</th>
                <th className="py-1 text-right">{label(kind, previousAnchor(kind, anchor), previous.from)}</th>
                <th className="py-1 text-right">{t('balances.delta')}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'sales', label: t('balances.sales'), value: report.sales, previousValue: before.sales },
                { key: 'stockChange', label: t('balances.stockDeducted'), value: report.stockChange, previousValue: before.stockChange },
                { key: 'result', label: t('balances.result'), value: report.result, previousValue: before.result },
                { key: 'taxDue', label: t('balances.taxDue'), value: report.taxDue, previousValue: before.taxDue },
                { key: 'cashIn', label: t('balances.cashIn'), value: report.cashIn, previousValue: before.cashIn },
                { key: 'expenses', label: t('balances.expensesTotal'), value: report.expensesTotal, previousValue: before.expensesTotal },
              ].map((row) => {
                const delta = row.value - row.previousValue;
                const percent = percentChange(row.value, row.previousValue);
                return (
                  <tr key={row.key} className="border-b border-forest-50">
                    <td className="py-1.5">{row.label}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(row.value)}</td>
                    <td className="py-1.5 text-right text-sage-600">{fmt(row.previousValue)}</td>
                    <td
                      className={`py-1.5 text-right font-semibold ${
                        delta >= 0 ? 'text-forest-700' : 'text-red-600'
                      }`}
                    >
                      {delta >= 0 ? '+' : '−'}
                      {fmt(Math.abs(delta))}
                      {row.previousValue !== 0 && (
                        <span className="ml-1 text-[11px] font-normal text-sage-500">
                          ({percent >= 0 ? '+' : '−'}
                          {Math.abs(percent).toFixed(0)} %)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-forest-900">{t('balances.chartTitle')}</h2>
          <p className="mb-3 text-[11px] text-sage-500">{t('balances.chartHint', { year: range.year })}</p>
          <div className="flex items-end justify-between gap-1" style={{ height: '9rem' }}>
            {report.monthly.map((point) => (
              <div key={point.month} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
                <div className="flex h-full w-full items-end justify-center gap-[2px]">
                  <div
                    className="w-2 rounded-t bg-forest-600"
                    style={{ height: `${Math.max(point.sales > 0 ? 4 : 0, (point.sales / maxBar) * 100)}%` }}
                    title={`${t('balances.chartSales')} ${monthShort(point.month)} : ${fmt(point.sales)}`}
                  />
                  <div
                    className="w-2 rounded-t bg-red-400"
                    style={{ height: `${Math.max(point.expenses > 0 ? 4 : 0, (point.expenses / maxBar) * 100)}%` }}
                    title={`${t('balances.chartExpenses')} ${monthShort(point.month)} : ${fmt(point.expenses)}`}
                  />
                </div>
                <span className="text-[9px] text-sage-600">{monthShort(point.month)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-sage-600">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded bg-forest-600" /> {t('balances.chartSales')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded bg-red-400" /> {t('balances.chartExpenses')}
            </span>
          </div>
        </Card>
      </div>
    </Page>
  );
}
