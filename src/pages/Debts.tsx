import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { useAccounts, usePrimaryCurrency } from '@/hooks/useData';
import { createDebt, deleteDebt, repayDebt } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import type { Debt, DebtKind } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  Page,
  ProgressBar,
  SelectInput,
  TextInput,
  Tag,
  btnGhost,
  btnPrimary,
} from '@/components/common';

interface DebtForm {
  kind: DebtKind;
  partyName: string;
  initialAmount: number;
  dueDate: string;
}

function Debts() {
  const { t, i18n } = useTranslation();
  const primary = usePrimaryCurrency();
  const accounts = useAccounts();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DebtForm | null>(null);
  const [repay, setRepay] = useState<{ debt: Debt; amount: number; date: string; accountId: string } | null>(null);

  const debts = useLiveQuery(() => db.debts.orderBy('createdAt').toArray());

  const openForm = (kind: DebtKind = 'payable') => {
    setForm({ kind, partyName: '', initialAmount: 0, dueDate: '' });
    setOpen(true);
  };

  const save = async () => {
    if (!form || !form.partyName.trim() || !primary) return;
    await createDebt({
      kind: form.kind,
      partyName: form.partyName.trim(),
      initialAmount: form.initialAmount,
      currency: primary,
      dueDate: form.dueDate || null,
    });
    setOpen(false);
    setForm(null);
  };

  return (
    <Page
      title={t('debts.title')}
      actions={
        <>
          <button type="button" className={btnGhost} onClick={() => openForm('payable')}>
            ＋ {t('debts.payable')}
          </button>
          <button type="button" className={btnGhost} onClick={() => openForm('receivable')}>
            ＋ {t('debts.receivable')}
          </button>
        </>
      }
    >
      {(debts ?? []).length === 0 ? (
        <EmptyState label={t('debts.empty')} icon="🤝" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(debts ?? []).map((debt) => {
            const percent = debt.initialAmount > 0 ? Math.min(100, ((debt.initialAmount - debt.remainingAmount) / debt.initialAmount) * 100) : 0;
            return (
              <Card key={debt.id}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-forest-950">
                      {debt.kind === 'payable' ? '↘' : '↗'} {debt.partyName}
                    </h3>
                    <p className="text-xs text-sage-600">
                      {debt.kind === 'payable' ? t('debts.payable') : t('debts.receivable')} ·{' '}
                      {t('debts.remaining')} : {formatAmount(debt.remainingAmount, debt.currency, i18n.language)}
                      {debt.dueDate && <> · 📅 {debt.dueDate}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {debt.status === 'settled' ? <Tag tone="green">{t('debts.settled')}</Tag> : <Tag tone="sage">{t('debts.open')}</Tag>}
                    {debt.status === 'open' && (
                      <button
                        type="button"
                        className="rounded p-1 text-sm hover:bg-forest-50"
                        onClick={() => setRepay({ debt, amount: 0, date: todayISO(), accountId: '' })}
                        aria-label={t('debts.repay')}
                      >
                        💳
                      </button>
                    )}
                    <ConfirmButton label="🗑" confirmLabel={t('debts.deleteConfirm')} cancelLabel={t('common.cancel')} onConfirm={() => void deleteDebt(debt.id)} danger />
                  </div>
                </div>
                <ProgressBar percent={percent} />
                <p className="mt-1 text-xs text-sage-600">
                  {t('debts.initialAmount')} : {formatAmount(debt.initialAmount, debt.currency, i18n.language)}
                  {debt.payments.length > 0 && <> · {debt.payments.length} × 💳</>}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <Modal title={form?.kind === 'receivable' ? t('debts.receivable') : t('debts.payable')} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <SelectInput
              label={t('debts.kind')}
              value={form.kind}
              onChange={(v) => setForm({ ...form, kind: v as DebtKind })}
              options={[
                { value: 'payable', label: t('debts.payable') },
                { value: 'receivable', label: t('debts.receivable') },
              ]}
            />
            <TextInput placeholder={t('debts.party')} value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} required />
            <MoneyInput
              label={t('debts.initialAmount')}
              amountMinor={form.initialAmount}
              currency={primary ?? 'XOF'}
              onMinor={(minor) => setForm({ ...form, initialAmount: minor })}
            />
            <Field label={t('debts.dueDate')}>
              <TextInput type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
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

      <Modal title={t('debts.repay')} open={!!repay} onClose={() => setRepay(null)}>
        {repay && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void repayDebt(repay.debt.id, repay.amount, repay.date, repay.accountId || undefined);
              setRepay(null);
            }}
          >
            <MoneyInput
              label={t('debts.repaymentAmount')}
              amountMinor={repay.amount}
              currency={repay.debt.currency}
              onMinor={(minor) => setRepay({ ...repay, amount: minor })}
            />
            <Field label={t('common.date')}>
              <TextInput type="date" value={repay.date} onChange={(e) => setRepay({ ...repay, date: e.target.value })} />
            </Field>
            <SelectInput
              label={t('transactions.account')}
              value={repay.accountId}
              onChange={(v) => setRepay({ ...repay, accountId: v })}
              options={[{ value: '', label: `— ${t('common.none')} —` }, ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))]}
            />
            <p className="text-xs text-sage-500">{t('debts.affectsAccounts')}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setRepay(null)}>
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

export default Debts;
