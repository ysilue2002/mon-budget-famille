import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useBusinesses, useParties, usePrimaryCurrency, useSales } from '@/hooks/useData';
import { formatAmount } from '@/core/currencies';
import { downloadPdf, pdfFileName, pdfSupportsLanguage, printDocument } from '@/core/pdf';
import { isOverdue } from '@/core/documents';
import { taxBreakdown } from '@/core/trade';
import { todayISO } from '@/lib/date';
import DocumentSheet from '@/components/DocumentSheet';
import type { TradeDocument } from '@/core/types';
import { Card, EmptyState, Page, StatCard, Tag, btnGhost, btnPrimary } from '@/components/common';

type Translator = (key: string, options?: Record<string, unknown>) => string;

/**
 * Lignes de totaux d'une facture : hors taxe, TVA (si un taux est défini),
 * total TTC, puis ce qui est encaissé et ce qui reste dû.
 */
function invoiceTotals(
  invoice: Pick<TradeDocument, 'lines' | 'taxRate' | 'total' | 'paid' | 'due'>,
  t: Translator,
  fmt: (minor: number) => string,
): [string, string][] {
  const tax = taxBreakdown(invoice.lines, invoice.taxRate);
  const rows: [string, string][] = [];
  if (tax.rate > 0) {
    rows.push([t('documents.subtotal'), fmt(tax.subtotal)]);
    rows.push([t('documents.tax', { rate: tax.rate }), fmt(tax.tax)]);
    rows.push([t('documents.totalTtc'), fmt(invoice.total)]);
  } else {
    rows.push([t('documents.total'), fmt(invoice.total)]);
  }
  rows.push([t('invoices.paid'), fmt(invoice.paid)]);
  rows.push([t('invoices.due'), fmt(invoice.due)]);
  return rows;
}

/**
 * Factures : chaque vente est numérotée automatiquement (FAC-année-numéro) et
 * se présente comme une facture A4 imprimable ou téléchargeable. Il n'y a donc
 * qu'un seul document comptable par vente — la facture *est* la vente, ce qui
 * évite tout double comptage.
 */
export default function Invoices() {
  const { t, i18n } = useTranslation();
  const sales = useSales();
  const businesses = useBusinesses();
  const parties = useParties();
  const primary = usePrimaryCurrency() ?? 'XOF';
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const rows = (sales ?? []).filter((sale) => sale.number);
  const activeBusinesses = (businesses ?? []).filter((business) => !business.archived);
  const lang = i18n.language;
  const fmt = (minor: number) => formatAmount(minor, primary, lang);

  const totalBilled = rows.reduce((sum, row) => sum + row.total, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalDue = rows.reduce((sum, row) => sum + row.due, 0);
  const preview = rows.find((row) => row.id === previewId) ?? null;

  const exportPdf = (invoice: TradeDocument) => {
    if (!pdfSupportsLanguage(lang)) {
      setPreviewId(invoice.id);
      setFlash(t('documents.arabicUsesPrint'));
      return;
    }
    downloadPdf({
      fileName: pdfFileName('facture', invoice.number),
      title: t('invoices.title'),
      business: activeBusinesses.find((business) => business.id === invoice.businessId) ?? activeBusinesses[0] ?? null,
      reference: invoice.number,
      party: {
        label: t('invoices.client'),
        name: invoice.partyName,
        address: (parties ?? []).find((party) => party.id === invoice.partyId)?.address,
        phone: (parties ?? []).find((party) => party.id === invoice.partyId)?.phone,
      },
      meta: [
        [t('documents.date'), invoice.date],
        [t('invoices.dueDate'), invoice.dueDate ?? '—'],
        [t('invoices.client'), invoice.partyName ?? '—'],
      ],
      head: [t('documents.designation'), t('documents.qty'), t('documents.unitPriceHt'), t('documents.lineTotalHt')],
      body: invoice.lines.map((line) => [line.label, String(line.qty), fmt(line.unitPrice), fmt(line.lineTotal)]),
      totals: invoiceTotals(invoice, t, fmt),
      footer: t('documents.footer'),
    });
  };

  return (
    <Page
      title={t('invoices.title')}
      actions={
        <div className="no-print flex flex-wrap gap-2">
          <Link to="/sales" className={btnPrimary}>
            ＋ {t('invoices.new')}
          </Link>
        </div>
      }
    >
      <div className="no-print mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('invoices.billed')} value={fmt(totalBilled)} hint={t('invoices.count', { count: rows.length })} />
        <StatCard label={t('invoices.paidTotal')} value={fmt(totalPaid)} />
        <StatCard label={t('invoices.dueTotal')} value={fmt(totalDue)} valueClass={totalDue > 0 ? 'text-amber-600' : undefined} />
      </div>

      {flash && <p className="no-print mb-3 text-sm font-medium text-forest-700">✓ {flash}</p>}

      {rows.length === 0 ? (
        <Card>
          <EmptyState label={t('invoices.empty')} icon="🧾" />
          <p className="mt-2 text-center text-xs text-sage-600">{t('invoices.emptyHint')}</p>
        </Card>
      ) : (
        <Card className="no-print overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1.5 pe-2">{t('invoices.number')}</th>
                <th className="py-1.5 pe-2">{t('documents.date')}</th>
                <th className="py-1.5 pe-2">{t('invoices.client')}</th>
                <th className="py-1.5 pe-2 text-right">{t('documents.total')}</th>
                <th className="py-1.5 pe-2 text-right">{t('invoices.paid')}</th>
                <th className="py-1.5 pe-2 text-right">{t('invoices.due')}</th>
                <th className="py-1.5 pe-2">{t('invoices.status')}</th>
                <th className="py-1.5 pe-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id} className="border-b border-forest-50">
                  <td className="whitespace-nowrap py-1.5 font-medium text-forest-950">{invoice.number}</td>
                  <td className="whitespace-nowrap py-1.5">{invoice.date}</td>
                  <td className="py-1.5 pe-2">{invoice.partyName || '—'}</td>
                  <td className="py-1.5 pe-2 text-right font-semibold">{fmt(invoice.total)}</td>
                  <td className="py-1.5 pe-2 text-right">{fmt(invoice.paid)}</td>
                  <td className={`py-1.5 pe-2 text-right ${invoice.due > 0 ? 'font-semibold text-amber-700' : ''}`}>{fmt(invoice.due)}</td>
                  <td className="py-1.5 pe-2">
                    {invoice.due === 0 ? (
                      <Tag tone="green">{t('invoices.statusPaid')}</Tag>
                    ) : invoice.paid > 0 ? (
                      <Tag tone="amber">{t('invoices.statusPartial')}</Tag>
                    ) : (
                      <Tag tone="red">{t('invoices.statusUnpaid')}</Tag>
                    )}
                    {isOverdue(invoice, todayISO()) && (
                      <span className="ml-1 text-[11px] font-semibold text-red-600">{t('invoices.overdue')}</span>
                    )}
                  </td>
                  <td className="py-1.5 pe-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="rounded p-1 text-sm hover:bg-forest-50"
                        onClick={() => setPreviewId(invoice.id)}
                        aria-label={t('documents.preview')}
                      >
                        👁
                      </button>
                      <button
                        type="button"
                        className="rounded p-1 text-sm hover:bg-forest-50"
                        onClick={() => exportPdf(invoice)}
                        aria-label={t('documents.pdf')}
                      >
                        ⬇
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {preview && (
        <div>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={printDocument}>
              🖨 {t('documents.print')}
            </button>
            <button type="button" className={btnGhost} onClick={() => exportPdf(preview)}>
              ⬇ {t('documents.pdf')}
            </button>
            <button type="button" className={btnGhost} onClick={() => setPreviewId(null)}>
              {t('documents.close')}
            </button>
          </div>
          <DocumentSheet
            title={t('invoices.title')}
            number={preview.number ?? '—'}
            date={preview.date}
            extra={preview.dueDate ? [t('invoices.dueDate'), preview.dueDate] : undefined}
            business={activeBusinesses.find((business) => business.id === preview.businessId) ?? activeBusinesses[0] ?? null}
            partyLabel={t('invoices.client')}
            partyName={preview.partyName}
            party={(parties ?? []).find(
              (party) => party.id === preview.partyId || (!preview.partyId && party.name === preview.partyName),
            )}
            lines={preview.lines}
            totals={invoiceTotals(preview, t, fmt)}
            note={preview.note}
            statusLabel={preview.due === 0 ? t('invoices.statusPaid') : t('invoices.statusPartial')}
            footer={t('documents.footer')}
            lang={lang}
            currency={primary}
          />
        </div>
      )}

      <p className="no-print mt-2 text-xs text-sage-500">{t('invoices.hint')}</p>
    </Page>
  );
}
