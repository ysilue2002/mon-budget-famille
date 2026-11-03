import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts, useCategories, useRecurringRules } from '@/hooks/useData';
import { createRecurringRule, deleteRecurringRule, updateRecurringRule } from '@/core/repo';
import { materializeDueRecurrences } from '@/core/recurring';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import type { CurrencyCode, RecurrenceFrequency, RecurringRule } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  Page,
  SelectInput,
  Tag,
  TextArea,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

interface RuleForm {
  id?: string;
  name: string;
  type: RecurringRule['type'];
  accountId: string;
  categoryId: string;
  amountOriginal: number;
  currency: CurrencyCode;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string;
  note: string;
}

const FREQUENCIES: RecurrenceFrequency[] = ['weekly', 'monthly', 'yearly'];

function Recurring() {
  const { t, i18n } = useTranslation();
  const accounts = useAccounts();
  const categories = useCategories();
  const rules = useRecurringRules();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RuleForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeAccounts = (accounts ?? []).filter((a) => !a.archived);

  const cadenceOf = (rule: Pick<RecurringRule, 'frequency' | 'interval'>): string => {
    if (rule.interval > 1) {
      const unit = rule.frequency === 'weekly' ? 'Weeks' : rule.frequency === 'monthly' ? 'Months' : 'Years';
      return t(`recurring.cadence.every${unit}`, { count: rule.interval });
    }
    return t(`recurring.cadence.${rule.frequency}`);
  };

  const fmt = (currency: CurrencyCode, value: number) => formatAmount(value, currency, i18n.language);

  const openForm = (rule?: RecurringRule) => {
    const first = activeAccounts[0];
    if (!rule && !first) {
      setError(t('validation.noAccounts'));
      return;
    }
    setError(null);
    setNotice(null);
    setForm(
      rule
        ? {
            id: rule.id,
            name: rule.name,
            type: rule.type,
            accountId: rule.accountId,
            categoryId: rule.categoryId,
            amountOriginal: rule.amountOriginal,
            currency: rule.currency,
            frequency: rule.frequency,
            interval: rule.interval,
            startDate: rule.startDate,
            endDate: rule.endDate ?? '',
            note: rule.note ?? '',
          }
        : {
            name: '',
            type: 'expense',
            accountId: first.id,
            categoryId: '',
            amountOriginal: 0,
            currency: first.currency,
            frequency: 'monthly',
            interval: 1,
            startDate: todayISO(),
            endDate: '',
            note: '',
          },
    );
    setOpen(true);
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return setError(t('validation.required'));
    if (!form.accountId) return setError(t('validation.noAccounts'));
    if (!form.categoryId) return setError(t('validation.required'));
    if (!Number.isInteger(form.amountOriginal) || form.amountOriginal <= 0) return setError(t('validation.negativeAmount'));
    if (!Number.isInteger(form.interval) || form.interval < 1) return setError(t('validation.required'));
    if (form.endDate && form.endDate < form.startDate) return setError(t('recurring.endBeforeStart'));

    const input = {
      name: form.name.trim(),
      type: form.type,
      accountId: form.accountId,
      categoryId: form.categoryId,
      amountOriginal: form.amountOriginal,
      currency: form.currency,
      frequency: form.frequency,
      interval: form.interval,
      startDate: form.startDate,
      endDate: form.endDate || null,
      note: form.note.trim() || undefined,
    };
    if (form.id) await updateRecurringRule(form.id, input);
    else await createRecurringRule(input);
    setOpen(false);
    setForm(null);
    setError(null);
    // Une échéance tombant aujourd'hui est matérialisée immédiatement.
    const run = await materializeDueRecurrences();
    if (run.generated > 0) setNotice(t('recurring.generatedCount', { total: run.generated }));
  };

  const runNow = async () => {
    const run = await materializeDueRecurrences();
    setNotice(
      run.generated > 0 ? t('recurring.generatedCount', { total: run.generated }) : t('recurring.nothingDue'),
    );
  };

  const list = rules ?? [];

  return (
    <Page
      title={t('recurring.title')}
      actions={
        <>
          <button type="button" className={btnGhost} onClick={() => void runNow()}>
            ⟳ {t('recurring.runNow')}
          </button>
          <button type="button" className={btnPrimary} onClick={() => openForm()}>
            ＋ {t('recurring.new')}
          </button>
        </>
      }
    >
      <p className="mb-4 text-xs text-sage-600">{t('recurring.hint')}</p>
      {notice && (
        <p className="mb-3 rounded-lg bg-forest-50 px-3 py-2 text-xs font-medium text-forest-800">{notice}</p>
      )}
      {error && !open && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
      )}

      {rules === undefined ? (
        <EmptyState label={t('common.loading')} />
      ) : list.length === 0 ? (
        <EmptyState label={t('recurring.empty')} icon="🔁" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((rule) => {
            const account = accounts?.find((a) => a.id === rule.accountId);
            const category = categories?.find((c) => c.id === rule.categoryId);
            return (
              <Card key={rule.id} className={rule.active ? undefined : 'opacity-60'}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-forest-950">
                      {rule.type === 'income' ? '↗' : '↘'} {rule.name}
                    </h3>
                    <p className="text-xs text-sage-600">
                      {cadenceOf(rule)} · {account?.name ?? '—'}
                      {category ? ` · ${category.icon ?? ''} ${category.nameFr}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Tag tone={rule.active ? 'green' : 'sage'}>{rule.active ? t('recurring.active') : t('recurring.paused')}</Tag>
                  </div>
                </div>

                <p className="mb-1 text-lg font-bold text-forest-900">
                  {fmt(rule.currency, rule.amountOriginal)}
                  {rule.type === 'income' ? (
                    <span className="ml-2 text-xs font-medium text-forest-600">{t('transactions.income')}</span>
                  ) : (
                    <span className="ml-2 text-xs font-medium text-red-600">{t('transactions.expense')}</span>
                  )}
                </p>
                <p className="text-xs text-sage-600">
                  {rule.active ? t('recurring.nextDue') : t('recurring.upcoming')} : {rule.nextDueDate}
                </p>
                {rule.lastGeneratedDate && (
                  <p className="text-xs text-sage-500">
                    {t('recurring.lastGenerated')} : {rule.lastGeneratedDate}
                  </p>
                )}
                {rule.endDate && <p className="text-xs text-sage-500">{t('recurring.endsOn')} : {rule.endDate}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-forest-100 pt-2">
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs font-medium text-forest-700 transition hover:bg-forest-50"
                    onClick={() => void updateRecurringRule(rule.id, { active: !rule.active })}
                  >
                    {rule.active ? `⏸ ${t('recurring.pause')}` : `▶ ${t('recurring.resume')}`}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-sm text-forest-700 transition hover:bg-forest-50"
                    onClick={() => openForm(rule)}
                    aria-label={t('common.edit')}
                  >
                    ✎
                  </button>
                  <ConfirmButton
                    label="🗑"
                    confirmLabel={t('recurring.deleteConfirm')}
                    cancelLabel={t('common.cancel')}
                    onConfirm={() => {
                      setNotice(null);
                      void deleteRecurringRule(rule.id);
                    }}
                    danger
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal title={form?.id ? t('common.edit') : t('recurring.new')} open={open} onClose={() => setOpen(false)}>
        {form && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label={t('recurring.name')}>
              <TextInput
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('recurring.namePlaceholder')}
                maxLength={80}
                autoFocus
              />
            </Field>

            <SelectInput
              label={t('recurring.type')}
              value={form.type}
              onChange={(v) => {
                const type = v === 'income' ? 'income' : 'expense';
                const firstCategory = (categories ?? []).find((c) => c.type === type);
                setForm({ ...form, type, categoryId: firstCategory?.id ?? '' });
              }}
              options={[
                { value: 'expense', label: t('transactions.expense') },
                { value: 'income', label: t('transactions.income') },
              ]}
            />

            <SelectInput
              label={t('recurring.account')}
              value={form.accountId}
              onChange={(v) => {
                const account = activeAccounts.find((a) => a.id === v);
                setForm({ ...form, accountId: v, currency: account?.currency ?? form.currency });
              }}
              options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />

            <SelectInput
              label={t('common.category')}
              value={form.categoryId}
              onChange={(v) => setForm({ ...form, categoryId: v })}
              options={(categories ?? [])
                .filter((c) => c.type === form.type)
                .map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.nameFr}` }))}
            />

            <MoneyInput
              label={t('common.amount')}
              amountMinor={form.amountOriginal}
              currency={form.currency}
              onMinor={(minor) => setForm({ ...form, amountOriginal: minor })}
            />

            <SelectInput
              label={t('recurring.frequency')}
              value={form.frequency}
              onChange={(v) => setForm({ ...form, frequency: v as RecurrenceFrequency })}
              options={FREQUENCIES.map((f) => ({ value: f, label: t(`recurring.cadence.${f}`) }))}
            />

            <Field label={t('recurring.interval')} hint={cadenceOf(form)}>
              <TextInput
                type="number"
                min={1}
                max={60}
                value={String(form.interval)}
                onChange={(e) => setForm({ ...form, interval: Number(e.target.value) })}
              />
            </Field>

            <Field label={t('recurring.startDate')} hint={t('recurring.startHint')}>
              <TextInput type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>

            <Field label={t('recurring.endDate')}>
              <TextInput type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>

            <Field label={t('common.note')}>
              <TextArea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                maxLength={500}
                placeholder={t('recurring.notePlaceholder')}
              />
            </Field>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

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

export default Recurring;
