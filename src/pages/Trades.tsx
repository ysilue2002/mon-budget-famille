import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useBusinesses,
  useParties,
  usePrimaryCurrency,
  useProducts,
  usePurchases,
  useSales,
} from '@/hooks/useData';
import { createParty, createTrade, deleteTrade, updateParty, updateTrade } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { parseAmountInput, toMajor } from '@/core/money';
import { paidForMode, taxBreakdown, tradeDue, tradeStatus, type PaymentEntryMode } from '@/core/trade';
import { uuid } from '@/lib/id';
import { currentMonth, endOfMonth, todayISO } from '@/lib/date';
import type { PaymentMethod, TradeDocument } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  Page,
  SelectInput,
  StatCard,
  Tag,
  TextArea,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'wave', 'orange', 'mtn', 'moov', 'bank', 'other'];

/** Quantité lisible : 2 décimales maximum, séparateur local. */
function formatQty(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

interface LineForm {
  key: string;
  productId: string;
  label: string;
  qty: string;
  price: string;
}

interface TradeForm {
  id?: string;
  businessId: string;
  date: string;
  partyName: string;
  paid: string;
  paymentMethod: PaymentMethod;
  accountId: string;
  note: string;
  /** Taux de TVA saisi (pourcentage). */
  taxRate: string;
  /** Achats : coordonnées du fournisseur, enregistrées sur sa fiche. */
  partyPhone: string;
  partyAddress: string;
  /** Achats : comptant, à crédit ou en plusieurs versements. */
  paymentMode: PaymentEntryMode;
  lines: LineForm[];
}

function newLine(): LineForm {
  return { key: uuid(), productId: '', label: '', qty: '1', price: '' };
}

/**
 * Ventes et achats : documents à lignes de marchandises. Chaque document crée
 * une opération de journal (montant total, réglée seulement si tout est payé)
 * et déplace le stock (sortie pour une vente, entrée pour un achat). Le crédit
 * client/fournisseur se lit donc directement dans l'accueil de l'activité.
 */
export default function Trades({ kind }: { kind: 'sale' | 'purchase' }) {
  const { t, i18n } = useTranslation();
  const sales = useSales();
  const purchases = usePurchases();
  const businesses = useBusinesses();
  const accounts = useAccounts();
  const products = useProducts();
  const parties = useParties();
  const primaryCode = usePrimaryCurrency();
  const primary = primaryCode ?? 'XOF';

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TradeForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const documents = (kind === 'sale' ? sales : purchases) ?? [];
  const activeBusinesses = (businesses ?? []).filter((business) => !business.archived);
  const activeProducts = (products ?? []).filter((product) => !product.archived);
  const accountList = (accounts ?? []).filter((account) => !account.archived);
  const partyOptions = (parties ?? []).filter(
    (party) => !party.archived && party.kind === (kind === 'sale' ? 'client' : 'supplier'),
  );

  const fmt = (minor: number) => formatAmount(minor, primary, i18n.language);

  const month = currentMonth();
  const from = `${month}-01`;
  const to = endOfMonth(month);
  const monthDocuments = documents.filter((doc) => doc.date >= from && doc.date <= to);
  const monthTotal = monthDocuments.reduce((sum, doc) => sum + doc.total, 0);
  const monthPaid = monthDocuments.reduce((sum, doc) => sum + doc.paid, 0);
  const totalDue = documents.reduce((sum, doc) => sum + doc.due, 0);

  const parsedLines = useMemo(() => {
    if (!form) return [];
    return form.lines.map((line) => ({
      productId: line.productId || undefined,
      label: line.label || activeProducts.find((product) => product.id === line.productId)?.name || '',
      qty: Number(line.qty.replace(',', '.')) || 0,
      unitPrice: parseAmountInput(line.price, primary) ?? 0,
    }));
  }, [form, activeProducts, primary]);

  const tax = taxBreakdown(
    parsedLines.map((line) => ({ lineTotal: Math.round(line.qty * line.unitPrice) })),
    Number((form?.taxRate ?? '').replace(',', '.')) || 0,
  );
  const total = tax.total;
  const paidMinor = parseAmountInput(form?.paid ?? '', primary) ?? 0;
  // Ventes : montant reçu saisi. Achats : le mode de règlement décide — le
  // comptant solde, le crédit ne paie rien, les versements retiennent la
  // première somme (le reste se règle depuis la fiche fournisseur).
  const entryMode: PaymentEntryMode = kind === 'purchase' ? (form?.paymentMode ?? 'cash') : 'installments';
  const effectivePaid = paidForMode(entryMode, total, paidMinor);
  const due = tradeDue(total, effectivePaid);
  const status = tradeStatus(total, effectivePaid);

  const openForm = (document?: TradeDocument) => {
    const firstBusiness = activeBusinesses[0]?.id ?? '';
    const firstAccount = accountList[0]?.id ?? '';
    const savedParty = document?.partyId
      ? (parties ?? []).find((party) => party.id === document.partyId)
      : undefined;
    const savedMode: PaymentEntryMode =
      !document || document.paid >= document.total
        ? 'cash'
        : document.paid <= 0
          ? 'credit'
          : 'installments';
    if (document) {
      setForm({
        id: document.id,
        businessId: document.businessId,
        date: document.date,
        partyName: document.partyName ?? '',
        partyPhone: savedParty?.phone ?? '',
        partyAddress: savedParty?.address ?? '',
        paymentMode: savedMode,
        paid: String(toMajor(document.paid, primary)),
        paymentMethod: document.paymentMethod,
        accountId: document.accountId,
        note: document.note ?? '',
        taxRate: document.taxRate ? String(document.taxRate) : '',
        lines: document.lines.map((line) => ({
          key: line.id,
          productId: line.productId ?? '',
          label: line.label,
          qty: String(line.qty),
          price: String(toMajor(line.unitPrice, primary)),
        })),
      });
    } else {
      setForm({
        businessId: firstBusiness,
        date: todayISO(),
        partyName: '',
        partyPhone: '',
        partyAddress: '',
        paymentMode: 'cash',
        paid: '',
        paymentMethod: 'cash',
        accountId: firstAccount,
        note: '',
        taxRate: '',
        lines: [newLine()],
      });
    }
    setError(null);
    setOpen(true);
  };

  const patchLine = (key: string, patch: Partial<LineForm>) => {
    setForm((current) =>
      current ? { ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) } : current,
    );
  };

  const pickProduct = (key: string, productId: string) => {
    const product = activeProducts.find((row) => row.id === productId);
    if (!product) {
      patchLine(key, { productId, label: '' });
      return;
    }
    const price = kind === 'sale' ? product.sellPrice : product.buyPrice;
    patchLine(key, { productId, label: product.name, price: String(toMajor(price, primary)) });
  };

  /** Quantité de la marchandise qui restera en stock après cette ligne. */
  const remainingOf = (line: LineForm): { qty: number; unit: string } | null => {
    const product = activeProducts.find((row) => row.id === line.productId);
    if (!product) return null;
    const qty = Number(line.qty.replace(',', '.')) || 0;
    return {
      qty: kind === 'sale' ? product.stockQty - qty : product.stockQty + qty,
      unit: product.unit,
    };
  };

  const save = async () => {
    if (!form) return;
    const cleanLines = parsedLines.filter((line) => line.qty > 0 && (line.productId || line.label.trim()));
    if (!form.businessId) {
      setError(t('trade.noBusiness'));
      return;
    }
    if (cleanLines.length === 0) {
      setError(t('trade.linesRequired'));
      return;
    }
    if (!form.accountId) {
      setError(t('validation.noAccounts'));
      return;
    }
    const matchedParty = partyOptions.find(
      (party) => party.name.trim().toLowerCase() === form.partyName.trim().toLowerCase(),
    );
    // Achats : le fournisseur saisi devient une fiche, coordonnées comprises.
    let partyId = matchedParty?.id;
    if (kind === 'purchase') {
      const phone = form.partyPhone.trim();
      const address = form.partyAddress.trim();
      if (partyId) {
        if ((phone && phone !== matchedParty?.phone) || (address && address !== matchedParty?.address)) {
          await updateParty(partyId, {
            phone: phone || matchedParty?.phone || '',
            address: address || matchedParty?.address || '',
          });
        }
      } else if (form.partyName.trim()) {
        partyId = await createParty({ kind: 'supplier', name: form.partyName.trim(), phone, address });
      }
    }
    const input = {
      businessId: form.businessId,
      date: form.date,
      partyId,
      partyName: form.partyName,
      lines: cleanLines,
      paid: effectivePaid,
      paymentMethod: form.paymentMethod,
      accountId: form.accountId,
      note: form.note,
      taxRate: tax.rate,
    };
    if (form.id) await updateTrade(kind, form.id, input);
    else await createTrade(kind, input);
    setOpen(false);
    setForm(null);
  };

  const title = t(kind === 'sale' ? 'trade.salesTitle' : 'trade.purchasesTitle');
  const newLabel = t(kind === 'sale' ? 'trade.newSale' : 'trade.newPurchase');

  const statusTag = (document: TradeDocument) => {
    const value = tradeStatus(document.total, document.paid);
    if (value === 'paid') return <Tag tone="green">{t('trade.statusPaid')}</Tag>;
    if (value === 'partial') return <Tag tone="amber">{t('trade.statusPartial')}</Tag>;
    return <Tag tone="red">{t('trade.statusCredit')}</Tag>;
  };

  return (
    <Page
      title={title}
      actions={
        <button type="button" className={btnPrimary} onClick={() => openForm()} disabled={activeBusinesses.length === 0}>
          ＋ {newLabel}
        </button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('trade.totalMonth')} value={fmt(monthTotal)} hint={t('activity.thisMonth')} />
        <StatCard
          label={t(kind === 'sale' ? 'trade.received' : 'trade.receivedPurchase')}
          value={fmt(monthPaid)}
          hint={t('activity.thisMonth')}
        />
        <StatCard label={t('trade.unpaid')} value={fmt(totalDue)} valueClass={totalDue > 0 ? 'text-amber-600' : undefined} />
      </div>

      {activeBusinesses.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50/60">
          <p className="text-sm text-amber-900">{t('trade.noBusiness')}</p>
        </Card>
      ) : documents.length === 0 ? (
        <EmptyState
          label={t(kind === 'sale' ? 'trade.emptySales' : 'trade.emptyPurchases')}
          icon={kind === 'sale' ? '🛒' : '📥'}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1.5">{t('common.date')}</th>
                <th className="py-1.5">{t(kind === 'sale' ? 'trade.client' : 'trade.supplier')}</th>
                <th className="py-1.5 text-right">{t('trade.total')}</th>
                <th className="py-1.5 text-right">
                  {t(kind === 'sale' ? 'trade.paid' : 'trade.paidPurchase')}
                </th>
                <th className="py-1.5 text-right">{t('trade.due')}</th>
                <th className="py-1.5">{t('common.status')}</th>
                <th className="py-1.5 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-b border-forest-50">
                  <td className="whitespace-nowrap py-1.5">{document.date}</td>
                  <td className="py-1.5">
                    <div className="font-medium text-forest-950">{document.partyName || '—'}</div>
                    <div className="text-xs text-sage-500">
                      {document.lines.length} {t('trade.product').toLowerCase()}
                    </div>
                  </td>
                  <td className="py-1.5 text-right font-semibold">{fmt(document.total)}</td>
                  <td className="py-1.5 text-right">{fmt(document.paid)}</td>
                  <td className={`py-1.5 text-right ${document.due > 0 ? 'font-semibold text-amber-700' : ''}`}>
                    {fmt(document.due)}
                  </td>
                  <td className="py-1.5">{statusTag(document)}</td>
                  <td className="py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="rounded p-1 text-sm hover:bg-forest-50"
                        onClick={() => openForm(document)}
                        aria-label={t('common.edit')}
                      >
                        ✎
                      </button>
                      <ConfirmButton
                        label="🗑"
                        confirmLabel={t('trade.deleteConfirm')}
                        cancelLabel={t('common.cancel')}
                        onConfirm={() => void deleteTrade(kind, document.id)}
                        danger
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-2 text-xs text-sage-500">{t(kind === 'sale' ? 'trade.hintSales' : 'trade.hintPurchases')}</p>

      <Modal title={form?.id ? t('common.edit') : newLabel} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('common.date')}>
                <TextInput type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
              </Field>
              <Field label={t(kind === 'sale' ? 'trade.client' : 'trade.supplier')}>
                <TextInput
                  value={form.partyName}
                  onChange={(event) => setForm({ ...form, partyName: event.target.value })}
                  maxLength={80}
                  list="trade-parties"
                />
                <datalist id="trade-parties">
                  {partyOptions.map((party) => (
                    <option key={party.id} value={party.name} />
                  ))}
                </datalist>
              </Field>
            </div>

            {kind === 'purchase' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('trade.supplierPhone')}>
                    <TextInput
                      type="tel"
                      value={form.partyPhone}
                      onChange={(event) => setForm({ ...form, partyPhone: event.target.value })}
                      maxLength={30}
                    />
                  </Field>
                  <Field label={t('trade.supplierAddress')}>
                    <TextInput
                      value={form.partyAddress}
                      onChange={(event) => setForm({ ...form, partyAddress: event.target.value })}
                      maxLength={160}
                    />
                  </Field>
                </div>
                <p className="-mt-1 text-xs text-sage-500">{t('trade.supplierContactHint')}</p>
              </>
            )}

            {activeBusinesses.length > 1 && (
              <Field label={t('trade.business')}>
                <SelectInput
                  value={form.businessId}
                  onChange={(value) => setForm({ ...form, businessId: value })}
                  options={activeBusinesses.map((business) => ({ value: business.id, label: business.name }))}
                />
              </Field>
            )}

            <div className="rounded-lg border border-forest-100 bg-forest-50/40 p-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sage-600">{t('trade.lines')}</p>
              <div className="flex flex-col gap-2">
                {form.lines.map((line) => (
                  <div key={line.key} className="rounded-lg border border-forest-100 bg-white p-2">
                    <div className="flex flex-col gap-2">
                      <select
                        value={line.productId}
                        onChange={(event) => pickProduct(line.key, event.target.value)}
                        className="w-full rounded-lg border border-forest-200 bg-white px-2 py-1.5 text-sm"
                        aria-label={t('trade.product')}
                      >
                        <option value="">{t('trade.freeLine')}</option>
                        {activeProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.stockQty} {product.unit})
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-3 gap-2">
                        <TextInput
                          placeholder={t('trade.qty')}
                          aria-label={t('trade.qty')}
                          inputMode="decimal"
                          value={line.qty}
                          onChange={(event) => patchLine(line.key, { qty: event.target.value })}
                        />
                        <TextInput
                          placeholder={t('trade.unitPrice')}
                          aria-label={t('trade.unitPrice')}
                          inputMode="decimal"
                          value={line.price}
                          onChange={(event) => patchLine(line.key, { price: event.target.value })}
                        />
                        <div className="flex items-center justify-between gap-1 rounded-lg border border-forest-100 bg-forest-50 px-2 text-sm font-semibold text-forest-800">
                          <span className="truncate">
                            {fmt(Math.round((Number(line.qty.replace(',', '.')) || 0) * (parseAmountInput(line.price, primary) ?? 0)))}
                          </span>
                          <button
                            type="button"
                            className="rounded p-1 text-red-600 hover:bg-red-50"
                            onClick={() =>
                              setForm((current) =>
                                current
                                  ? {
                                      ...current,
                                      lines:
                                        current.lines.length > 1
                                          ? current.lines.filter((row) => row.key !== line.key)
                                          : [newLine()],
                                    }
                                  : current,
                              )
                            }
                            aria-label={t('common.delete')}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {(() => {
                        const remaining = remainingOf(line);
                        if (!remaining) return null;
                        const short = remaining.qty < 0;
                        return (
                          <p className={`mt-1 text-xs ${short ? 'font-semibold text-red-600' : 'text-sage-600'}`}>
                            {t('trade.stockLeft', { qty: formatQty(remaining.qty), unit: remaining.unit })}
                            {short ? ` — ${t('trade.stockShort')}` : ''}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={`${btnGhost} mt-2 w-full`}
                onClick={() => setForm({ ...form, lines: [...form.lines, newLine()] })}
              >
                ＋ {t('trade.addLine')}
              </button>
            </div>

            <Field label={t('documents.taxRate')}>
              <TextInput
                inputMode="decimal"
                value={form.taxRate}
                onChange={(event) => setForm({ ...form, taxRate: event.target.value })}
                placeholder="0"
              />
              <p className="mt-1 text-xs text-sage-500">{t('documents.taxRateHint')}</p>
            </Field>

            <div className="rounded-lg border border-forest-200 bg-white p-3 text-sm">
              {tax.rate > 0 && (
                <>
                  <div className="flex justify-between text-sage-600">
                    <span>{t('documents.subtotal')}</span>
                    <span>{fmt(tax.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sage-600">
                    <span>{t('documents.tax', { rate: tax.rate })}</span>
                    <span>{fmt(tax.tax)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span>{tax.rate > 0 ? t('documents.totalTtc') : t('trade.total')}</span>
                <span className="font-bold">{fmt(total)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sage-600">
                <span>{t(kind === 'sale' ? 'trade.paid' : 'trade.paidPurchase')}</span>
                <span>{fmt(effectivePaid)}</span>
              </div>
              <div className="mt-1 flex justify-between font-semibold text-amber-700">
                <span>{t('trade.due')}</span>
                <span>{fmt(due)}</span>
              </div>
            </div>

            {kind === 'purchase' && (
              <Field label={t('trade.paymentMode')}>
                <div className="flex flex-wrap gap-1">
                  {(['cash', 'credit', 'installments'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={form.paymentMode === mode}
                      onClick={() => setForm({ ...form, paymentMode: mode })}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        form.paymentMode === mode
                          ? 'border-forest-600 bg-forest-600 text-white'
                          : 'border-forest-200 bg-white text-forest-800 hover:bg-forest-50'
                      }`}
                    >
                      {t(`trade.paymentModes.${mode}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-sage-500">
                  {form.paymentMode === 'cash'
                    ? t('trade.paymentModeHintCash')
                    : form.paymentMode === 'credit'
                      ? t('trade.paymentModeHintCredit')
                      : t('trade.paymentModeHintInstallments')}
                </p>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              {(kind === 'sale' || form.paymentMode === 'installments') && (
                <Field label={t(kind === 'sale' ? 'trade.paid' : 'trade.paidPurchase')}>
                  <TextInput
                    inputMode="decimal"
                    value={form.paid}
                    onChange={(event) => setForm({ ...form, paid: event.target.value })}
                    placeholder="0"
                  />
                </Field>
              )}
              <Field label={t('trade.paymentMethod')}>
                <SelectInput
                  value={form.paymentMethod}
                  onChange={(value) => setForm({ ...form, paymentMethod: value as PaymentMethod })}
                  options={PAYMENT_METHODS.map((method) => ({
                    value: method,
                    label: t(`trade.paymentMethods.${method}`),
                  }))}
                />
              </Field>
            </div>

            <Field label={t('trade.account')}>
              <SelectInput
                value={form.accountId}
                onChange={(value) => setForm({ ...form, accountId: value })}
                options={accountList.map((account) => ({ value: account.id, label: account.name }))}
              />
            </Field>

            <Field label={t('trade.note')}>
              <TextArea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={300} />
            </Field>

            <p className="text-xs text-sage-600">
              {status === 'paid' ? t('trade.statusPaid') : status === 'partial' ? t('trade.statusPartial') : t('trade.statusCredit')}
            </p>
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
        )}
      </Modal>
    </Page>
  );
}
