import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAdvances,
  useBusinesses,
  useCategories,
  useParties,
  usePrimaryCurrency,
  useProducts,
  usePurchases,
  useSales,
  useTransactions,
} from '@/hooks/useData';
import { formatAmount } from '@/core/currencies';
import { advanceRemaining } from '@/core/advances';
import { downloadPdf, pdfFileName, pdfSupportsLanguage, printDocument } from '@/core/pdf';
import { currentMonth, endOfMonth, todayISO } from '@/lib/date';
import { Card, Page, Tag, btnGhost, btnPrimary } from '@/components/common';

type DocKind =
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'stock'
  | 'customerCredits'
  | 'supplierCredits'
  | 'clients'
  | 'advances';

const KINDS: DocKind[] = [
  'sales',
  'purchases',
  'expenses',
  'stock',
  'customerCredits',
  'supplierCredits',
  'clients',
  'advances',
];

interface StatementTable {
  head: string[];
  body: string[][];
  totalLabel: string;
  total: number;
  /** Nombre de lignes, affiché sous le titre. */
  count: number;
}

/**
 * États imprimables de l'activité : ventes, achats, dépenses, stock, crédits
 * clients et fournisseurs, avances. Chaque état se prévisualise à l'écran, puis
 * s'imprime en A4 ou se télécharge en PDF. Les données viennent d'IndexedDB :
 * la page fonctionne hors connexion.
 */
export default function ActivityDocs() {
  const { t, i18n } = useTranslation();
  const sales = useSales();
  const purchases = usePurchases();
  const transactions = useTransactions();
  const products = useProducts();
  const advances = useAdvances();
  const categories = useCategories();
  const parties = useParties();
  const businesses = useBusinesses();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const [kind, setKind] = useState<DocKind>('sales');
  const [from, setFrom] = useState(`${currentMonth()}-01`);
  const [to, setTo] = useState(endOfMonth(currentMonth()));

  const lang = i18n.language;
  const fmt = (minor: number) => formatAmount(minor, primary, lang);
  const business = (businesses ?? []).find((row) => !row.archived) ?? null;

  const categoryLabel = (id?: string) => {
    const category = (categories ?? []).find((row) => row.id === id);
    if (!category) return t('business.uncategorised');
    return lang.startsWith('fr') ? category.nameFr : category.nameEn;
  };

  const statusLabel = (status: string) =>
    status === 'delivered'
      ? t('advances.statusDelivered')
      : status === 'refunded'
        ? t('advances.statusRefunded')
        : t('advances.statusOpen');

  const table: StatementTable = useMemo(() => {
    if (kind === 'sales' || kind === 'customerCredits') {
      const rows = (sales ?? []).filter((sale) => {
        if (sale.date < from || sale.date > to) return false;
        return kind === 'sales' ? true : sale.due > 0;
      });
      return {
        head: [
          t('invoices.number'),
          t('documents.date'),
          t('invoices.client'),
          t('documents.total'),
          t('invoices.paid'),
          t('invoices.due'),
        ],
        body: rows.map((sale) => [
          sale.number ?? '—',
          sale.date,
          sale.partyName ?? '—',
          fmt(sale.total),
          fmt(sale.paid),
          fmt(sale.due),
        ]),
        totalLabel: kind === 'sales' ? t('documents.total') : t('invoices.dueTotal'),
        total: rows.reduce((sum, sale) => sum + (kind === 'sales' ? sale.total : sale.due), 0),
        count: rows.length,
      };
    }

    if (kind === 'purchases' || kind === 'supplierCredits') {
      const rows = (purchases ?? []).filter((purchase) => {
        if (purchase.date < from || purchase.date > to) return false;
        return kind === 'purchases' ? true : purchase.due > 0;
      });
      return {
        head: [
          t('invoices.number'),
          t('documents.date'),
          t('nav.suppliers'),
          t('documents.total'),
          t('invoices.paid'),
          t('invoices.due'),
        ],
        body: rows.map((purchase) => [
          purchase.number ?? '—',
          purchase.date,
          purchase.partyName ?? '—',
          fmt(purchase.total),
          fmt(purchase.paid),
          fmt(purchase.due),
        ]),
        totalLabel: kind === 'purchases' ? t('documents.total') : t('treasury.supplierCredit'),
        total: rows.reduce((sum, purchase) => sum + (kind === 'purchases' ? purchase.total : purchase.due), 0),
        count: rows.length,
      };
    }

    if (kind === 'expenses') {
      const rows = (transactions ?? []).filter(
        (tx) =>
          tx.type === 'expense' &&
          Boolean(tx.businessId) &&
          !tx.id.startsWith('purchase-') &&
          tx.date >= from &&
          tx.date <= to,
      );
      return {
        head: [t('documents.date'), t('expenses.category'), t('expenses.note'), t('expenses.status'), t('documents.total')],
        body: rows.map((tx) => [
          tx.date,
          categoryLabel(tx.categoryId),
          tx.note ?? '—',
          tx.settled === false ? t('expenses.credit') : t('expenses.paid'),
          fmt(tx.amountInPrimary),
        ]),
        totalLabel: t('documents.total'),
        total: rows.reduce((sum, tx) => sum + tx.amountInPrimary, 0),
        count: rows.length,
      };
    }

    if (kind === 'stock') {
      const rows = (products ?? []).filter((product) => !product.archived);
      return {
        head: [t('products.name'), t('products.unit'), t('products.stockQty'), t('products.buyPrice'), t('products.value')],
        body: rows.map((product) => [
          product.name,
          product.unit,
          String(product.stockQty),
          fmt(product.buyPrice),
          fmt(Math.round(product.stockQty * product.buyPrice)),
        ]),
        totalLabel: t('products.value'),
        total: rows.reduce((sum, product) => sum + Math.round(Math.max(0, product.stockQty) * product.buyPrice), 0),
        count: rows.length,
      };
    }

    if (kind === 'clients') {
      // Coordonnées des clients et solde dû, pour un état nominatif imprimable.
      const clientRows = (parties ?? []).filter((party) => party.kind === 'client' && !party.archived);
      const documentsOf = (id: string) => (sales ?? []).filter((sale) => sale.partyId === id);
      const dueOf = (id: string) => documentsOf(id).reduce((sum, sale) => sum + sale.due, 0);
      return {
        head: [
          t('common.name'),
          t('parties.phone'),
          t('parties.address'),
          t('parties.documents'),
          t('parties.totalDue'),
        ],
        body: clientRows.map((party) => [
          party.name,
          party.phone || '—',
          party.address || '—',
          String(documentsOf(party.id).length),
          fmt(dueOf(party.id)),
        ]),
        totalLabel: t('parties.totalDue'),
        total: clientRows.reduce((sum, party) => sum + dueOf(party.id), 0),
        count: clientRows.length,
      };
    }

    const rows = (advances ?? []).filter((advance) => advance.receivedOn >= from && advance.receivedOn <= to);
    return {
      head: [
        t('documents.date'),
        t('advances.client'),
        t('advances.subject'),
        t('advances.status'),
        t('advances.amount'),
        t('advances.remaining'),
      ],
      body: rows.map((advance) => [
        advance.receivedOn,
        advance.partyName ?? '—',
        advance.subject,
        statusLabel(advance.status),
        fmt(advance.amount),
        fmt(advanceRemaining(advance)),
      ]),
      totalLabel: t('advances.totalOpen'),
      total: rows.reduce((sum, advance) => sum + advance.amount, 0),
      count: rows.length,
    };
  }, [kind, sales, purchases, transactions, products, advances, parties, from, to, lang, primary, categories]);

  const title = t(`states.${kind}`);
  const locale = lang.startsWith('ar') ? 'ar' : lang.startsWith('fr') ? 'fr-FR' : 'en-US';
  const generatedAt = new Date().toLocaleString(locale);

  const exportPdf = () => {
    if (!pdfSupportsLanguage(lang)) {
      printDocument();
      return;
    }
    downloadPdf({
      fileName: pdfFileName(`etat-${kind}`, `${from}_${to}`),
      title,
      business,
      reference: `${from} → ${to}`,
      meta: [
        [t('states.from'), from],
        [t('states.to'), to],
        [t('states.count'), String(table.count)],
      ],
      head: table.head,
      body: table.body,
      totals: [[table.totalLabel, fmt(table.total)]],
      footer: `${t('documents.footer')} · ${generatedAt}`,
    });
  };

  return (
    <Page
      title={t('states.title')}
      actions={
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={printDocument}>
            🖨 {t('documents.print')}
          </button>
          <button type="button" className={btnGhost} onClick={exportPdf}>
            ⬇ {t('documents.pdf')}
          </button>
        </div>
      }
    >
      <p className="no-print mb-4 max-w-3xl text-sm text-sage-700">{t('states.intro')}</p>

      <div className="no-print mb-3 flex flex-wrap gap-1.5">
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              value === kind ? 'border-forest-600 bg-forest-600 text-white' : 'border-forest-200 bg-white text-forest-800 hover:bg-forest-50'
            }`}
          >
            {t(`states.${value}`)}
          </button>
        ))}
      </div>

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          {t('states.from')}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-lg border border-forest-200 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2">
          {t('states.to')}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-lg border border-forest-200 px-2 py-1"
          />
        </label>
        <span className="text-xs text-sage-500">{t('states.count', { count: table.count })}</span>
      </div>

      <Card className="p-0">
        <article className="print-sheet rounded-xl bg-white p-4 sm:p-6">
          <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-forest-200 pb-2">
            <div>
              <h2 className="text-lg font-bold text-forest-950">{business?.name ?? t('documents.businessFallback')}</h2>
              <p className="text-xs text-sage-600">{title}</p>
            </div>
            <div className="text-right text-xs text-sage-600">
              <p dir="ltr">
                {from} → {to}
              </p>
              <p>{generatedAt}</p>
              <p>{primary}</p>
            </div>
          </header>

          {table.body.length === 0 ? (
            <p className="py-6 text-center text-sm text-sage-600">{t('states.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                    {table.head.map((cell) => (
                      <th key={cell} className="whitespace-nowrap py-1.5 pe-2">
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.body.map((row, index) => (
                    <tr key={`${row[0]}-${index}`} className="border-b border-forest-50">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${cell}-${cellIndex}`}
                          className={`whitespace-nowrap py-1.5 pe-2 ${cellIndex >= row.length - 2 ? 'text-end' : ''}`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-forest-300 font-semibold">
                    <td className="py-1.5">{table.totalLabel}</td>
                    <td colSpan={table.head.length - 1} className="py-1.5 text-right">
                      {fmt(table.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <footer className="mt-3 flex flex-wrap justify-between gap-2 border-t border-forest-100 pt-2 text-[10px] text-sage-500">
            <span>{t('documents.footer')}</span>
            <span>{todayISO()}</span>
          </footer>
        </article>
      </Card>

      {kind === 'clients' && (
        <p className="no-print mt-2 text-xs text-sage-500">
          <Link to="/clients" className="underline hover:text-forest-800">
            {t('states.manageClients')}
          </Link>
        </p>
      )}
      <p className="no-print mt-2 text-xs text-sage-500">{t('states.hint')}</p>
      <div className="no-print mt-2">
        <Tag tone="sage">{t('states.offlineHint')}</Tag>
      </div>
    </Page>
  );
}
