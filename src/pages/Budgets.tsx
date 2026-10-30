import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { useCategories, usePrimaryCurrency, useTransactions } from '@/hooks/useData';
import { budgetStatus, spentByCategory } from '@/core/selectors';
import { createBudget, deleteBudget, updateBudget } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { addMonths, currentMonth } from '@/lib/date';
import type { Budget } from '@/core/types';
import { Card, ConfirmButton, EmptyState, Field, Modal, MoneyInput, Page, ProgressBar, SelectInput, TextInput, btnGhost, btnPrimary } from '@/components/common';

interface BudgetForm {
  id?: string;
  period: string;
  categoryId: string;
  amountLimit: number;
  alertThreshold: number;
}

const THRESHOLDS = [50, 80, 90, 100];

function Budgets() {
  const { t, i18n } = useTranslation();
  const categories = useCategories();
  const transactions = useTransactions();
  const primary = usePrimaryCurrency();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BudgetForm | null>(null);

  const budgets = useLiveQuery(() => db.budgets.where('period').equals(month).toArray(), [month]);

  const expenseCategories = (categories ?? []).filter((c) => c.type === 'expense');

  const openForm = (budget?: Budget) => {
    setForm(
      budget
        ? { id: budget.id, period: budget.period, categoryId: budget.categoryId, amountLimit: budget.amountLimit, alertThreshold: budget.alertThreshold }
        : { period: month, categoryId: expenseCategories[0]?.id ?? '', amountLimit: 0, alertThreshold: 80 },
    );
    setOpen(true);
  };

  const save = async () => {
    if (!form || !form.categoryId) return;
    const input = { period: form.period, categoryId: form.categoryId, amountLimit: form.amountLimit, alertThreshold: form.alertThreshold };
    if (form.id) await updateBudget(form.id, input);
    else await createBudget(input);
    setOpen(false);
    setForm(null);
  };

  const rows = (budgets ?? []).map((budget) => {
    const category = categories?.find((c) => c.id === budget.categoryId);
    const status = budgetStatus(budget, spentByCategory(transactions ?? [], budget.categoryId));
    return { budget, category, status };
  });

  return (
    <Page
      title={t('budgets.title')}
      actions={
        <>
          <div className="flex items-center gap-1">
            <button type="button" className={btnGhost} onClick={() => setMonth(addMonths(month, -1))} aria-label="mois précédent">
              ◀
            </button>
            <span className="min-w-[6.5rem] text-center font-semibold">{month}</span>
            <button type="button" className={btnGhost} onClick={() => setMonth(addMonths(month, 1))} aria-label="mois suivant">
              ▶
            </button>
          </div>
          <button type="button" className={btnPrimary} onClick={() => openForm()}>
            ＋ {t('budgets.new')}
          </button>
        </>
      }
    >
      {!primary ? (
        <EmptyState label={t('common.loading')} />
      ) : rows.length === 0 ? (
        <EmptyState label={t('budgets.empty')} icon="🎯" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map(({ budget, category, status }) => (
            <Card key={budget.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-forest-950">
                    {category?.icon} {category?.nameFr}
                  </h3>
                  <p className="text-xs text-sage-600">
                    {fmt(i18n.language, budget.currency, status.spent)} / {fmt(i18n.language, budget.currency, budget.amountLimit)} ·{' '}
                    {t('budgets.progress', { percent: Math.round(status.percent) })}
                    {status.over && <span className="ml-1 font-semibold text-red-600">· {t('budgets.overBudget')}</span>}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => openForm(budget)} aria-label={t('common.edit')}>
                    ✎
                  </button>
                  <ConfirmButton label="🗑" confirmLabel={t('budgets.deleteConfirm')} cancelLabel={t('common.cancel')} onConfirm={() => void deleteBudget(budget.id)} danger />
                </div>
              </div>
              <ProgressBar percent={status.percent} alert={status.alert} over={status.over} />
              <p className="mt-1 text-xs text-sage-600">
                {t('budgets.remaining')} : {fmt(i18n.language, budget.currency, status.remaining)}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal title={form?.id ? t('common.edit') : t('budgets.new')} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <SelectInput
              label={t('common.category')}
              value={form.categoryId}
              onChange={(v) => setForm({ ...form, categoryId: v })}
              options={expenseCategories.map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.nameFr}` }))}
            />
            <Field label={t('budgets.month')}>
              <TextInput type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            </Field>
            <MoneyInput
              label={t('budgets.limit')}
              amountMinor={form.amountLimit}
              currency={primary ?? 'XOF'}
              onMinor={(minor) => setForm({ ...form, amountLimit: minor })}
            />
            <SelectInput
              label={t('budgets.threshold')}
              value={String(form.alertThreshold)}
              onChange={(v) => setForm({ ...form, alertThreshold: Number(v) })}
              options={THRESHOLDS.map((v) => ({ value: String(v), label: t('budgets.thresholdHint', { value: v }) }))}
            />
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

function fmt(lang: string, currency: Budget['currency'], value: number): string {
  return formatAmount(value, currency, lang);
}

export default Budgets;
