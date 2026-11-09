/**
 * Documents PDF au format A4 — présentation commune à tous les documents
 * (devis, factures, états, bilans).
 *
 * jsPDF écrit du texte de gauche à droite avec les polices standard : il ne
 * sait ni façonner les lettres arabes ni inverser le sens de lecture. Pour
 * l'arabe, le PDF est donc produit par le navigateur à partir de la feuille
 * A4 imprimable (`window.print()` → « Enregistrer au format PDF »), qui gère
 * correctement la calligraphie et le sens de droite à gauche.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Business } from './types';

export interface PdfExtra {
  title: string;
  head: string[];
  body: (string | number)[][];
}

export interface PdfInput {
  fileName: string;
  title: string;
  /** En-tête de l'entreprise (nom, contact, adresse). */
  business?: Business | null;
  /** Lignes d'identification : [libellé, valeur]. */
  meta: [string, string][];
  /** En-têtes du tableau principal. */
  head?: string[];
  body?: (string | number)[][];
  /** Totaux affichés sous le tableau. */
  totals?: [string, string][];
  /** Second tableau, sous le premier (journal détaillé d'un état). */
  extra?: PdfExtra;
  /** Tableaux de détail suivants, dans l'ordre. */
  extras?: PdfExtra[];
  footer?: string;
  /** Numéro affiché en pied de page. */
  reference?: string;
  /** Bloc client (nom, adresse, téléphone) imprimé en face de l'entreprise. */
  party?: { label: string; name?: string; address?: string; phone?: string };
}

/** jsPDF sait-il écrire cette langue sans déformer les lettres ? */
export function pdfSupportsLanguage(language: string): boolean {
  return !language.toLowerCase().startsWith('ar');
}

/**
 * jsPDF écrit avec les polices standard (WinAnsi) : les espaces fines ou
 * insécables des montants formatés (U+202F, U+00A0, U+2009) y sortent en
 * caractères parasites, et la flèche → n'existe pas dans cette table. On les
 * ramène à des caractères simples avant l'écriture.
 */
export function pdfSafeText(value: string): string {
  return value.replace(/[\u202f\u00a0\u2009]/g, ' ').replace(/\s*\u2192\s*/g, ' - ');
}

/** Imprime la feuille A4 affichée (le navigateur propose « Enregistrer en PDF »). */
export function printDocument(): void {
  window.print();
}

interface WithAutoTable {
  lastAutoTable?: { finalY: number };
}

/**
 * Construit et télécharge un PDF A4 : en-tête, identification, tableau,
 * totaux et pied de page numéroté.
 */
export function downloadPdf(input: PdfInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  if (input.business) {
    doc.setFontSize(16);
    doc.setTextColor(20, 83, 45);
    doc.text(pdfSafeText(input.business.name || '—'), margin, y + 6);
    doc.setFontSize(9);
    doc.setTextColor(90, 100, 90);
    const contact = [input.business.ownerName, input.business.phone, input.business.email, input.business.address]
      .filter(Boolean)
      .join(' · ');
    if (contact) doc.text(pdfSafeText(contact), margin, y + 20);
    if (input.business.taxId) doc.text(pdfSafeText(`N° fiscal : ${input.business.taxId}`), margin, y + 32);
    y += 44;
  }

  if (input.party) {
    let partyY = margin + 6;
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 120);
    doc.text(pdfSafeText(input.party.label.toUpperCase()), width - margin, partyY, { align: 'right' });
    partyY += 13;
    doc.setFontSize(10);
    doc.setTextColor(20, 40, 25);
    doc.text(pdfSafeText(input.party.name ?? '—'), width - margin, partyY, { align: 'right' });
    doc.setFontSize(8);
    doc.setTextColor(90, 100, 90);
    if (input.party.address) {
      partyY += 11;
      doc.text(pdfSafeText(input.party.address), width - margin, partyY, { align: 'right' });
    }
    if (input.party.phone) {
      partyY += 11;
      doc.text(pdfSafeText(input.party.phone), width - margin, partyY, { align: 'right' });
    }
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(15);
  doc.text(pdfSafeText(input.title), margin, y);
  if (input.reference) {
    doc.setFontSize(9);
    doc.setTextColor(90, 100, 90);
    doc.text(pdfSafeText(input.reference), width - margin, y, { align: 'right' });
  }
  y += 16;

  if (input.meta.length > 0) {
    autoTable(doc, {
      startY: y,
      body: input.meta.map(([label, value]) => [pdfSafeText(label), pdfSafeText(value)]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { textColor: [90, 100, 90], cellWidth: 130 }, 1: { fontStyle: 'bold' } },
      margin: { left: margin, right: margin },
    });
    y = ((doc as unknown as WithAutoTable).lastAutoTable?.finalY ?? y) + 12;
  }

  if (input.head && input.body) {
    autoTable(doc, {
      startY: y,
      head: [input.head.map(pdfSafeText)],
      body: input.body.map((row) => row.map((cell) => (typeof cell === 'string' ? pdfSafeText(cell) : cell))),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [20, 83, 45], textColor: 255 },
      margin: { left: margin, right: margin },
      didDrawPage: () => undefined,
    });
    y = ((doc as unknown as WithAutoTable).lastAutoTable?.finalY ?? y) + 14;
  }

  if (input.totals && input.totals.length > 0) {
    autoTable(doc, {
      startY: y,
      body: input.totals.map(([label, value]) => [pdfSafeText(label), pdfSafeText(value)]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 }, 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: width / 2, right: margin },
    });
    y = ((doc as unknown as WithAutoTable).lastAutoTable?.finalY ?? y) + 18;
  }

  const extras = [...(input.extra ? [input.extra] : []), ...(input.extras ?? [])];
  for (const table of extras) {
    if (table.body.length === 0) continue;
    // Un titre seul en bas de page serait suivi du tableau sur la suivante.
    if (y > doc.internal.pageSize.getHeight() - 90) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.setTextColor(20, 40, 25);
    doc.text(pdfSafeText(table.title), margin, y + 4);
    y += 10;
    autoTable(doc, {
      startY: y,
      head: [table.head.map(pdfSafeText)],
      body: table.body.map((row) => row.map((cell) => (typeof cell === 'string' ? pdfSafeText(cell) : cell))),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [20, 83, 45], textColor: 255 },
      margin: { left: margin, right: margin },
    });
    y = ((doc as unknown as WithAutoTable).lastAutoTable?.finalY ?? y) + 14;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 120);
    const footer = input.footer ? `${pdfSafeText(input.footer)} · ` : '';
    doc.text(`${footer}${page} / ${pages}`, width - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }

  doc.save(input.fileName);
}

/** Nom de fichier sûr à partir d'un numéro de document. */
export function pdfFileName(prefix: string, reference: string | undefined): string {
  const slug = (reference ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${prefix}${slug ? `_${slug}` : ''}.pdf`;
}
