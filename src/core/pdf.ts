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
    doc.text(input.business.name || '—', margin, y + 6);
    doc.setFontSize(9);
    doc.setTextColor(90, 100, 90);
    const contact = [input.business.ownerName, input.business.phone, input.business.email, input.business.address]
      .filter(Boolean)
      .join(' · ');
    if (contact) doc.text(contact, margin, y + 20);
    if (input.business.taxId) doc.text(`N° fiscal : ${input.business.taxId}`, margin, y + 32);
    y += 44;
  }

  if (input.party) {
    let partyY = margin + 6;
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 120);
    doc.text(input.party.label.toUpperCase(), width - margin, partyY, { align: 'right' });
    partyY += 13;
    doc.setFontSize(10);
    doc.setTextColor(20, 40, 25);
    doc.text(input.party.name ?? '—', width - margin, partyY, { align: 'right' });
    doc.setFontSize(8);
    doc.setTextColor(90, 100, 90);
    if (input.party.address) {
      partyY += 11;
      doc.text(input.party.address, width - margin, partyY, { align: 'right' });
    }
    if (input.party.phone) {
      partyY += 11;
      doc.text(input.party.phone, width - margin, partyY, { align: 'right' });
    }
  }

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(15);
  doc.text(input.title, margin, y);
  if (input.reference) {
    doc.setFontSize(9);
    doc.setTextColor(90, 100, 90);
    doc.text(input.reference, width - margin, y, { align: 'right' });
  }
  y += 16;

  if (input.meta.length > 0) {
    autoTable(doc, {
      startY: y,
      body: input.meta.map(([label, value]) => [label, value]),
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
      head: [input.head],
      body: input.body,
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
      body: input.totals.map(([label, value]) => [label, value]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 220 }, 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: width / 2, right: margin },
    });
    y = ((doc as unknown as WithAutoTable).lastAutoTable?.finalY ?? y) + 18;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 120);
    const footer = input.footer ? `${input.footer} · ` : '';
    doc.text(`${footer}${page} / ${pages}`, width - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }

  doc.save(input.fileName);
}

/** Nom de fichier sûr à partir d'un numéro de document. */
export function pdfFileName(prefix: string, reference: string | undefined): string {
  const slug = (reference ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${prefix}${slug ? `_${slug}` : ''}.pdf`;
}
