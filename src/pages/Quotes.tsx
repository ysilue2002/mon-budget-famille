import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useBusinesses,
  useParties,
  usePrimaryCurrency,
  useProducts,
  useQuotes,
} from '@/hooks/useData';
import { convertQuoteToSale, createQuote, deleteQuote, setQuoteStatus, updateQuote } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { parseAmountInput, toMajor } from '@/core/money';
import { QUOTE_STATUS_KEY, quoteCanConvert, quoteIsEditable } from '@/core/documents';
import { downloadPdf, pdfFileName, pdfSupportsLanguage, printDocument } from '@/core/pdf';
import { lineTotal, taxBreakdown } from '@/core/trade';
import { uuid } from '@/lib/id';
import { todayISO } from '@/lib/date';
import DocumentSheet from '@/components/DocumentSheet';
import type { PaymentMethod, Quote } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
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
const STATUSES: Quote['status'][] = ['draft', 'sent', 'accepted', 'refused'];

type Translator = (key: string, options?: Record<string, unknown>) => string;

/**
 * Lignes de totaux d'un devis : hors taxe, TVA (si un taux est défini) et
 * total TTC. À 0 %, une seule ligne « Total », comme avant.
 */
function quoteTotals(
  quote: Pick<Quote, 'lines' | 'taxRate' | 'total'>,
  t: Translator,
  fmt: (minor: number) => string,
): [string, string][] {
  const tax = taxBreakdown(quote.lines, quote.taxRate);
  if (tax.rate === 0) return [[t('documents.total'), fmt(quote.total)]];
  return [
    [t('documents.subtotal'), fmt(tax.subtotal)],
    [t('documents.tax', { rate: tax.rate }), fmt(tax.tax)],
    [t('documents.totalTtc'), fmt(quote.total)],
  ];
}

interface LineForm {
  key: string;
  productId: string;
  label: string;
  qty: string;
  price: string;
}

interface QuoteForm {
  id?: string;
  businessId: string;
  date: string;
  validUntil: string;
  partyName: string;
  status: Quote['status'];
  note: string;
  /** Taux de TVA saisi (pourcentage, texte libre). */
  taxRate: string;
  lines: LineForm[];
}

function newLine(): LineForm {
  return { key: uuid(), productId: '', label: '', qty: '1', price: '' };
}

function statusTone(status: Quote['status']): 'green' | 'amber' | 'red' | 'sage' {
  if (status === 'accepted' || status === 'converted') return 'green';
  if (status === 'sent') return 'amber';
  if (status === 'refused') return 'red';
  return 'sage';
}

/**
 * Devis : proposition de prix pour un client, sans effet sur les ventes ni sur
 * le stock. Un devis accepté se transforme en vente en un clic ; c'est cette
 * vente, et elle seule, qui entre dans les comptes.
 */
export default function Quotes() {
  const { t, i18n } = useTranslation();
  const quotes = useQuotes();
  const businesses = useBusinesses();
  const parties = useParties();
  const products = useProducts();
  const accounts = useAccounts();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<QuoteForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [convertPaid, setConvertPaid] = useState(0);
  const [convertMethod, setConvertMethod] = useState<PaymentMethod>('cash');
  const [convertAccount, setConvertAccount] = useState('');

  const rows = quotes ?? [];
  const activeBusinesses = (businesses ?? []).filter((business) => !business.archived);
  const activeProducts = (products ?? []).filter((product) => !product.archived);
  const accountList = (accounts ?? []).filter((account) => !account.archived);
  const clients = (parties ?? []).filter((party) => party.kind === 'client' && !party.archived);
  const business = activeBusinesses[0] ?? null;
  const lang = i18n.language;
  const fmt = (minor: number) => formatAmount(minor, primary, lang);

  const pending = rows.filter((quote) => quote.status === 'sent' || quote.status === 'draft');
  const acceptedTotal = rows.filter((quote) => quote.status === 'accepted').reduce((sum, quote) => sum + quote.total, 0);
  const convertedCount = rows.filter((quote) => quote.status === 'converted').length;

  const parsedLines = useMemo(() => {
    if (!form) return [];
    return form.lines.map((line) => ({
      productId: line.productId || undefined,
      label: line.label || activeProducts.find((product) => product.id === line.productId)?.name || '',
      qty: Number(line.qty.replace(',', '.')) || 0,
      unitPrice: parseAmountInput(line.price, primary) ?? 0,
    }));
  }, [form, activeProducts, primary]);

  const formTax = taxBreakdown(
    parsedLines.map((line) => ({ lineTotal: lineTotal(line.qty, line.unitPrice) })),
    Number((form?.taxRate ?? '').replace(',', '.')) || 0,
  );
  const total = formTax.total;
  const preview = rows.find((quote) => quote.id === previewId) ?? null;
  const converting = rows.find((quote) => quote.id === convertId) ?? null;

  const openCreate = () => {
    if (!business) {
      setError(t('quotes.noBusiness'));
      return;
    }
    setForm({
      businessId: business.id,
      date: todayISO(),
      validUntil: '',
      partyName: '',
      status: 'draft',
      note: '',
      taxRate: '',
      lines: [newLine()],
    });
    setError(null);
    setFlash(null);
    setOpen(true);
  };

  const openEdit = (quote: Quote) => {
    setForm({
      id: quote.id,
      businessId: quote.businessId,
      date: quote.date,
      validUntil: quote.validUntil ?? '',
      partyName: quote.partyName ?? '',
      status: quote.status,
      note: quote.note ?? '',
      taxRate: quote.taxRate ? String(quote.taxRate) : '',
      lines: quote.lines.map((line) => ({
        key: line.id,
        productId: line.productId ?? '',
        label: line.label,
        qty: String(line.qty),
        price: String(toMajor(line.unitPrice, primary)),
      })),
    });
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
    patchLine(key, { productId, label: product.name, price: String(toMajor(product.sellPrice, primary)) });
  };

  const save = async () => {
    if (!form) return;
    const cleanLines = parsedLines.filter((line) => line.qty > 0 && (line.productId || line.label.trim()));
    if (!form.businessId) {
      setError(t('quotes.noBusiness'));
      return;
    }
    if (cleanLines.length === 0) {
      setError(t('quotes.linesRequired'));
      return;
    }
    const matched = clients.find((party) => party.name.trim().toLowerCase() === form.partyName.trim().toLowerCase());
    const input = {
      businessId: form.businessId,
      date: form.date,
      validUntil: form.validUntil || undefined,
      partyId: matched?.id,
      partyName: form.partyName,
      lines: cleanLines,
      status: form.status,
      note: form.note,
      taxRate: formTax.rate,
    };
    if (form.id) await updateQuote(form.id, input);
    else await createQuote(input);
    setOpen(false);
    setForm(null);
    setFlash(t('quotes.saved'));
  };

  const startConvert = (quote: Quote) => {
    setConvertId(quote.id);
    setConvertPaid(0);
    setConvertMethod('cash');
    setConvertAccount(accountList[0]?.id ?? '');
    setError(null);
  };

  const doConvert = async () => {
    if (!converting) return;
    if (!convertAccount) {
      setError(t('validation.noAccounts'));
      return;
    }
    try {
      await convertQuoteToSale(converting.id, {
        accountId: convertAccount,
        paymentMethod: convertMethod,
        paid: convertPaid,
      });
      setConvertId(null);
      setFlash(t('quotes.converted'));
    } catch (err) {
      setError(err instanceof Error && err.message === 'quote-not-convertible' ? t('quotes.locked') : String(err));
    }
  };

  const exportPdf = (quote: Quote) => {
    if (!pdfSupportsLanguage(lang)) {
      setPreviewId(quote.id);
      setFlash(t('documents.arabicUsesPrint'));
      return;
    }
    downloadPdf({
      fileName: pdfFileName('devis', quote.number),
      title: t('quotes.title'),
      business,
      reference: quote.number,
      meta: [
        [t('documents.date'), quote.date],
        [t('quotes.validUntil'), quote.validUntil ?? '—'],
        [t('quotes.client'), quote.partyName ?? '—'],
      ],
      party: {
        label: t('quotes.client'),
        name: quote.partyName,
        address: (parties ?? []).find((party) => party.id === quote.partyId)?.address,
        phone: (parties ?? []).find((party) => party.id === quote.partyId)?.phone,
      },
      head: [t('documents.designation'), t('documents.qty'), t('documents.unitPriceHt'), t('documents.lineTotalHt')],
      body: quote.lines.map((line) => [line.label, String(line.qty), fmt(line.unitPrice), fmt(line.lineTotal)]),
      totals: quoteTotals(quote, t, fmt),
      footer: t('documents.footer'),
    });
  };

  return (
    <Page
      title={t('quotes.title')}
      actions={
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={openCreate}>
            ＋ {t('quotes.new')}
          </button>
        </div>
      }
    >
      <div className="no-print mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('quotes.pending')} value={String(pending.length)} />
        <StatCard label={t('quotes.acceptedTotal')} value={fmt(acceptedTotal)} />
        <StatCard label={t('quotes.convertedCount')} value={String(convertedCount)} />
      </div>

      {flash && <p className="no-print mb-3 text-sm font-medium text-forest-700">✓ {flash}</p>}
      {error && !open && <p className="no-print mb-3 text-sm font-semibold text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <Card>
          <EmptyState label={t('quotes.empty')} icon="🧾" />
          <p className="mt-2 text-center text-xs text-sage-600">{t('quotes.emptyHint')}</p>
        </Card>
      ) : (
        <Card className="no-print overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1.5 pe-2">{t('quotes.number')}</th>
                <th className="py-1.5 pe-2">{t('documents.date')}</th>
                <th className="py-1.5 pe-2">{t('quotes.client')}</th>
                <th className="py-1.5 pe-2 text-right">{t('documents.total')}</th>
                <th className="py-1.5 pe-2">{t('quotes.status')}</th>
                <th className="py-1.5 pe-2 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => (
                <tr key={quote.id} className="border-b border-forest-50">
                  <td className="whitespace-nowrap py-1.5 font-medium text-forest-950">{quote.number}</td>
                  <td className="whitespace-nowrap py-1.5">{quote.date}</td>
                  <td className="py-1.5 pe-2">{quote.partyName || '—'}</td>
                  <td className="py-1.5 pe-2 text-right font-semibold">{fmt(quote.total)}</td>
                  <td className="py-1.5 pe-2">
                    <Tag tone={statusTone(quote.status)}>{t(QUOTE_STATUS_KEY[quote.status])}</Tag>
                  </td>
                  <td className="py-1.5 pe-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => setPreviewId(quote.id)} aria-label={t('documents.preview')}>
                        👁
                      </button>
                      <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => exportPdf(quote)} aria-label={t('documents.pdf')}>
                        ⬇
                      </button>
                      {quoteIsEditable(quote) && (
                        <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => openEdit(quote)} aria-label={t('common.edit')}>
                          ✎
                        </button>
                      )}
                      {quoteCanConvert(quote) && (
                        <button type="button" className={btnGhost} onClick={() => startConvert(quote)}>
                          ⇄ {t('quotes.convert')}
                        </button>
                      )}
                      {quote.status === 'draft' && (
                        <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => void setQuoteStatus(quote.id, 'sent')} aria-label={t('quotes.markSent')}>
                          📤
                        </button>
                      )}
                      <ConfirmButton
                        label="🗑"
                        confirmLabel={t('quotes.deleteConfirm')}
                        cancelLabel={t('common.cancel')}
                        onConfirm={() => void deleteQuote(quote.id)}
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
            title={t('quotes.title')}
            number={preview.number}
            date={preview.date}
            extra={preview.validUntil ? [t('quotes.validUntil'), preview.validUntil] : undefined}
            business={activeBusinesses.find((row) => row.id === preview.businessId) ?? business}
            partyLabel={t('quotes.client')}
            partyName={preview.partyName}
            party={(parties ?? []).find(
              (party) => party.id === preview.partyId || (!preview.partyId && party.name === preview.partyName),
            )}
            lines={preview.lines}
            totals={quoteTotals(preview, t, fmt)}
            note={preview.note}
            statusLabel={t(QUOTE_STATUS_KEY[preview.status])}
            footer={t('documents.footer')}
            lang={lang}
            currency={primary}
          />
        </div>
      )}

      <p className="no-print mt-2 text-xs text-sage-500">{t('quotes.hint')}</p>

      <Modal title={form?.id ? t('common.edit') : t('quotes.new')} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('documents.date')}>
                <TextInput type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
              </Field>
              <Field label={t('quotes.validUntil')}>
                <TextInput type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} />
              </Field>
            </div>

            <Field label={t('quotes.client')}>
              <TextInput
                value={form.partyName}
                onChange={(event) => setForm({ ...form, partyName: event.target.value })}
                list="quote-clients"
                maxLength={80}
              />
              <datalist id="quote-clients">
                {clients.map((party) => (
                  <option key={party.id} value={party.name} />
                ))}
              </datalist>
            </Field>

            <div className="rounded-lg border border-forest-100 bg-forest-50/40 p-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sage-600">{t('quotes.lines')}</p>
              <div className="flex flex-col gap-2">
                {form.lines.map((line) => (
                  <div key={line.key} className="rounded-lg border border-forest-100 bg-white p-2">
                    <select
                      value={line.productId}
                      onChange={(event) => pickProduct(line.key, event.target.value)}
                      className="w-full rounded-lg border border-forest-200 bg-white px-2 py-1.5 text-sm"
                      aria-label={t('quotes.product')}
                    >
                      <option value="">{t('quotes.freeLine')}</option>
                      {activeProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <TextInput
                        placeholder={t('documents.qty')}
                        aria-label={t('documents.qty')}
                        inputMode="decimal"
                        value={line.qty}
                        onChange={(event) => patchLine(line.key, { qty: event.target.value })}
                      />
                      <TextInput
                        placeholder={t('documents.unitPrice')}
                        aria-label={t('documents.unitPrice')}
                        inputMode="decimal"
                        value={line.price}
                        onChange={(event) => patchLine(line.key, { price: event.target.value })}
                      />
                      <div className="flex items-center justify-between gap-1 rounded-lg border border-forest-100 bg-forest-50 px-2 text-sm font-semibold text-forest-800">
                        <span className="truncate">
                          {fmt(
                            lineTotal(
                              Number(line.qty.replace(',', '.')) || 0,
                              parseAmountInput(line.price, primary) ?? 0,
                            ),
                          )}
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
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={`${btnGhost} mt-2 w-full`}
                onClick={() => setForm({ ...form, lines: [...form.lines, newLine()] })}
              >
                ＋ {t('quotes.addLine')}
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
              {formTax.rate > 0 && (
                <>
                  <div className="flex justify-between text-sage-600">
                    <span>{t('documents.subtotal')}</span>
                    <span>{fmt(formTax.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sage-600">
                    <span>{t('documents.tax', { rate: formTax.rate })}</span>
                    <span>{fmt(formTax.tax)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-bold">
                <span>{formTax.rate > 0 ? t('documents.totalTtc') : t('documents.total')}</span>
                <span>{fmt(total)}</span>
              </div>
            </div>

            <Field label={t('quotes.status')}>
              <SelectInput
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value as Quote['status'] })}
                options={STATUSES.map((status) => ({ value: status, label: t(QUOTE_STATUS_KEY[status]) }))}
              />
            </Field>

            <Field label={t('quotes.note')}>
              <TextArea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={300} />
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
        )}
      </Modal>

      <Modal title={t('quotes.convertTitle')} open={Boolean(converting)} onClose={() => setConvertId(null)}>
        {converting && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void doConvert();
            }}
          >
            <p className="text-sm text-sage-700">{t('quotes.convertHint', { number: converting.number })}</p>
            <MoneyInput
              label={t('quotes.alreadyPaid')}
              amountMinor={convertPaid}
              currency={primary}
              onMinor={(minor) => setConvertPaid(minor)}
            />
            <Field label={t('quotes.method')}>
              <SelectInput
                value={convertMethod}
                onChange={(value) => setConvertMethod(value as PaymentMethod)}
                options={PAYMENT_METHODS.map((method) => ({ value: method, label: t(`trade.paymentMethods.${method}`) }))}
              />
            </Field>
            <Field label={t('quotes.account')}>
              <SelectInput
                value={convertAccount}
                onChange={setConvertAccount}
                options={accountList.map((account) => ({ value: account.id, label: account.name }))}
              />
            </Field>
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setConvertId(null)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className={btnPrimary}>
                {t('quotes.convertAction')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Page>
  );
}
