import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { usePrimaryCurrency } from '@/hooks/useData';
import { createGoal, deleteGoal, updateGoal, contributeGoal } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import type { SavingsGoal } from '@/core/types';
import { Card, ConfirmButton, EmptyState, Modal, MoneyInput, Page, ProgressBar, TextInput, btnGhost, btnPrimary } from '@/components/common';

interface GoalForm {
  id?: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
}

function Savings() {
  const { t, i18n } = useTranslation();
  const primary = usePrimaryCurrency();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<GoalForm | null>(null);
  const [contrib, setContrib] = useState<{ goal: SavingsGoal; amount: number } | null>(null);

  const goals = useLiveQuery(() => db.goals.orderBy('createdAt').toArray());

  const openForm = (goal?: SavingsGoal) => {
    setForm(
      goal
        ? { id: goal.id, name: goal.name, targetAmount: goal.targetAmount, currentAmount: goal.currentAmount, targetDate: goal.targetDate ?? '' }
        : { name: '', targetAmount: 0, currentAmount: 0, targetDate: '' },
    );
    setOpen(true);
  };

  const save = async () => {
    if (!form || !form.name.trim() || !primary) return;
    if (form.id) {
      await updateGoal(form.id, { name: form.name.trim(), targetAmount: form.targetAmount, targetDate: form.targetDate || null });
    } else {
      await createGoal({ name: form.name.trim(), targetAmount: form.targetAmount, currency: primary, targetDate: form.targetDate || null });
    }
    setOpen(false);
    setForm(null);
  };

  return (
    <Page
      title={t('savings.title')}
      actions={
        <button type="button" className={btnPrimary} onClick={() => openForm()}>
          ＋ {t('savings.new')}
        </button>
      }
    >
      {(goals ?? []).length === 0 ? (
        <EmptyState label={t('savings.empty')} icon="💰" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(goals ?? []).map((goal) => {
            const percent = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
            return (
              <Card key={goal.id}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-forest-950">
                      {goal.name} {goal.status === 'completed' && <span className="text-xs font-medium text-forest-600">✔</span>}
                    </h3>
                    <p className="text-xs text-sage-600">
                      {formatAmount(goal.currentAmount, goal.currency, i18n.language)} / {formatAmount(goal.targetAmount, goal.currency, i18n.language)}
                      {goal.targetDate && <> · 📅 {goal.targetDate}</>}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded p-1 text-sm hover:bg-forest-50"
                      onClick={() => setContrib({ goal, amount: 0 })}
                      aria-label={t('savings.contribute')}
                    >
                      ⤵
                    </button>
                    <button type="button" className="rounded p-1 text-sm hover:bg-forest-50" onClick={() => openForm(goal)} aria-label={t('common.edit')}>
                      ✎
                    </button>
                    <ConfirmButton label="🗑" confirmLabel={t('savings.deleteConfirm')} cancelLabel={t('common.cancel')} onConfirm={() => void deleteGoal(goal.id)} danger />
                  </div>
                </div>
                <ProgressBar percent={percent} />
                <p className="mt-1 text-xs text-sage-600">
                  {t('savings.progress', { percent: Math.round(percent) })} ·{' '}
                  {t('savings.remaining', { amount: formatAmount(Math.max(0, goal.targetAmount - goal.currentAmount), goal.currency, i18n.language) })}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      <Modal title={form?.id ? t('common.edit') : t('savings.new')} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <TextInput placeholder={t('savings.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <MoneyInput
              label={t('savings.target')}
              amountMinor={form.targetAmount}
              currency={primary ?? 'XOF'}
              onMinor={(minor) => setForm({ ...form, targetAmount: minor })}
            />
            <TextInput
              type="date"
              value={form.targetDate}
              onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
              aria-label={t('savings.targetDate')}
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

      <Modal title={t('savings.contribute')} open={!!contrib} onClose={() => setContrib(null)}>
        {contrib && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void contributeGoal(contrib.goal.id, contrib.amount);
              setContrib(null);
            }}
          >
            <MoneyInput
              label={t('savings.amount')}
              amountMinor={contrib.amount}
              currency={contrib.goal.currency}
              onMinor={(minor) => setContrib({ goal: contrib.goal, amount: minor })}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={() => setContrib(null)}>
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

export default Savings;
