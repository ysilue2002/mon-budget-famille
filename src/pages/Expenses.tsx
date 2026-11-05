import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useBusinesses,
  useCategories,
  usePrimaryCurrency,
  useTransactions,
} from '@/hooks/useData';
import { createTransaction, deleteTransaction } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { currentMonth, endOfMonth, todayISO } from '@/lib/date';
import type { Transaction } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  MoneyInput,
  Page,
  SelectInput,
  StatCard,
  Tag,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

interface ExpenseForm {
  amount: number;
  categoryId: string;
  accountId: string;
  businessId: string;
  date: string;
  note: string;
  paid: boolean;
}

/**
 * Dépenses de l'activité : formulaire volontairement court (montant, catégorie,
 * date, note) qui crée une opération de journal rattachée à l'activité. Une
 * dépense « à crédit » reste comptée dans le résultat mais alimente le reste à
 * payer fournisseur jusqu'à son règlement.
 */
export default function Expenses() {
  const { t, i18n } = useTranslation();
  const accounts = useAccounts();
  const categories = useCategories();
  const businesses = useBusinesses();
  const transactions = useTransactions();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const activeAccounts = (accounts ?? []).filter((account) => !account.archived);
  const activeBusinesses = (businesses ?? []).filter((business) => !business.archived);
  const expenseCategories = (categories ?? []).filter((category) => category.type === 'expense');

  const [form, setForm] = useState<ExpenseForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const fmt = (minor: number) => formatAmount(minor, primary, i18n.language);
  const categoryLabel = (id?: string) => {
    const category = (categories ?? []).find((row) => row.id === id);
    if (!category) return t('business.uncategorised');
    return i18n.language.startsWith('fr') ? category.nameFr : category.nameEn;
  };

  const businessId = form?.businessId || activeBusinesses[0]?.id || '';
  const rows = useMemo(
    () =>
      (transactions ?? [])
        .filter((tx) => tx.type === 'expense' && tx.businessId && tx.businessId === businessId)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 100),
    [transactions, businessId],
  );

  const month = currentMonth();
  const monthRows = rows.filter((tx) => tx.date >= `${month}-01` && tx.date <= endOfMonth(month));
  const monthTotal = monthRows.reduce((sum, tx) => sum + tx.amountInPrimary, 0);
  const unpaid = rows
    .filter((tx) => tx.settled === false)
    .reduce((sum, tx) => sum + Math.max(0, tx.amountInPrimary - (tx.settledAmount ?? 0)), 0);

  const startForm = () => {
    const account = activeAccounts[0];
    if (!account) {
      setError(t('validation.noAccounts'));
      return;
    }
    if (activeBusinesses.length === 0) {
      setError(t('expenses.noBusiness'));
      return;
    }
    setError(null);
    setFlash(null);
    setForm({
      amount: 0,
      categoryId: expenseCategories[0]?.id ?? '',
      accountId: account.id,
      businessId: businessId || activeBusinesses[0].id,
      date: todayISO(),
      note: '',
      paid: true,
    });
  };

  const save = async () => {
    if (!form) return;
    if (form.amount <= 0) {
      setError(t('expenses.amountRequired'));
      return;
    }
    const account = activeAccounts.find((row) => row.id === form.accountId);
    if (!account) {
      setError(t('validation.noAccounts'));
      return;
    }
    await createTransaction({
      type: 'expense',
      accountId: account.id,
      amountOriginal: form.amount,
      currencyOriginal: account.currency,
      categoryId: form.categoryId || undefined,
      businessId: form.businessId,
      settled: form.paid,
      date: form.date,
      note: form.note.trim() || undefined,
    });
    setForm(null);
    setFlash(t('expenses.saved'));
  };

  const statusTag = (tx: Transaction) =>
    tx.settled === false ? <Tag tone="amber">{t('expenses.credit')}</Tag> : <Tag tone="green">{t('expenses.paid')}</Tag>;

  return (
    <Page
      title={t('expenses.title')}
      actions={
        <button type="button" className={btnPrimary} onClick={startForm}>
          ＋ {t('expenses.new')}
        </button>
      }
    >
      {activeBusinesses.length === 0 ? (
        <Card>
          <EmptyState label={t('expenses.noBusiness')} icon="💼" />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard label={t('expenses.monthTotal')} value={fmt(monthTotal)} hint={t('expenses.thisMonth')} />
            <StatCard label={t('expenses.unpaid')} value={fmt(unpaid)} hint={t('expenses.unpaidHint')} />
            <StatCard label={t('expenses.count', { count: monthRows.length })} value={String(monthRows.length)} />
          </div>

          {flash && <p className="mb-3 text-sm font-medium text-forest-700">✓ {flash}</p>}
          {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}

          {form ? (
            <Card>
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MoneyInput
                    label={t('expenses.amount')}
                    amountMinor={form.amount}
                    currency={primary}
                    onMinor={(minor) => setForm({ ...form, amount: minor })}
                  />
                  <Field label={t('expenses.category')}>
                    <SelectInput
                      value={form.categoryId}
                      onChange={(value) => setForm({ ...form, categoryId: value })}
                      options={expenseCategories.map((category) => ({
                        value: category.id,
                        label: i18n.language.startsWith('fr') ? category.nameFr : category.nameEn,
                      }))}
                    />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t('expenses.date')}>
                    <TextInput
                      type="date"
                      value={form.date}
                      onChange={(event) => setForm({ ...form, date: event.target.value })}
                    />
                  </Field>
                  <Field label={t('expenses.account')}>
                    <SelectInput
                      value={form.accountId}
                      onChange={(value) => setForm({ ...form, accountId: value })}
                      options={activeAccounts.map((account) => ({ value: account.id, label: account.name }))}
                    />
                  </Field>
                  {activeBusinesses.length > 1 && (
                    <Field label={t('expenses.business')}>
                      <SelectInput
                        value={form.businessId}
                        onChange={(value) => setForm({ ...form, businessId: value })}
                        options={activeBusinesses.map((business) => ({ value: business.id, label: business.name }))}
                      />
                    </Field>
                  )}
                </div>
                <Field label={t('expenses.note')}>
                  <TextInput
                    value={form.note}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                    maxLength={200}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-forest-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-forest-300"
                    checked={!form.paid}
                    onChange={(event) => setForm({ ...form, paid: !event.target.checked })}
                  />
                  {t('expenses.onCredit')}
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" className={btnGhost} onClick={() => setForm(null)}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className={btnPrimary}>
                    {t('common.save')}
                  </button>
                </div>
              </form>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState label={t('expenses.empty')} icon="🧾" />
              <p className="mt-2 text-center text-xs text-sage-600">{t('expenses.emptyHint')}</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                    <th className="py-1.5">{t('expenses.date')}</th>
                    <th className="py-1.5">{t('expenses.category')}</th>
                    <th className="py-1.5">{t('expenses.note')}</th>
                    <th className="py-1.5 text-right">{t('expenses.amount')}</th>
                    <th className="py-1.5">{t('expenses.status')}</th>
                    <th className="py-1.5 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((tx) => (
                    <tr key={tx.id} className="border-b border-forest-50">
                      <td className="whitespace-nowrap py-1.5">{tx.date}</td>
                      <td className="py-1.5">{categoryLabel(tx.categoryId)}</td>
                      <td className="max-w-[16rem] truncate py-1.5">{tx.note || '—'}</td>
                      <td className="whitespace-nowrap py-1.5 text-right font-semibold">{fmt(tx.amountInPrimary)}</td>
                      <td className="py-1.5">{statusTag(tx)}</td>
                      <td className="py-1.5 text-right">
                        <ConfirmButton
                          label="🗑"
                          confirmLabel={t('expenses.deleteConfirm')}
                          cancelLabel={t('common.cancel')}
                          onConfirm={() => void deleteTransaction(tx.id)}
                          danger
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <p className="mt-2 text-xs text-sage-500">{t('expenses.hint')}</p>
        </>
      )}
    </Page>
  );
}
