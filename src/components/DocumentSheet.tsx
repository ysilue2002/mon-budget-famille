import { useTranslation } from 'react-i18next';
import { formatAmount } from '@/core/currencies';
import type { Business, CurrencyCode } from '@/core/types';

export interface SheetLine {
  label: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface DocumentSheetProps {
  title: string;
  number: string;
  date: string;
  /** Libellé et valeur d'une échéance ou d'une validité (facultatif). */
  extra?: [string, string];
  business?: Business | null;
  partyLabel: string;
  partyName?: string;
  lines: SheetLine[];
  totals: [string, string][];
  note?: string;
  statusLabel?: string;
  footer: string;
  lang: string;
  currency: CurrencyCode;
}

function formatQty(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

/**
 * Feuille A4 commune aux devis et aux factures : en-tête de l'entreprise,
 * identification du document, client, lignes, totaux et pied de page. C'est
 * cette feuille que le navigateur imprime ou enregistre en PDF — y compris en
 * arabe, où le rendu du navigateur gère la calligraphie et le sens de lecture.
 */
export default function DocumentSheet({
  title,
  number,
  date,
  extra,
  business,
  partyLabel,
  partyName,
  lines,
  totals,
  note,
  statusLabel,
  footer,
  lang,
  currency,
}: DocumentSheetProps) {
  const { t } = useTranslation();
  const fmt = (minor: number) => formatAmount(minor, currency, lang);

  return (
    <article className="print-sheet mt-4 rounded-xl border border-forest-100 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-forest-200 pb-3">
        <div>
          <h2 className="text-lg font-bold text-forest-950">{business?.name || t('documents.businessFallback')}</h2>
          <p className="text-xs text-sage-600">
            {[business?.ownerName, business?.phone, business?.email].filter(Boolean).join(' · ') || '—'}
          </p>
          {business?.address && <p className="text-xs text-sage-600">{business.address}</p>}
          {business?.taxId && (
            <p className="text-xs text-sage-600">
              {t('documents.taxId')} : {business.taxId}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-base font-bold uppercase tracking-wide text-forest-800">{title}</p>
          <p className="text-sm font-semibold text-forest-950">{number}</p>
          <p className="text-xs text-sage-600">
            {t('documents.date')} : {date}
          </p>
          {extra && (
            <p className="text-xs text-sage-600">
              {extra[0]} : {extra[1]}
            </p>
          )}
          {statusLabel && <p className="mt-1 text-xs font-semibold text-forest-700">{statusLabel}</p>}
        </div>
      </header>

      <div className="mt-3 text-sm">
        <p className="text-[11px] uppercase tracking-wide text-sage-600">{partyLabel}</p>
        <p className="font-semibold text-forest-950">{partyName || '—'}</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
              <th className="py-1.5">{t('documents.designation')}</th>
              <th className="py-1.5 text-right">{t('documents.qty')}</th>
              <th className="py-1.5 text-right">{t('documents.unitPrice')}</th>
              <th className="py-1.5 text-right">{t('documents.lineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.label}-${index}`} className="border-b border-forest-50">
                <td className="py-1.5">{line.label}</td>
                <td className="py-1.5 text-right">{formatQty(line.qty)}</td>
                <td className="py-1.5 text-right">{fmt(line.unitPrice)}</td>
                <td className="py-1.5 text-right font-medium">{fmt(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end">
        <table className="min-w-[14rem] text-sm">
          <tbody>
            {totals.map(([label, value]) => (
              <tr key={label}>
                <td className="py-0.5 pr-4 font-semibold text-forest-900">{label}</td>
                <td className="py-0.5 text-right font-bold text-forest-950">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {note && <p className="mt-3 text-xs text-sage-700">{note}</p>}
      <footer className="mt-4 border-t border-forest-100 pt-2 text-[10px] text-sage-500">{footer}</footer>
    </article>
  );
}
