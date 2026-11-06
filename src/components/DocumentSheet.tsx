import { useTranslation } from 'react-i18next';
import { formatAmount } from '@/core/currencies';
import type { Business, CurrencyCode } from '@/core/types';

export interface SheetLine {
  label: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SheetParty {
  name?: string;
  address?: string;
  phone?: string;
}

interface DocumentSheetProps {
  /** « Devis », « Facture »… (titre imprimé en grand). */
  title: string;
  number: string;
  date: string;
  /** Libellé et valeur d'une échéance ou d'une validité (facultatif). */
  extra?: [string, string];
  business?: Business | null;
  partyLabel: string;
  partyName?: string;
  /** Coordonnées du client reprises de sa fiche (facultatif). */
  party?: SheetParty | null;
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
 * Feuille A4 commune aux devis et aux factures, calquée sur le modèle papier
 * habituel : titre et numéro, bloc entreprise / bloc client, tableau des
 * prestations hors taxe, encadré des totaux (HT, TVA, TTC) et mentions de pied
 * de page. C'est cette feuille que le navigateur imprime ou enregistre en PDF —
 * y compris en arabe, où le rendu du navigateur gère la calligraphie et le sens
 * de lecture.
 */
export default function DocumentSheet({
  title,
  number,
  date,
  extra,
  business,
  partyLabel,
  partyName,
  party,
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
  const contact = [business?.phone, business?.email].filter(Boolean).join(' · ');

  return (
    <article className="print-sheet mt-4 rounded-xl border border-forest-100 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-forest-900 pb-3">
        <div>
          <p className="text-2xl font-black uppercase leading-none tracking-tight text-forest-950 sm:text-3xl">
            {title} <span className="text-forest-600">N°</span>
          </p>
          <p className="mt-1 text-lg font-bold text-forest-950">{number}</p>
        </div>
        <div className="text-right text-xs text-sage-700">
          <p>
            {t('documents.number')} : <span className="font-semibold text-forest-950">{number}</span>
          </p>
          <p>
            {t('documents.date')} : {date}
          </p>
          {extra && (
            <p>
              {extra[0]} : {extra[1]}
            </p>
          )}
          {statusLabel && <p className="mt-1 text-xs font-semibold text-forest-700">{statusLabel}</p>}
        </div>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-forest-300 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sage-600">{t('documents.businessBlock')}</p>
          <p className="text-sm font-bold uppercase text-forest-950">{business?.name || t('documents.businessFallback')}</p>
          {business?.ownerName && <p className="text-xs text-sage-700">{business.ownerName}</p>}
          {business?.address && <p className="text-xs text-sage-700">{business.address}</p>}
          {contact && <p className="text-xs text-sage-700">{contact}</p>}
          {business?.taxId && (
            <p className="text-xs text-sage-700">
              {t('documents.taxId')} : {business.taxId}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-forest-300 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sage-600">{partyLabel}</p>
          <p className="text-sm font-bold text-forest-950">{party?.name || partyName || '—'}</p>
          {party?.address && <p className="text-xs text-sage-700">{party.address}</p>}
          {party?.phone && <p className="text-xs text-sage-700">{party.phone}</p>}
        </section>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-forest-900 text-left text-[11px] uppercase text-forest-950">
              <th className="py-2 pe-2">{t('documents.designation')}</th>
              <th className="py-2 pe-2 text-right">{t('documents.qty')}</th>
              <th className="py-2 pe-2 text-right">{t('documents.unitPriceHt')}</th>
              <th className="py-2 text-right">{t('documents.lineTotalHt')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.label}-${index}`} className="border-b border-forest-200">
                <td className="py-2 pe-2">{line.label}</td>
                <td className="py-2 pe-2 text-right">{formatQty(line.qty)}</td>
                <td className="py-2 pe-2 text-right">{fmt(line.unitPrice)}</td>
                <td className="py-2 text-right font-medium">{fmt(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end">
        <table className="min-w-[15rem] overflow-hidden rounded-lg border border-forest-300 text-sm">
          <tbody>
            {totals.map(([label, value], index) => {
              const last = index === totals.length - 1;
              return (
                <tr key={label} className={last ? 'border-t border-forest-300 bg-forest-50' : 'border-t border-forest-100 first:border-t-0'}>
                  <td className={`px-3 py-2 ${last ? 'font-bold text-forest-900' : 'text-sage-700'}`}>{label}</td>
                  <td className={`px-3 py-2 text-right ${last ? 'text-base font-black text-forest-950' : 'font-semibold text-forest-950'}`}>
                    {value}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {note && <p className="mt-3 whitespace-pre-line text-xs text-sage-700">{note}</p>}

      <footer className="mt-4 grid gap-2 border-t border-forest-100 pt-2 text-[10px] text-sage-500 sm:grid-cols-2">
        <p>{t('documents.thanks')}</p>
        <p className="sm:text-right">{t('documents.paymentTerms')}</p>
        <p className="sm:col-span-2">{footer}</p>
      </footer>
    </article>
  );
}
