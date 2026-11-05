import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAccounts, usePrimaryCurrency, useTransactions } from '@/hooks/useData';
import { computeAccountBalance } from '@/core/selectors';
import { createAccount, deleteAccount, updateAccount } from '@/core/repo';
import { SUPPORTED_CURRENCIES, formatAmount } from '@/core/currencies';
import type { AccountType, CurrencyCode, FinancialAccount, MobileProvider } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  Page,
  SelectInput,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

const accountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['cash', 'bank', 'mobile', 'other']),
  currency: z.string().min(3),
  initialBalance: z.number().int(),
});

interface AccountForm {
  id?: string;
  name: string;
  type: AccountType;
  provider: MobileProvider;
  currency: CurrencyCode;
  initialBalance: number;
}

const PROVIDERS: { value: MobileProvider; key: string }[] = [
  { value: 'wave', key: 'accounts.mobileProviders.wave' },
  { value: 'orange', key: 'accounts.mobileProviders.orange' },
  { value: 'mtn', key: 'accounts.mobileProviders.mtn' },
  { value: 'moov', key: 'accounts.mobileProviders.moov' },
  { value: 'paypal', key: 'accounts.mobileProviders.paypal' },
  { value: 'other', key: 'accounts.mobileProviders.other' },
];

function Accounts() {
  const { t, i18n } = useTranslation();
  const accounts = useAccounts();
  const transactions = useTransactions();
  const primary = usePrimaryCurrency();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AccountForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openForm = (account?: FinancialAccount) => {
    setForm(
      account
        ? { id: account.id, name: account.name, type: account.type, provider: account.provider, currency: account.currency, initialBalance: account.initialBalance }
        : { name: '', type: 'cash', provider: null, currency: primary ?? 'XOF', initialBalance: 0 },
    );
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form) return;
    const parsed = accountSchema.safeParse({ name: form.name, type: form.type, currency: form.currency, initialBalance: form.initialBalance });
    if (!parsed.success) {
      setError(t('validation.required'));
      return;
    }
    const input = {
      name: form.name,
      type: form.type,
      provider: form.type === 'mobile' ? form.provider : null,
      currency: form.currency,
      initialBalance: form.initialBalance,
    };
    if (form.id) await updateAccount(form.id, input);
    else await createAccount(input);
    setOpen(false);
    setForm(null);
  };

  return (
    <Page
      title={t('accounts.title')}
      actions={
        <button type="button" className={btnPrimary} onClick={() => openForm()}>
          ＋ {t('accounts.new')}
        </button>
      }
    >
      {!accounts?.length ? (
        <EmptyState label={t('accounts.empty')} icon="🏦" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const txs = transactions?.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id) ?? [];
            const balance = computeAccountBalance(account, txs);
            return (
              <Card key={account.id} className={account.archived ? 'opacity-50' : undefined}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-forest-950">{account.name}</h3>
                    <p className="text-xs text-sage-600">
                      {t(`accounts.${account.type}`)}
                      {account.type === 'mobile' && account.provider ? ` · ${t(PROVIDERS.find((p) => p.value === account.provider)?.key ?? 'accounts.mobileProviders.other')}` : ''}
                      {' · '}
                      {account.currency}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => openForm(account)} aria-label={t('common.edit')}>
                      ✎
                    </button>
                    <ConfirmButton label="🗑" confirmLabel={t('accounts.deleteConfirm')} onConfirm={() => void deleteAccount(account.id)} danger />
                  </div>
                </div>
                <p className="text-2xl font-bold text-forest-800">{formatAmount(balance, account.currency, i18n.language)}</p>
              </Card>
            );
          })}
        </div>
      )}

      <Modal title={form?.id ? t('common.edit') : t('accounts.new')} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label={t('common.name')}>
              <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <SelectInput
              label={t('accounts.type')}
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v as AccountType, provider: null })}
              options={['cash', 'bank', 'mobile', 'other'].map((v) => ({ value: v, label: t(`accounts.${v}`) }))}
            />
            {form.type === 'mobile' && (
              <SelectInput
                label={t('accounts.mobileProvider')}
                value={form.provider ?? 'other'}
                onChange={(v) => setForm({ ...form, provider: v as MobileProvider })}
                options={PROVIDERS.map((p) => ({ value: p.value ?? 'other', label: t(p.key) }))}
              />
            )}
            <SelectInput
              label={t('common.currency')}
              value={form.currency}
              onChange={(v) => setForm({ ...form, currency: v as AccountForm['currency'] })}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
            <MoneyInput
              label={t('accounts.initialBalance')}
              amountMinor={form.initialBalance}
              currency={form.currency}
              onMinor={(minor) => setForm({ ...form, initialBalance: minor })}
            />
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

export default Accounts;
