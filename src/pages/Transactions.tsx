import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccounts, useBusinesses, useCategories, useRates, useTransactions } from '@/hooks/useData';
import { db } from '@/db/dexie';
import { createTransaction, deleteTransaction, updateTransactionToAmount } from '@/core/repo';
import { defaultMemberFor } from '@/core/members';
import { getAuth } from '@/lib/api';
import { convertMinor } from '@/core/money';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import type { CurrencyCode, Transaction, TransactionType } from '@/core/types';
import { Card, ConfirmButton, EmptyState, Field, Modal, MoneyInput, Page, SelectInput, Tag, TextArea, TextInput, btnGhost, btnPrimary } from '@/components/common';

const schema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  accountId: z.string().min(1),
  toAccountId: z.string().min(1).optional(),
  amountOriginal: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().optional(),
  member: z.string().max(60).optional(),
  note: z.string().max(500).optional(),
});

interface FormState {
  type: TransactionType;
  accountId: string;
  toAccountId: string;
  amountOriginal: number;
  currency: CurrencyCode;
  categoryId: string;
  member: string;
  businessId: string;
  /** Facture professionnelle réglée (encaissée / payée). */
  settled: boolean;
  date: string;
  note: string;
}

function Transactions() {
  const { t, i18n } = useTranslation();
  const accounts = useAccounts();
  const categories = useCategories();
  const businesses = useBusinesses();
  const transactions = useTransactions();
  const rates = useRates();
  const members = useLiveQuery(async () => {
    const rows = await db.members.toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // Membre de l'utilisateur connecté, repris par défaut sur les nouvelles opérations.
  const user = useMemo(() => getAuth()?.user ?? null, []);
  const defaultMember = useMemo(() => defaultMemberFor(members ?? [], user)?.name ?? '', [members, user]);

  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openNew = (type: TransactionType) => {
    const first = accounts?.find((a) => !a.archived);
    if (!first) {
      setError(t('validation.noAccounts'));
      return;
    }
    setError(null);
    setForm({
      type,
      accountId: first.id,
      toAccountId: '',
      amountOriginal: 0,
      currency: first.currency,
      categoryId: '',
      member: type === 'transfer' ? '' : defaultMember,
      businessId: '',
      settled: true,
      date: todayISO(),
      note: '',
    });
    setOpen(true);
  };

  const account = form ? accounts?.find((a) => a.id === form.accountId) : undefined;
  const toAccount = form ? accounts?.find((a) => a.id === form.toAccountId) : undefined;

  const typeCategories = useMemo(() => {
    if (!categories) return [];
    return categories.filter((c) => c.type === (form?.type === 'income' ? 'income' : 'expense'));
  }, [categories, form?.type]);

  const save = async () => {
    if (!form || !account) return;
    const parsed = schema.safeParse({
      type: form.type,
      accountId: form.accountId,
      toAccountId: form.type === 'transfer' ? form.toAccountId || undefined : undefined,
      amountOriginal: form.amountOriginal,
      date: form.date,
      categoryId: form.categoryId || undefined,
      member: form.member.trim() || undefined,
      note: form.note || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('validation.required'));
      return;
    }
    if (form.type === 'transfer' && form.toAccountId === form.accountId) {
      setError(t('validation.sameAccount'));
      return;
    }
    await createTransaction({
      type: form.type,
      accountId: form.accountId,
      toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
      amountOriginal: form.amountOriginal,
      currencyOriginal: account.currency,
      categoryId: form.categoryId || undefined,
      member: form.member.trim() || undefined,
      businessId: form.type === 'transfer' ? undefined : form.businessId || undefined,
      settled: form.type !== 'transfer' && form.businessId ? form.settled : undefined,
      date: form.date,
      note: form.note || undefined,
    });
    if (form.type === 'transfer' && toAccount && toAccount.currency !== account.currency && rates.snapshot) {
      // Montant crédité converti dans la devise du compte de destination
      const tx = await db.transactions.orderBy('date').last();
      const converted = convertMinor(form.amountOriginal, account.currency, toAccount.currency, rates.snapshot);
      if (tx && converted !== null) {
        await updateTransactionToAmount(tx.id, converted);
      }
    }
    setOpen(false);
    setForm(null);
  };

  const remove = async (id: string) => {
    await deleteTransaction(id);
  };

  const rows = (transactions ?? []).filter((tx) => {
    if (filterType !== 'all' && tx.type !== filterType) return false;
    if (search && !(tx.note ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <Page
      title={t('transactions.title')}
      actions={
        <>
          <button type="button" className={btnPrimary} onClick={() => openNew('expense')}>
            ＋ {t('transactions.new')}
          </button>
          <button type="button" className={btnGhost} onClick={() => openNew('transfer')}>
            ⇄ {t('transactions.newTransfer')}
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput
          className="max-w-xs"
          placeholder={t('transactions.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SelectInput
          value={filterType}
          onChange={setFilterType}
          options={[
            { value: 'all', label: t('transactions.allTypes') },
            { value: 'income', label: t('transactions.income') },
            { value: 'expense', label: t('transactions.expense') },
            { value: 'transfer', label: t('transactions.transfer') },
          ]}
        />
        <span className="text-xs text-sage-600">{t('transactions.count', { count: rows.length })}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState label={t('transactions.empty')} icon="🧾" />
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-forest-50 text-left text-xs uppercase text-sage-600">
              <tr>
                <th className="px-3 py-2">{t('common.date')}</th>
                <th className="px-3 py-2">{t('common.category')}</th>
                <th className="px-3 py-2">{t('common.note')}</th>
                <th className="px-3 py-2 text-right">{t('common.amount')}</th>
                <th className="px-3 py-2" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => (
                <tr key={tx.id} className="table-row-hover border-t border-forest-100">
                  <td className="whitespace-nowrap px-3 py-2">{tx.date}</td>
                  <td className="px-3 py-2">
                    <TypeTag type={tx.type} />
                  </td>
                  <td className="max-w-[16rem] truncate px-3 py-2">
                    {tx.note
                      ? tx.note
                      : `${accounts?.find((a) => a.id === tx.accountId)?.name ?? ''}${
                          tx.toAccountId ? ` → ${accounts?.find((a) => a.id === tx.toAccountId)?.name ?? ''}` : ''
                        }`}
                    {tx.businessId && (
                      <span className="ml-1 text-[11px] font-medium text-forest-600">
                        · {(businesses ?? []).find((business) => business.id === tx.businessId)?.name ?? ''}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '⇄'}{' '}
                    {formatAmount(tx.amountOriginal, tx.currencyOriginal, i18n.language)}
                    {tx.type === 'transfer' && toAccountOf(tx, accounts) && tx.toAmount != null && (
                      <span className="ml-1 text-xs font-normal text-sage-500">
                        → {formatAmount(tx.toAmount, toAccountOf(tx, accounts)!.currency, i18n.language)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ConfirmButton
                      label="🗑"
                      confirmLabel={t('transactions.deleteConfirm')}
                      onConfirm={() => void remove(tx.id)}
                      danger
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal title={form?.type === 'transfer' ? t('transactions.newTransfer') : t('transactions.new')} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <SelectInput
              label={t('transactions.type')}
              value={form.type}
              onChange={(v) =>
                setForm({
                  ...form,
                  type: v as TransactionType,
                  categoryId: '',
                  businessId: v === 'transfer' ? '' : form.businessId,
                })
              }
              options={['expense', 'income', 'transfer'].map((v) => ({ value: v, label: t(`transactions.${v}`) }))}
            />
            <SelectInput
              label={form.type === 'transfer' ? t('transactions.fromAccount') : t('transactions.account')}
              value={form.accountId}
              onChange={(v) => {
                const selected = accounts?.find((a) => a.id === v);
                setForm({ ...form, accountId: v, currency: selected?.currency ?? form.currency });
              }}
              options={(accounts ?? []).filter((a) => !a.archived).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
            />
            {form.type === 'transfer' && (
              <SelectInput
                label={t('transactions.toAccount')}
                value={form.toAccountId}
                onChange={(v) => setForm({ ...form, toAccountId: v })}
                options={(accounts ?? []).filter((a) => !a.archived && a.id !== form.accountId).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
              />
            )}
            <MoneyInput
              label={t('common.amount')}
              amountMinor={form.amountOriginal}
              currency={account?.currency ?? form.currency}
              onMinor={(minor) => setForm({ ...form, amountOriginal: minor })}
            />
            {form.type !== 'transfer' && (
              <SelectInput
                label={t('common.category')}
                value={form.categoryId}
                onChange={(v) => setForm({ ...form, categoryId: v })}
                options={[{ value: '', label: '—' }, ...typeCategories.map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.nameFr}` }))]}
              />
            )}
            <Field label={t('common.date')}>
              <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field
              label={t('transactions.member')}
              hint={form.member && form.member === defaultMember ? t('transactions.memberDefault') : t('transactions.memberHint')}
            >
              <SelectInput
                label={t('transactions.member')}
                value={form.member}
                onChange={(value) => setForm({ ...form, member: value })}
                options={[
                  { value: '', label: '—' },
                  ...(members ?? []).map((member) => ({ value: member.name, label: member.name })),
                  ...(form.member && !(members ?? []).some((member) => member.name === form.member)
                    ? [{ value: form.member, label: form.member }]
                    : []),
                ]}
              />
            </Field>
            {(businesses ?? []).filter((business) => !business.archived).length > 0 && form.type !== 'transfer' && (
              <>
                <SelectInput
                  label={t('transactions.business')}
                  value={form.businessId}
                  onChange={(value) => setForm({ ...form, businessId: value })}
                  options={[
                    { value: '', label: '—' },
                    ...(businesses ?? [])
                      .filter((business) => !business.archived)
                      .map((business) => ({ value: business.id, label: business.name })),
                  ]}
                />
                {form.businessId && (
                  <label className="flex items-center gap-2 text-sm text-forest-900">
                    <input
                      type="checkbox"
                      checked={form.settled}
                      onChange={(e) => setForm({ ...form, settled: e.target.checked })}
                      className="h-4 w-4 rounded border-forest-300"
                    />
                    {form.type === 'income'
                      ? t('transactions.businessSettledIncome')
                      : t('transactions.businessSettledExpense')}
                  </label>
                )}
                <p className="text-xs text-sage-500">{t('transactions.businessHint')}</p>
              </>
            )}
            <Field label={t('transactions.note')}>
              <TextArea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            {form.type === 'transfer' && (
              <p className="rounded-lg bg-forest-50 px-3 py-2 text-xs text-forest-800">{t('transactions.transferHint')}</p>
            )}
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

function toAccountOf(tx: Transaction, accounts?: { id: string; currency: CurrencyCode }[]) {
  if (!tx.toAccountId) return undefined;
  return accounts?.find((a) => a.id === tx.toAccountId);
}

function TypeTag({ type }: { type: Transaction['type'] }) {
  const { t } = useTranslation();
  const tone = type === 'income' ? 'green' : type === 'expense' ? 'red' : 'sage';
  return <Tag tone={tone}>{t(`transactions.${type}`)}</Tag>;
}

export default Transactions;
