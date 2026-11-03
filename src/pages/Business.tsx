import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useBusinesses, useCategories, useFamily, useTransactions } from '@/hooks/useData';
import { buildBusinessStatement, businessTransactions } from '@/core/business';
import { archiveBusiness, createBusiness, setTransactionSettled, updateBusiness } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { currentMonth, endOfMonth, todayISO } from '@/lib/date';
import type { Business, CurrencyCode, Transaction } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  Page,
  Tag,
  TextArea,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

type Mode = 'month' | 'year';

const EMPTY_FORM = { name: '', activity: '', taxId: '', notes: '' };

/**
 * Activité professionnelle : suivi des recettes et charges rattachées à une
 * activité, compte de résultat, bilan simplifié, trésorerie et journal.
 */
export default function BusinessPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const businesses = useBusinesses();
  const transactions = useTransactions();
  const categories = useCategories();
  const family = useFamily();

  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [selectedId, setSelectedId] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const primary: CurrencyCode = family?.primaryCurrency ?? 'XOF';
  const active = (businesses ?? []).filter((business) => !business.archived);
  const selected = active.find((business) => business.id === selectedId) ?? active[0] ?? null;
  const selectedKey = selected?.id ?? '';

  const safeYear = /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
  const from = mode === 'month' ? `${month}-01` : `${safeYear}-01-01`;
  const to = mode === 'month' ? endOfMonth(month) : `${safeYear}-12-31`;
  const periodLabel =
    mode === 'month'
      ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString(
          lang === 'fr' ? 'fr-FR' : 'en-US',
          { month: 'long', year: 'numeric' },
        )
      : safeYear;

  const statement = useMemo(
    () =>
      selectedKey
        ? buildBusinessStatement({
            businessId: selectedKey,
            transactions: transactions ?? [],
            categories: categories ?? [],
            from,
            to,
            lang,
          })
        : null,
    [selectedKey, transactions, categories, from, to, lang],
  );

  const journal = useMemo(() => {
    if (!selectedKey) return [];
    return businessTransactions(transactions ?? [], selectedKey)
      .filter((tx) => tx.date >= from && tx.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedKey, transactions, from, to]);

  const fmt = (value: number) => formatAmount(value, primary, lang);
  const generatedAt = todayISO();
  const categoryOf = (tx: Transaction) => {
    const category = (categories ?? []).find((row) => row.id === tx.categoryId);
    if (!category) return t('business.uncategorised');
    return lang === 'fr' ? category.nameFr : category.nameEn;
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditing(selected);
    setForm({
      name: selected.name,
      activity: selected.activity,
      taxId: selected.taxId ?? '',
      notes: selected.notes ?? '',
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError(t('business.nameRequired'));
      return;
    }
    if (editing) {
      await updateBusiness(editing.id, form);
    } else {
      const id = await createBusiness(form);
      setSelectedId(id);
    }
    setOpen(false);
    setEditing(null);
  };

  const exportPdf = () => {
    if (!selected || !statement) return;
    const doc = new jsPDF();
    doc.setFontSize(15);
    doc.text(`${t('business.financialStatements')} — ${selected.name}`, 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(90, 100, 90);
    doc.text(`${t('business.period')} : ${from} → ${to}`, 14, 25);
    doc.text(
      `${t('business.activity')} : ${selected.activity || '—'}${
        selected.taxId ? ` · ${t('business.taxId')} : ${selected.taxId}` : ''
      }`,
      14,
      30,
    );
    doc.text(`${t('business.currency')} : ${primary} · ${t('business.generatedAt', { date: generatedAt })}`, 14, 35);
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: 42,
      body: [
        [t('business.revenue'), fmt(statement.revenue)],
        [t('business.expenses'), fmt(statement.expense)],
        [t('business.result'), fmt(statement.result)],
        [t('business.margin'), `${statement.margin.toFixed(1)} %`],
      ],
      theme: 'plain',
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [[t('business.incomeStatement'), '']],
      body: [
        [t('business.revenueByCategory'), ''],
        ...statement.revenueByCategory.map((line) => [line.label, fmt(line.total)]),
        [t('business.revenueTotal'), fmt(statement.revenue)],
        [t('business.expenseByCategory'), ''],
        ...statement.expenseByCategory.map((line) => [line.label, fmt(line.total)]),
        [t('business.expenseTotal'), fmt(statement.expense)],
        [t('business.result'), fmt(statement.result)],
      ],
      theme: 'grid',
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' } },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [[t('business.assets'), t('business.amount'), t('business.liabilities'), t('business.amount')]],
      body: [
        [t('business.cash'), fmt(statement.closingCash), t('business.payables'), fmt(statement.payables)],
        [t('business.receivables'), fmt(statement.receivables), t('business.equity'), fmt(statement.equity)],
        [t('business.totalAssets'), fmt(statement.totalAssets), t('business.totalLiabilities'), fmt(statement.totalLiabilities)],
      ],
      theme: 'grid',
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
      head: [[t('business.cashFlow'), t('business.amount')]],
      body: [
        [t('business.openingCash'), fmt(statement.openingCash)],
        [t('business.cashIn'), fmt(statement.cashIn)],
        [t('business.cashOut'), `− ${fmt(statement.cashOut)}`],
        [t('business.cashChange'), fmt(statement.cashChange)],
        [t('business.closingCash'), fmt(statement.closingCash)],
      ],
      theme: 'grid',
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' } },
    });

    if (journal.length > 0) {
      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6,
        head: [[t('common.date'), t('common.category'), t('common.note'), t('common.amount'), t('business.status')]],
        body: journal.map((tx) => [
          tx.date,
          categoryOf(tx),
          tx.note ?? '',
          `${tx.type === 'income' ? '+' : '−'}${fmt(tx.amountInPrimary)}`,
          tx.settled === false ? t('business.pending') : t('business.settled'),
        ]),
        theme: 'grid',
        styles: { fontSize: 8 },
        columnStyles: { 3: { halign: 'right' } },
      });
    }

    const slug = selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'activite';
    doc.save(`activite_${slug}_${from}_${to}.pdf`);
  };

  if (businesses === undefined || transactions === undefined || categories === undefined) {
    return (
      <Page title={t('business.title')}>
        <EmptyState label={t('common.loading')} />
      </Page>
    );
  }

  return (
    <Page
      title={t('business.title')}
      actions={
        active.length > 0 ? (
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" className={btnGhost} onClick={exportPdf}>
              ⤓ PDF
            </button>
            <button type="button" className={btnPrimary} onClick={() => window.print()}>
              🖨 {t('business.print')}
            </button>
          </div>
        ) : undefined
      }
    >
      {active.length === 0 ? (
        <Card>
          <EmptyState label={t('business.empty')} icon="💼" />
          <p className="mt-3 text-center text-xs text-sage-600">{t('business.emptyHint')}</p>
          <div className="mt-4 flex justify-center">
            <button type="button" className={btnPrimary} onClick={openCreate}>
              ＋ {t('business.new')}
            </button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="no-print mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-1">
                {active.map((business) => (
                  <button
                    key={business.id}
                    type="button"
                    onClick={() => setSelectedId(business.id)}
                    aria-pressed={business.id === selectedKey}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      business.id === selectedKey
                        ? 'border-forest-600 bg-forest-600 text-white'
                        : 'border-forest-200 bg-white text-forest-800 hover:bg-forest-50'
                    }`}
                  >
                    {business.name}
                  </button>
                ))}
              </div>
              <button type="button" className={btnGhost} onClick={openCreate}>
                ＋ {t('business.new')}
              </button>
              <div className="ml-auto flex flex-wrap items-end gap-3">
                <div className="flex overflow-hidden rounded-lg border border-forest-200">
                  {(['month', 'year'] as Mode[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      aria-pressed={mode === value}
                      className={`px-3 py-2 text-sm font-medium ${
                        mode === value ? 'bg-forest-600 text-white' : 'bg-white text-forest-800 hover:bg-forest-50'
                      }`}
                    >
                      {value === 'month' ? t('business.monthlyShort') : t('business.annualShort')}
                    </button>
                  ))}
                </div>
                {mode === 'month' ? (
                  <Field label={t('business.month')}>
                    <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                  </Field>
                ) : (
                  <Field label={t('business.year')}>
                    <TextInput
                      type="number"
                      min={2000}
                      max={2100}
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-28"
                    />
                  </Field>
                )}
              </div>
            </div>
          </Card>

          {selected && statement && (
            <article className="print-sheet rounded-xl border border-forest-100 bg-white p-5 shadow-sm sm:p-8">
              <header className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-forest-200 pb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">
                    {t('business.financialStatements')}
                  </p>
                  <h2 className="text-xl font-bold text-forest-950">{selected.name}</h2>
                  <p className="text-xs text-sage-600">
                    {selected.activity || '—'}
                    {selected.taxId ? ` · ${t('business.taxId')} : ${selected.taxId}` : ''}
                  </p>
                  <p className="text-xs text-sage-600">
                    {t('business.period')} : {from} → {to} · {periodLabel}
                  </p>
                </div>
                <div className="text-right text-xs text-sage-600">
                  <p>
                    {t('business.currency')} : {primary}
                  </p>
                  <p>{t('business.generatedAt', { date: generatedAt })}</p>
                  <div className="no-print mt-2 flex justify-end gap-2">
                    <button type="button" className={btnGhost} onClick={openEdit}>
                      {t('business.edit')}
                    </button>
                    <ConfirmButton
                      label={t('business.archive')}
                      confirmLabel={t('business.archiveConfirm')}
                      cancelLabel={t('common.cancel')}
                      onConfirm={() => void archiveBusiness(selected.id)}
                      danger
                    />
                  </div>
                </div>
              </header>

              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-forest-900">
                {t('business.incomeStatement')}
              </h3>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: t('business.revenue'), value: fmt(statement.revenue) },
                  { label: t('business.expenses'), value: fmt(statement.expense) },
                  {
                    label: t('business.result'),
                    value: fmt(statement.result),
                    tone: statement.result >= 0 ? 'text-forest-700' : 'text-red-600',
                  },
                  { label: t('business.margin'), value: `${statement.margin.toFixed(1)} %` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-forest-100 bg-forest-50/40 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-sage-600">{item.label}</p>
                    <p className={`text-sm font-bold ${item.tone ?? 'text-forest-900'}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                      <th className="py-1">{t('business.revenueByCategory')}</th>
                      <th className="py-1 text-right">{t('common.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.revenueByCategory.length === 0 ? (
                      <tr>
                        <td className="py-1.5 text-xs text-sage-500" colSpan={2}>
                          {t('business.noRevenue')}
                        </td>
                      </tr>
                    ) : (
                      statement.revenueByCategory.map((line) => (
                        <tr key={line.id} className="border-b border-forest-50">
                          <td className="py-1.5">{line.label}</td>
                          <td className="py-1.5 text-right font-medium">{fmt(line.total)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="border-t-2 border-forest-300">
                      <td className="py-1.5 font-semibold">{t('business.revenueTotal')}</td>
                      <td className="py-1.5 text-right font-bold">{fmt(statement.revenue)}</td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                      <th className="py-1">{t('business.expenseByCategory')}</th>
                      <th className="py-1 text-right">{t('common.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.expenseByCategory.length === 0 ? (
                      <tr>
                        <td className="py-1.5 text-xs text-sage-500" colSpan={2}>
                          {t('business.noExpense')}
                        </td>
                      </tr>
                    ) : (
                      statement.expenseByCategory.map((line) => (
                        <tr key={line.id} className="border-b border-forest-50">
                          <td className="py-1.5">{line.label}</td>
                          <td className="py-1.5 text-right font-medium">{fmt(line.total)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="border-t-2 border-forest-300">
                      <td className="py-1.5 font-semibold">{t('business.expenseTotal')}</td>
                      <td className="py-1.5 text-right font-bold">{fmt(statement.expense)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-forest-900">
                {t('business.balanceSheet')}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                    <th className="py-1">{t('business.assets')}</th>
                    <th className="py-1 text-right">{t('common.amount')}</th>
                    <th className="py-1 pl-4">{t('business.liabilities')}</th>
                    <th className="py-1 text-right">{t('common.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-forest-50">
                    <td className="py-1.5">{t('business.cash')}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(statement.closingCash)}</td>
                    <td className="py-1.5 pl-4">{t('business.payables')}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(statement.payables)}</td>
                  </tr>
                  <tr className="border-b border-forest-50">
                    <td className="py-1.5">{t('business.receivables')}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(statement.receivables)}</td>
                    <td className="py-1.5 pl-4">{t('business.equity')}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(statement.equity)}</td>
                  </tr>
                  <tr className="border-t-2 border-forest-300">
                    <td className="py-1.5 font-semibold">{t('business.totalAssets')}</td>
                    <td className="py-1.5 text-right font-bold">{fmt(statement.totalAssets)}</td>
                    <td className="py-1.5 pl-4 font-semibold">{t('business.totalLiabilities')}</td>
                    <td className="py-1.5 text-right font-bold">{fmt(statement.totalLiabilities)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-sage-500">
                {t('business.balanceHint')} {statement.totalAssets === statement.totalLiabilities ? '✓' : ''}
              </p>

              <h3 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-forest-900">
                {t('business.cashFlow')}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-forest-50">
                    <td className="py-1.5">{t('business.openingCash')}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(statement.openingCash)}</td>
                  </tr>
                  <tr className="border-b border-forest-50">
                    <td className="py-1.5">{t('business.cashIn')}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(statement.cashIn)}</td>
                  </tr>
                  <tr className="border-b border-forest-50">
                    <td className="py-1.5">{t('business.cashOut')}</td>
                    <td className="py-1.5 text-right font-medium">− {fmt(statement.cashOut)}</td>
                  </tr>
                  <tr className="border-b border-forest-100">
                    <td className="py-1.5">{t('business.cashChange')}</td>
                    <td className={`py-1.5 text-right font-semibold ${statement.cashChange >= 0 ? 'text-forest-700' : 'text-red-600'}`}>
                      {fmt(statement.cashChange)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-forest-300">
                    <td className="py-1.5 font-semibold">{t('business.closingCash')}</td>
                    <td className="py-1.5 text-right font-bold">{fmt(statement.closingCash)}</td>
                  </tr>
                </tbody>
              </table>

              <h3 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-forest-900">
                {t('business.journal')}
                <span className="ml-2 text-[11px] font-normal normal-case tracking-normal text-sage-600">
                  {t('business.operations', { count: journal.length })}
                </span>
              </h3>
              {journal.length === 0 ? (
                <p className="text-xs text-sage-600">{t('business.noOperations')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                      <th className="py-1">{t('common.date')}</th>
                      <th className="py-1">{t('common.category')}</th>
                      <th className="py-1">{t('common.note')}</th>
                      <th className="py-1 text-right">{t('common.amount')}</th>
                      <th className="py-1 text-right">{t('business.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.map((tx) => (
                      <tr key={tx.id} className="border-b border-forest-50">
                        <td className="whitespace-nowrap py-1.5">{tx.date}</td>
                        <td className="py-1.5">{categoryOf(tx)}</td>
                        <td className="max-w-[14rem] truncate py-1.5">{tx.note ?? '—'}</td>
                        <td className={`whitespace-nowrap py-1.5 text-right font-medium ${tx.type === 'income' ? 'text-forest-700' : 'text-red-600'}`}>
                          {tx.type === 'income' ? '+' : '−'} {fmt(tx.amountInPrimary)}
                        </td>
                        <td className="py-1.5 text-right">
                          <label className="inline-flex items-center gap-1 text-[11px] text-sage-600">
                            <input
                              type="checkbox"
                              className="no-print h-3.5 w-3.5 rounded border-forest-300"
                              checked={tx.settled !== false}
                              onChange={(e) => void setTransactionSettled(tx.id, e.target.checked)}
                              aria-label={t('business.settled')}
                            />
                            {tx.settled === false ? (
                              <Tag tone="amber">{t('business.pending')}</Tag>
                            ) : (
                              <span className="text-forest-700">{t('business.settled')}</span>
                            )}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="no-print mt-2 text-[11px] text-sage-500">{t('business.settleHint')}</p>
              <p className="no-print mt-1 text-[11px] text-sage-500">{t('business.operationsHint')}</p>
            </article>
          )}
        </>
      )}

      <Modal
        title={editing ? t('business.edit') : t('business.new')}
        open={open}
        onClose={() => setOpen(false)}
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label={t('business.name')}>
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={80}
            />
          </Field>
          <Field label={t('business.activity')}>
            <TextInput
              value={form.activity}
              onChange={(e) => setForm({ ...form, activity: e.target.value })}
              maxLength={120}
            />
          </Field>
          <Field label={t('business.taxId')}>
            <TextInput
              value={form.taxId}
              onChange={(e) => setForm({ ...form, taxId: e.target.value })}
              maxLength={60}
            />
          </Field>
          <Field label={t('business.notes')}>
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              maxLength={500}
            />
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
