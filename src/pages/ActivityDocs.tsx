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
  useSettlements,
  useTransactions,
} from '@/hooks/useData';
import { formatAmount } from '@/core/currencies';
import { advanceDirection, advanceRemaining } from '@/core/advances';
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
  | 'suppliers'
  | 'clientStatement'
  | 'supplierStatement'
  | 'advances';

const KINDS: DocKind[] = [
  'sales',
  'purchases',
  'expenses',
  'stock',
  'customerCredits',
  'supplierCredits',
  'clients',
  'suppliers',
  'clientStatement',
  'supplierStatement',
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
 * clients et fournisseurs, coordonnées des clients et des fournisseurs,
 * relevés détaillés d'un client ou d'un fournisseur, avances et acomptes.
 * Chaque état se prévisualise à l'écran (fiches empilées sur téléphone,
 * tableau sur grand écran), puis s'imprime en A4, se télécharge en PDF ou
 * s'envoie par WhatsApp / e-mail. Les données viennent d'IndexedDB : la page
 * fonctionne hors connexion.
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
  const settlements = useSettlements();
  const businesses = useBusinesses();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const [kind, setKind] = useState<DocKind>('sales');
  const [from, setFrom] = useState(`${currentMonth()}-01`);
  const [to, setTo] = useState(endOfMonth(currentMonth()));
  const [statementClientId, setStatementClientId] = useState('');
  const [statementSupplierId, setStatementSupplierId] = useState('');

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

  const clientList = useMemo(
    () =>
      (parties ?? [])
        .filter((party) => party.kind === 'client' && !party.archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [parties],
  );
  const supplierList = useMemo(
    () =>
      (parties ?? [])
        .filter((party) => party.kind === 'supplier' && !party.archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [parties],
  );

  const statementClient = clientList.find((client) => client.id === statementClientId) ?? clientList[0] ?? null;
  const statementSupplier =
    supplierList.find((supplier) => supplier.id === statementSupplierId) ?? supplierList[0] ?? null;
  const statementParty =
    kind === 'clientStatement' ? statementClient : kind === 'supplierStatement' ? statementSupplier : null;
  const isStatement = kind === 'clientStatement' || kind === 'supplierStatement';

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
        body: clientList.map((party) => [
          party.name,
          party.phone || '—',
          party.address || '—',
          String(documentsOf(party.id).length),
          fmt(dueOf(party.id)),
        ]),
        totalLabel: t('parties.totalDue'),
        total: clientList.reduce((sum, party) => sum + dueOf(party.id), 0),
        count: clientList.length,
      };
    }

    if (kind === 'suppliers') {
      // Coordonnées des fournisseurs et reste à leur payer.
      const documentsOf = (id: string) => (purchases ?? []).filter((purchase) => purchase.partyId === id);
      const dueOf = (id: string) => documentsOf(id).reduce((sum, purchase) => sum + purchase.due, 0);
      return {
        head: [
          t('common.name'),
          t('parties.phone'),
          t('parties.address'),
          t('parties.documents'),
          t('advances.remainingToPay'),
        ],
        body: supplierList.map((party) => [
          party.name,
          party.phone || '—',
          party.address || '—',
          String(documentsOf(party.id).length),
          fmt(dueOf(party.id)),
        ]),
        totalLabel: t('advances.remainingToPay'),
        total: supplierList.reduce((sum, party) => sum + dueOf(party.id), 0),
        count: supplierList.length,
      };
    }

    if (kind === 'clientStatement') {
      // Relevé d'un seul client : ses documents, ses règlements et son reste.
      const documents = statementClient
        ? (sales ?? []).filter((sale) => sale.partyId === statementClient.id)
        : [];
      const documentIds = new Set(documents.map((doc) => doc.id));
      const payments = (settlements ?? []).filter(
        (settlement) =>
          settlement.kind === 'client' &&
          ((settlement.documentId && documentIds.has(settlement.documentId)) ||
            (statementClient && settlement.partyId === statementClient.id)),
      );
      const lines = [
        ...documents.map((doc) => ({
          date: doc.date,
          type: t('states.lineInvoice'),
          reference: doc.number ?? '—',
          amount: doc.total,
          due: doc.due,
        })),
        ...payments.map((payment) => ({
          date: payment.date,
          type: t('states.linePayment'),
          reference: documents.find((doc) => doc.id === payment.documentId)?.number ?? '—',
          amount: payment.amount,
          due: 0,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return {
        head: [
          t('documents.date'),
          t('states.lineType'),
          t('states.reference'),
          t('documents.total'),
          t('invoices.due'),
        ],
        body: lines.map((line) => [
          line.date,
          line.type,
          line.reference,
          fmt(line.amount),
          line.due > 0 ? fmt(line.due) : '—',
        ]),
        totalLabel: t('invoices.dueTotal'),
        total: documents.reduce((sum, doc) => sum + doc.due, 0),
        count: lines.length,
      };
    }

    if (kind === 'supplierStatement') {
      // Relevé d'un seul fournisseur : ses achats, ses règlements et son reste.
      const documents = statementSupplier
        ? (purchases ?? []).filter((purchase) => purchase.partyId === statementSupplier.id)
        : [];
      const documentIds = new Set(documents.map((doc) => doc.id));
      const payments = (settlements ?? []).filter(
        (settlement) =>
          settlement.kind === 'supplier' &&
          ((settlement.documentId && documentIds.has(settlement.documentId)) ||
            (statementSupplier && settlement.partyId === statementSupplier.id)),
      );
      const lines = [
        ...documents.map((doc) => ({
          date: doc.date,
          type: t('states.linePurchase'),
          reference: doc.number ?? '—',
          amount: doc.total,
          due: doc.due,
        })),
        ...payments.map((payment) => ({
          date: payment.date,
          type: t('states.linePayment'),
          reference: documents.find((doc) => doc.id === payment.documentId)?.number ?? '—',
          amount: payment.amount,
          due: 0,
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return {
        head: [
          t('documents.date'),
          t('states.lineType'),
          t('states.reference'),
          t('documents.total'),
          t('invoices.due'),
        ],
        body: lines.map((line) => [
          line.date,
          line.type,
          line.reference,
          fmt(line.amount),
          line.due > 0 ? fmt(line.due) : '—',
        ]),
        totalLabel: t('advances.remainingToPay'),
        total: documents.reduce((sum, doc) => sum + doc.due, 0),
        count: lines.length,
      };
    }

    const rows = (advances ?? []).filter((advance) => advance.receivedOn >= from && advance.receivedOn <= to);
    return {
      head: [
        t('documents.date'),
        t('advances.direction'),
        t('advances.party'),
        t('advances.subject'),
        t('advances.status'),
        t('advances.amountShort'),
        t('advances.remainingShort'),
      ],
      body: rows.map((advance) => [
        advance.receivedOn,
        advanceDirection(advance) === 'paid' ? t('advances.directionPaid') : t('advances.directionReceived'),
        advance.partyName ?? '—',
        advance.subject,
        statusLabel(advance.status),
        fmt(advance.amount),
        fmt(advanceRemaining(advance)),
      ]),
      totalLabel: t('advances.totalLabel'),
      total: rows.reduce((sum, advance) => sum + advance.amount, 0),
      count: rows.length,
    };
  }, [
    kind,
    sales,
    purchases,
    transactions,
    products,
    advances,
    parties,
    settlements,
    clientList,
    supplierList,
    statementClient,
    statementSupplier,
    from,
    to,
    lang,
    primary,
    categories,
  ]);

  const title = t(`states.${kind}`);
  const locale = lang.startsWith('ar') ? 'ar' : lang.startsWith('fr') ? 'fr-FR' : 'en-US';
  const generatedAt = new Date().toLocaleString(locale);

  const partyDetails = statementParty
    ? [statementParty.name, statementParty.phone, statementParty.address].filter(Boolean).join(' · ')
    : '';

  const exportPdf = () => {
    if (!pdfSupportsLanguage(lang)) {
      printDocument();
      return;
    }
    downloadPdf({
      fileName: pdfFileName(
        `etat-${kind}`,
        statementParty ? `${statementParty.name}-${todayISO()}` : `${from}_${to}`,
      ),
      title,
      business,
      reference: statementParty ? partyDetails : `${from} → ${to}`,
      meta: [
        ...(statementParty
          ? [
              [
                kind === 'supplierStatement' ? t('advances.supplier') : t('advances.client'),
                partyDetails,
              ] as [string, string],
            ]
          : []),
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

  /** Résumé texte du relevé, pour WhatsApp ou l'e-mail. */
  const statementText = () => {
    const lines = [
      business?.name ?? t('documents.businessFallback'),
      `${title}${statementParty ? ` — ${statementParty.name}` : ''}`,
      partyDetails && statementParty?.phone ? '' : undefined,
      ...table.body.map((row) => row.filter(Boolean).join(' · ')),
      '',
      `${table.totalLabel} : ${fmt(table.total)}`,
    ].filter((line): line is string => line !== undefined);
    return lines.join('\n');
  };

  const shareWhatsApp = () => {
    const digits = statementParty?.phone?.replace(/\D/g, '') ?? '';
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(statementText())}`;
    window.open(url, '_blank', 'noopener');
  };

  const shareEmail = () => {
    const subject = `${title}${statementParty ? ` — ${statementParty.name}` : ''}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(statementText())}`;
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
          {isStatement && (
            <>
              <button type="button" className={btnGhost} onClick={shareWhatsApp}>
                💬 {t('states.shareWhatsApp')}
              </button>
              <button type="button" className={btnGhost} onClick={shareEmail}>
                ✉️ {t('states.shareEmail')}
              </button>
            </>
          )}
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
        {!isStatement && (
          <label className="flex items-center gap-2">
            {t('states.from')}
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="rounded-lg border border-forest-200 px-2 py-1"
            />
          </label>
        )}
        {!isStatement && (
          <label className="flex items-center gap-2">
            {t('states.to')}
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-lg border border-forest-200 px-2 py-1"
            />
          </label>
        )}
        {kind === 'clientStatement' && clientList.length > 0 && (
          <label className="flex items-center gap-2">
            {t('advances.client')}
            <select
              value={statementClient?.id ?? ''}
              onChange={(event) => setStatementClientId(event.target.value)}
              className="rounded-lg border border-forest-200 px-2 py-1"
            >
              {clientList.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'supplierStatement' && supplierList.length > 0 && (
          <label className="flex items-center gap-2">
            {t('advances.supplier')}
            <select
              value={statementSupplier?.id ?? ''}
              onChange={(event) => setStatementSupplierId(event.target.value)}
              className="rounded-lg border border-forest-200 px-2 py-1"
            >
              {supplierList.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="text-xs text-sage-500">{t('states.count', { count: table.count })}</span>
      </div>

      {kind === 'clientStatement' && clientList.length === 0 && (
        <p className="no-print mb-3 text-sm text-sage-600">{t('states.pickClient')}</p>
      )}
      {kind === 'supplierStatement' && supplierList.length === 0 && (
        <p className="no-print mb-3 text-sm text-sage-600">{t('states.pickSupplier')}</p>
      )}

      <Card className="p-0">
        <article className="print-sheet rounded-xl bg-white p-4 sm:p-6">
          <header className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-forest-200 pb-2">
            <div>
              <h2 className="text-lg font-bold text-forest-950">{business?.name ?? t('documents.businessFallback')}</h2>
              <p className="text-xs text-sage-600">{title}</p>
              {statementParty && <p className="mt-1 text-sm font-medium text-forest-900">{partyDetails}</p>}
            </div>
            <div className="text-right text-xs text-sage-600">
              {!isStatement ? (
                <p dir="ltr">
                  {from} → {to}
                </p>
              ) : (
                <p>{t('states.statementScope')}</p>
              )}
              <p>{generatedAt}</p>
              <p>{primary}</p>
            </div>
          </header>

          {table.body.length === 0 ? (
            <p className="py-6 text-center text-sm text-sage-600">{t('states.empty')}</p>
          ) : (
            <>
              <div className="sm:hidden print:hidden">
                {table.body.map((row, index) => (
                  <div key={`${row[0]}-${index}`} className="border-b border-forest-100 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-sage-500">{table.head[0]}</p>
                    <p className="font-semibold text-forest-950">{row[0]}</p>
                    <dl className="mt-1 flex flex-col gap-0.5 text-xs">
                      {table.head.slice(1).map((label, cellIndex) => (
                        <div key={`${label}-${cellIndex}`} className="flex justify-between gap-3">
                          <dt className="text-sage-600">{label}</dt>
                          <dd className="text-end font-medium text-forest-950">{row[cellIndex + 1] ?? '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t-2 border-forest-300 pt-2 text-sm font-semibold">
                  <span>{table.totalLabel}</span>
                  <span>{fmt(table.total)}</span>
                </div>
              </div>

              <div className="hidden overflow-x-auto sm:block print:block">
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
            </>
          )}

          <footer className="mt-3 flex flex-wrap justify-between gap-2 border-t border-forest-100 pt-2 text-[10px] text-sage-500">
            <span>{t('documents.footer')}</span>
            <span>{todayISO()}</span>
          </footer>
        </article>
      </Card>

      {(kind === 'clients' || kind === 'suppliers' || kind === 'advances') && (
        <p className="no-print mt-2 text-xs text-sage-500">
          <Link
            to={kind === 'clients' ? '/clients' : kind === 'suppliers' ? '/suppliers' : '/advances'}
            className="underline hover:text-forest-800"
          >
            {kind === 'clients'
              ? t('states.manageClients')
              : kind === 'suppliers'
                ? t('states.manageSuppliers')
                : t('states.manageAdvances')}
          </Link>
        </p>
      )}
      {kind === 'clientStatement' && <p className="no-print mt-2 text-xs text-sage-500">{t('states.statementHint')}</p>}
      {kind === 'supplierStatement' && (
        <p className="no-print mt-2 text-xs text-sage-500">{t('states.supplierStatementHint')}</p>
      )}
      <p className="no-print mt-2 text-xs text-sage-500">{t('states.hint')}</p>
      <div className="no-print mt-2">
        <Tag tone="sage">{t('states.offlineHint')}</Tag>
      </div>
    </Page>
  );
}
