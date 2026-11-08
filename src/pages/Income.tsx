import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useAdvances,
  useBusinesses,
  useCategories,
  usePrimaryCurrency,
  useProducts,
  usePurchases,
  useSales,
  useTransactions,
} from '@/hooks/useData';
import {
  anchorFor,
  buildIncomeStatement,
  buildPeriodReport,
  periodRange,
  shiftAnchor,
  type PeriodKind,
} from '@/core/reports';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import { downloadPdf, pdfFileName, pdfSupportsLanguage } from '@/core/pdf';
import { Card, EmptyState, Page, btnGhost, btnPrimary } from '@/components/common';

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
 * Compte de résultat de l'activité : produits, achats de marchandises, autres
 * charges catégorie par catégorie, résultat net et marge, puis un bilan
 * simplifié (ce que l'activité possède, ce qu'elle doit, sa situation nette).
 * Tout est calculé à partir des données locales, donc l'écran fonctionne hors
 * connexion, comme le reste de l'assistant.
 */
export default function Income() {
  const { t, i18n } = useTranslation();
  const sales = useSales();
  const purchases = usePurchases();
  const products = useProducts();
  const advances = useAdvances();
  const accounts = useAccounts();
  const transactions = useTransactions();
  const categories = useCategories();
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

  const statement = useMemo(
    () =>
      buildIncomeStatement({
        businessId: selectedId,
        transactions: transactions ?? [],
        sales: sales ?? [],
        purchases: purchases ?? [],
        from: range.from,
        to: range.to,
      }),
    [selectedId, transactions, sales, purchases, range.from, range.to],
  );

  const report = useMemo(
    () =>
      buildPeriodReport({
        businessId: selectedId,
        transactions: transactions ?? [],
        sales: sales ?? [],
        purchases: purchases ?? [],
        products: products ?? [],
        advances: advances ?? [],
        accounts: accounts ?? [],
        from: range.from,
        to: range.to,
        year: range.year,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, transactions, sales, purchases, products, advances, accounts, range.from, range.to, range.year],
  );

  const fmt = (value: number) => formatAmount(value, primary, i18n.language);

  const categoryLabel = (id: string) => {
    const category = (categories ?? []).find((row) => row.id === id);
    if (!category) return t('income.uncategorised');
    return i18n.language.startsWith('fr') ? category.nameFr : category.nameEn;
  };

  const assets = report.cashAvailable + report.stockValue + report.customerCredit;
  const liabilities = report.supplierCredit;
  const equity = assets - liabilities;

  const exportPdf = () => {
    if (!pdfSupportsLanguage(i18n.language)) {
      window.print();
      return;
    }
    downloadPdf({
      fileName: pdfFileName(`compte-resultat-${kind}`, range.from),
      title: `${t('income.title')} — ${label(kind, anchor, range.from)}`,
      business: selected,
      reference: `${range.from} → ${range.to}`,
      meta: [
        [t('income.period'), label(kind, anchor, range.from)],
        [t('income.generated', { date: todayISO() }), primary],
      ],
      head: [t('income.line'), t('income.amount')],
      body: [
        [t('income.salesHt'), fmt(statement.revenue)],
        [t('income.goodsHt'), fmt(-statement.goods)],
        ...statement.otherExpenses.map((line) => [categoryLabel(line.id), fmt(-line.total)]),
        [t('income.totalCharges'), fmt(-statement.expenses)],
        [t('income.result'), fmt(statement.result)],
        [t('income.margin'), `${statement.margin.toFixed(1)} %`],
        [t('income.tax'), ''],
        [t('income.taxCollected'), fmt(statement.salesTax)],
        [t('income.taxDeductible'), fmt(-statement.purchasesTax)],
        [statement.taxDue >= 0 ? t('income.taxDue') : t('income.taxCredit'), fmt(Math.abs(statement.taxDue))],
      ],
      totals: [
        [t('income.cash'), fmt(report.cashAvailable)],
        [t('income.stock'), fmt(report.stockValue)],
        [t('income.receivables'), fmt(report.customerCredit)],
        [t('income.payables'), fmt(report.supplierCredit)],
        [t('income.equity'), fmt(equity)],
      ],
      footer: t('documents.footer'),
    });
  };

  if (businesses === undefined || transactions === undefined) {
    return (
      <Page title={t('income.title')}>
        <EmptyState label={t('common.loading')} />
      </Page>
    );
  }

  if (activeBusinesses.length === 0) {
    return (
      <Page title={t('income.title')}>
        <Card>
          <EmptyState label={t('income.noBusiness')} icon="🧮" />
          <p className="mt-2 text-center text-xs text-sage-600">{t('income.noBusinessHint')}</p>
        </Card>
      </Page>
    );
  }

  return (
    <Page title={t('income.title')}>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <button type="button" className={btnPrimary} onClick={() => window.print()}>
          🖨 {t('documents.print')}
        </button>
        <button type="button" className={btnGhost} onClick={exportPdf}>
          ⬇ {t('documents.pdf')}
        </button>
      </div>

      <Card className="no-print mb-4">
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
        <p className="mt-2 text-xs text-sage-500">{t('balances.range', { from: range.from, to: range.to })}</p>
      </Card>

      <article className="print-sheet rounded-xl border border-forest-100 bg-white p-5 shadow-sm sm:p-8">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-forest-200 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">{t('income.title')}</p>
            <h2 className="text-xl font-bold text-forest-950">{selected?.name}</h2>
            <p className="text-xs text-sage-600">
              {t('income.period')} : {range.from} → {range.to} · {label(kind, anchor, range.from)}
            </p>
          </div>
          <div className="text-right text-xs text-sage-600">
            <p>{primary}</p>
            <p>{t('income.generated', { date: todayISO() })}</p>
          </div>
        </header>

        <p className="mb-4 text-xs text-sage-500">{t('income.hint')}</p>

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: t('income.revenue'), value: fmt(statement.revenue) },
            { label: t('income.totalCharges'), value: fmt(statement.expenses) },
            {
              label: t('income.result'),
              value: fmt(statement.result),
              tone: statement.result >= 0 ? 'text-forest-700' : 'text-red-600',
            },
            { label: t('income.margin'), value: `${statement.margin.toFixed(1)} %` },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-forest-100 bg-forest-50/40 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-sage-600">{item.label}</p>
              <p className={`text-sm font-bold ${item.tone ?? 'text-forest-900'}`}>{item.value}</p>
            </div>
          ))}
        </div>

        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-forest-900">{t('income.statement')}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
              <th className="py-1">{t('income.line')}</th>
              <th className="py-1 text-right">{t('income.amount')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-forest-50">
              <td className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sage-600" colSpan={2}>
                {t('income.revenue')}
              </td>
            </tr>
            <tr className="border-b border-forest-50">
              <td className="py-1.5 pl-3">{t('income.salesHt')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.revenue)}</td>
            </tr>
            <tr className="border-b border-forest-50">
              <td className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sage-600" colSpan={2}>
                {t('income.charges')}
              </td>
            </tr>
            <tr className="border-b border-forest-50">
              <td className="py-1.5 pl-3">{t('income.goodsHt')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(-statement.goods)}</td>
            </tr>
            {statement.otherExpenses.map((line) => (
              <tr key={line.id} className="border-b border-forest-50">
                <td className="py-1.5 pl-3">{categoryLabel(line.id)}</td>
                <td className="py-1.5 text-right font-medium">{fmt(-line.total)}</td>
              </tr>
            ))}
            <tr className="border-t border-forest-300">
              <td className="py-1.5 font-semibold">{t('income.totalCharges')}</td>
              <td className="py-1.5 text-right font-bold">{fmt(-statement.expenses)}</td>
            </tr>
            <tr className="border-t-2 border-forest-300">
              <td className="py-2 font-bold">{t('income.result')}</td>
              <td
                className={`py-2 text-right text-base font-bold ${
                  statement.result >= 0 ? 'text-forest-700' : 'text-red-600'}
                }`}
              >
                {fmt(statement.result)}
              </td>
            </tr>
            <tr className="border-b border-forest-50">
              <td className="pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-sage-600" colSpan={2}>
                {t('income.tax')}
              </td>
            </tr>
            <tr className="border-b border-forest-50">
              <td className="py-1.5 pl-3">{t('income.taxCollected')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.salesTax)}</td>
            </tr>
            <tr className="border-b border-forest-50">
              <td className="py-1.5 pl-3">{t('income.taxDeductible')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(-statement.purchasesTax)}</td>
            </tr>
            <tr className="border-t-2 border-forest-300">
              <td className="py-1.5 font-bold">
                {statement.taxDue >= 0 ? t('income.taxDue') : t('income.taxCredit')}
              </td>
              <td className="py-1.5 text-right font-bold">{fmt(Math.abs(statement.taxDue))}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-sage-500">{t('income.resultHint')}</p>
        <p className="mt-1 text-[11px] text-sage-500">{t('income.taxHint')}</p>

        <h3 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-forest-900">{t('income.balance')}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1">{t('income.assets')}</th>
                <th className="py-1 text-right">{t('income.amount')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-forest-50">
                <td className="py-1.5">{t('income.cash')}</td>
                <td className="py-1.5 text-right font-medium">{fmt(report.cashAvailable)}</td>
              </tr>
              <tr className="border-b border-forest-50">
                <td className="py-1.5">{t('income.stock')}</td>
                <td className="py-1.5 text-right font-medium">{fmt(report.stockValue)}</td>
              </tr>
              <tr className="border-b border-forest-50">
                <td className="py-1.5">{t('income.receivables')}</td>
                <td className="py-1.5 text-right font-medium">{fmt(report.customerCredit)}</td>
              </tr>
              <tr className="border-t-2 border-forest-300">
                <td className="py-1.5 font-semibold">{t('income.totalAssets')}</td>
                <td className="py-1.5 text-right font-bold">{fmt(assets)}</td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1">{t('income.liabilities')}</th>
                <th className="py-1 text-right">{t('income.amount')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-forest-50">
                <td className="py-1.5">{t('income.payables')}</td>
                <td className="py-1.5 text-right font-medium">{fmt(liabilities)}</td>
              </tr>
              <tr className="border-b border-forest-50">
                <td className="py-1.5 font-semibold">{t('income.equity')}</td>
                <td className={`py-1.5 text-right font-bold ${equity >= 0 ? 'text-forest-700' : 'text-red-600'}`}>
                  {fmt(equity)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-sage-500">{t('income.balanceHint')}</p>
      </article>
    </Page>
  );
}
