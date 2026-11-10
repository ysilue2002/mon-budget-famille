import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdvances, useParties, usePrimaryCurrency, usePurchases, useSales } from '@/hooks/useData';
import { archiveParty, createAdvance, createParty, recordPartyPayment, updateParty } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { parseAmountInput, toMajor } from '@/core/money';
import { todayISO } from '@/lib/date';
import { partyBalance } from '@/core/payments';
import type { Party, TradeDocument } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  Page,
  StatCard,
  Tag,
  TextArea,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

interface PartyForm {
  id?: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: PartyForm = { name: '', phone: '', address: '', notes: '' };

/** Chiffres seuls : « 07 12 34 56 78 » devient « 0712345678 » pour l'appel. */
function digitsOf(phone: string): string {
  return phone.replace(/\D+/g, '');
}

/** Lien WhatsApp avec un message déjà écrit (solde dû ou compte à jour). */
function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${digitsOf(phone)}?text=${encodeURIComponent(message)}`;
}

/**
 * Fiches clients / fournisseurs : coordonnées, historique des documents,
 * solde dû et encaissement (ou paiement) partiel imputé du plus ancien au plus
 * récent. Une fiche archivée garde son historique.
 */
export default function Parties({ kind }: { kind: 'client' | 'supplier' }) {
  const { t, i18n } = useTranslation();
  const parties = useParties();
  const advances = useAdvances() ?? [];
  const sales = useSales();
  const purchases = usePurchases();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PartyForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMessage, setPayMessage] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceMessage, setAdvanceMessage] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const documents = (kind === 'client' ? sales : purchases) ?? [];
  const rows = (parties ?? []).filter((party) => party.kind === kind && !party.archived);
  const selected = rows.find((party) => party.id === selectedId) ?? rows[0] ?? null;

  const docsOf = (party: Party): TradeDocument[] =>
    documents.filter(
      (doc) =>
        doc.partyId === party.id ||
        (!doc.partyId && doc.partyName && doc.partyName.toLowerCase() === party.name.toLowerCase()),
    );

  const balanceOf = (party: Party) => partyBalance(docsOf(party).map((doc) => ({ due: doc.due })));
  const totalDue = rows.reduce((sum, party) => sum + balanceOf(party), 0);
  const selectedDocs = selected ? docsOf(selected).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const selectedDue = selected ? balanceOf(selected) : 0;

  const fmt = (minor: number) => formatAmount(minor, primary, i18n.language);

  // Avances reçues du client et non remboursées : de l'argent déjà encaissé,
  // mais pas encore du chiffre d'affaires.
  const openAdvancesOf = (party: Party) =>
    advances
      .filter((row) => row.partyId === party.id && row.status === 'open' && row.direction !== 'paid')
      .reduce((sum, row) => sum + Math.max(0, row.amount), 0);

  const whatsappMessage = selected
    ? selectedDue > 0
      ? t('parties.whatsappDue', { name: selected.name, amount: fmt(selectedDue) })
      : t('parties.whatsappClear', { name: selected.name })
    : '';

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setOpen(true);
  };

  const openEdit = (party: Party) => {
    setForm({
      id: party.id,
      name: party.name,
      phone: party.phone ?? '',
      address: party.address ?? '',
      notes: party.notes ?? '',
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError(t('parties.nameRequired'));
      return;
    }
    const input = { kind, name: form.name, phone: form.phone, address: form.address, notes: form.notes };
    if (form.id) await updateParty(form.id, input);
    else await createParty(input);
    setOpen(false);
    setForm(EMPTY_FORM);
  };

  const collect = async () => {
    if (!selected) return;
    setPayMessage(null);
    setPayError(null);
    const amount = parseAmountInput(payAmount, primary) ?? 0;
    if (amount <= 0) {
      setPayError(t('validation.invalidAmount'));
      return;
    }
    if (amount > selectedDue) {
      setPayError(t('parties.exceeds'));
      return;
    }
    const applied = await recordPartyPayment(selected.id, amount);
    if (applied === 0) {
      setPayError(t('parties.exceeds'));
      return;
    }
    setPayAmount('');
    setPayMessage(t('parties.recorded', { amount: fmt(applied) }));
  };

  /** Avance reçue avant livraison : suivie à part, jamais comptée en vente. */
  const recordAdvance = async () => {
    if (!selected) return;
    setAdvanceMessage(null);
    setAdvanceError(null);
    const amount = parseAmountInput(advanceAmount, primary) ?? 0;
    if (amount <= 0) {
      setAdvanceError(t('validation.invalidAmount'));
      return;
    }
    await createAdvance({
      partyId: selected.id,
      partyName: selected.name,
      subject: t('parties.advanceSubject'),
      amount,
      expected: Math.max(amount, selectedDue),
      receivedOn: todayISO(),
      direction: 'received',
      status: 'open',
    });
    setAdvanceAmount('');
    setAdvanceMessage(t('parties.advanceSaved', { amount: fmt(amount) }));
  };

  const title = t(kind === 'client' ? 'parties.clients' : 'parties.suppliers');
  const newLabel = t(kind === 'client' ? 'parties.newClient' : 'parties.newSupplier');
  const collectLabel = t(kind === 'client' ? 'parties.collect' : 'parties.pay');

  return (
    <Page
      title={title}
      actions={
        <button type="button" className={btnPrimary} onClick={openCreate}>
          ＋ {newLabel}
        </button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <StatCard label={t('parties.count', { count: rows.length })} value={String(rows.length)} />
        <StatCard
          label={t('parties.totalDue')}
          value={fmt(totalDue)}
          valueClass={totalDue > 0 ? 'text-amber-600' : undefined}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState label={t(kind === 'client' ? 'parties.empty' : 'parties.emptySuppliers')} icon={kind === 'client' ? '👤' : '🏭'} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Card className="h-fit">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sage-600">{t('parties.detail')}</p>
            <ul className="flex flex-col gap-1">
              {rows.map((party) => (
                <li key={party.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(party.id);
                      setPayMessage(null);
                      setPayError(null);
                    }}
                    aria-pressed={party.id === selected?.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                      party.id === selected?.id ? 'bg-forest-600 text-white' : 'text-forest-800 hover:bg-forest-50'
                    }`}
                  >
                    <span className="truncate font-medium">{party.name}</span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${
                        party.id === selected?.id
                          ? 'text-white'
                          : balanceOf(party) > 0
                            ? 'text-red-700'
                            : 'text-forest-700'
                      }`}
                    >
                      {balanceOf(party) > 0 ? fmt(balanceOf(party)) : '✓'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {selected && (
            <Card>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-forest-100 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-forest-950">{selected.name}</h2>
                  <p className="text-xs text-sage-600">
                    {selected.phone || '—'}
                    {selected.address ? ` · ${selected.address}` : ''}
                  </p>
                  {selected.notes && <p className="mt-1 text-xs text-sage-500">{selected.notes}</p>}
                  {/* Les trois gestes du quotidien, sans rien retaper : appeler,
                      envoyer le solde sur WhatsApp, rejoindre le chantier. */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.phone && (
                      <>
                        <a href={`tel:${digitsOf(selected.phone)}`} className={`${btnGhost} px-3 py-1 text-xs`}>
                          📞 {t('parties.call')}
                        </a>
                        <a
                          href={whatsappUrl(selected.phone, whatsappMessage)}
                          target="_blank"
                          rel="noreferrer"
                          className={`${btnGhost} px-3 py-1 text-xs`}
                        >
                          💬 {t('parties.whatsapp')}
                        </a>
                      </>
                    )}
                    {selected.address && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.address)}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`${btnGhost} px-3 py-1 text-xs`}
                      >
                        🗺 {t('parties.directions')}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => openEdit(selected)} aria-label={t('common.edit')}>
                    ✎
                  </button>
                  <ConfirmButton
                    label="🗄"
                    confirmLabel={t('parties.deleteConfirm')}
                    cancelLabel={t('common.cancel')}
                    onConfirm={() => void archiveParty(selected.id)}
                    danger
                  />
                </div>
              </div>

              {/* Rouge : on me doit de l'argent. Vert : c'est réglé. */}
              <div
                className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${
                  selectedDue > 0 ? 'border-red-200 bg-red-50/60' : 'border-forest-200 bg-forest-50/60'
                }`}
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sage-600">{t('parties.dueLabel')}</p>
                  <p className={`text-2xl font-bold ${selectedDue > 0 ? 'text-red-700' : 'text-forest-700'}`}>
                    {selectedDue > 0 ? fmt(selectedDue) : `✓ ${t('parties.paidLabel')}`}
                  </p>
                </div>
                {openAdvancesOf(selected) > 0 && (
                  <p className="text-xs font-semibold text-forest-700">
                    {t('parties.advancesOpen', { amount: fmt(openAdvancesOf(selected)) })}
                  </p>
                )}
              </div>

              <div className="mb-4 rounded-lg border border-forest-100 bg-forest-50/40 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t('parties.amount')}>
                    <TextInput
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(event) => setPayAmount(event.target.value)}
                      placeholder="0"
                      className="w-32"
                    />
                  </Field>
                  <button type="button" className={btnPrimary} onClick={() => void collect()} disabled={selectedDue === 0}>
                    {collectLabel}
                  </button>
                </div>
                {payMessage && <p className="mt-2 text-xs font-semibold text-forest-700">{payMessage}</p>}
                {payError && <p className="mt-2 text-xs font-semibold text-red-600">{payError}</p>}
                <p className="mt-2 text-[11px] text-sage-500">{t('parties.historyHint')}</p>

                <div className="mt-3 border-t border-forest-100 pt-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={t('parties.advanceAmount')}>
                      <TextInput
                        inputMode="decimal"
                        value={advanceAmount}
                        onChange={(event) => setAdvanceAmount(event.target.value)}
                        placeholder={selectedDue > 0 ? String(toMajor(selectedDue, primary)) : '0'}
                        className="w-32"
                      />
                    </Field>
                    <button type="button" className={btnGhost} onClick={() => void recordAdvance()}>
                      ＋ {t('parties.advanceButton')}
                    </button>
                  </div>
                  {advanceMessage && <p className="mt-2 text-xs font-semibold text-forest-700">{advanceMessage}</p>}
                  {advanceError && <p className="mt-2 text-xs font-semibold text-red-600">{advanceError}</p>}
                  <p className="mt-2 text-[11px] text-sage-500">{t('parties.advanceHint')}</p>
                </div>
              </div>

              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-forest-900">{t('parties.documents')}</h3>
              {selectedDocs.length === 0 ? (
                <p className="text-xs text-sage-600">{t('parties.noDocuments')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                        <th className="py-1.5">{t('common.date')}</th>
                        <th className="py-1.5 text-right">{t('trade.total')}</th>
                        <th className="py-1.5 text-right">
                          {t(kind === 'client' ? 'trade.paid' : 'trade.paidPurchase')}
                        </th>
                        <th className="py-1.5 text-right">{t('trade.due')}</th>
                        <th className="py-1.5">{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDocs.map((doc) => (
                        <tr key={doc.id} className="border-b border-forest-50">
                          <td className="whitespace-nowrap py-1.5">{doc.date}</td>
                          <td className="py-1.5 text-right font-medium">{fmt(doc.total)}</td>
                          <td className="py-1.5 text-right">{fmt(doc.paid)}</td>
                          <td className={`py-1.5 text-right ${doc.due > 0 ? 'font-semibold text-amber-700' : ''}`}>{fmt(doc.due)}</td>
                          <td className="py-1.5">
                            {doc.due === 0 ? (
                              <Tag tone="green">{t('trade.statusPaid')}</Tag>
                            ) : doc.paid > 0 ? (
                              <Tag tone="amber">{t('trade.statusPartial')}</Tag>
                            ) : (
                              <Tag tone="red">{t('trade.statusCredit')}</Tag>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      <Modal title={form.id ? t('common.edit') : newLabel} open={open} onClose={() => setOpen(false)}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={t('common.name')}>
            <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} required />
          </Field>
          <Field label={t('parties.phone')}>
            <TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={40} />
          </Field>
          <Field label={t('parties.address')}>
            <TextInput value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={160} />
          </Field>
          <Field label={t('parties.notes')}>
            <TextArea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={300} />
          </Field>
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={btnPrimary}>
              {t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
