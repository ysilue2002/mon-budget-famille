import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdvances, useParties, usePrimaryCurrency } from '@/hooks/useData';
import { createAdvance, deleteAdvance, updateAdvance } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { advanceRemaining, openAdvancesRemaining, openAdvancesTotal } from '@/core/advances';
import { todayISO } from '@/lib/date';
import type { Advance } from '@/core/types';
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

interface AdvanceForm {
  id?: string;
  partyName: string;
  subject: string;
  amount: number;
  expected: number;
  receivedOn: string;
  status: Advance['status'];
  note: string;
}

function emptyForm(): AdvanceForm {
  return { partyName: '', subject: '', amount: 0, expected: 0, receivedOn: todayISO(), status: 'open', note: '' };
}

/**
 * Avances reçues : argent versé avant livraison. Module volontairement séparé
 * des ventes — une avance n'entre pas dans le total des ventes tant que la
 * commande n'est pas livrée.
 */
export default function Advances() {
  const { t, i18n } = useTranslation();
  const advances = useAdvances();
  const parties = useParties();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AdvanceForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const rows = advances ?? [];
  const clients = (parties ?? []).filter((party) => party.kind === 'client' && !party.archived);
  const fmt = (minor: number) => formatAmount(minor, primary, i18n.language);

  const statusTag = (advance: Advance) =>
    advance.status === 'delivered' ? (
      <Tag tone="green">{t('advances.statusDelivered')}</Tag>
    ) : advance.status === 'refunded' ? (
      <Tag tone="red">{t('advances.statusRefunded')}</Tag>
    ) : (
      <Tag tone="amber">{t('advances.statusOpen')}</Tag>
    );

  const openCreate = () => {
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  };

  const openEdit = (advance: Advance) => {
    setForm({
      id: advance.id,
      partyName: advance.partyName ?? '',
      subject: advance.subject,
      amount: advance.amount,
      expected: advance.expected ?? 0,
      receivedOn: advance.receivedOn,
      status: advance.status,
      note: advance.note ?? '',
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.subject.trim()) {
      setError(t('advances.required'));
      return;
    }
    const matched = clients.find(
      (party) => party.name.trim().toLowerCase() === form.partyName.trim().toLowerCase(),
    );
    const input = {
      partyId: matched?.id,
      partyName: form.partyName,
      subject: form.subject,
      amount: form.amount,
      expected: form.expected,
      receivedOn: form.receivedOn,
      status: form.status,
      note: form.note,
    };
    if (form.id) await updateAdvance(form.id, input);
    else await createAdvance(input);
    setOpen(false);
    setForm(emptyForm());
  };

  return (
    <Page
      title={t('advances.title')}
      actions={
        <button type="button" className={btnPrimary} onClick={openCreate}>
          ＋ {t('advances.new')}
        </button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label={t('advances.totalOpen')} value={fmt(openAdvancesTotal(rows))} />
        <StatCard label={t('advances.totalRemaining')} value={fmt(openAdvancesRemaining(rows))} />
        <StatCard label={t('advances.count', { count: rows.length })} value={String(rows.length)} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState label={t('advances.empty')} icon="💵" />
          <p className="mt-2 text-center text-xs text-sage-600">{t('advances.emptyHint')}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                <th className="py-1.5">{t('advances.date')}</th>
                <th className="py-1.5">{t('advances.client')}</th>
                <th className="py-1.5">{t('advances.subject')}</th>
                <th className="py-1.5 text-right">{t('advances.amount')}</th>
                <th className="py-1.5 text-right">{t('advances.remaining')}</th>
                <th className="py-1.5">{t('advances.status')}</th>
                <th className="py-1.5 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((advance) => (
                <tr key={advance.id} className="border-b border-forest-50">
                  <td className="whitespace-nowrap py-1.5">{advance.receivedOn}</td>
                  <td className="py-1.5 font-medium text-forest-950">{advance.partyName || '—'}</td>
                  <td className="py-1.5">{advance.subject}</td>
                  <td className="py-1.5 text-right font-semibold">{fmt(advance.amount)}</td>
                  <td className="py-1.5 text-right">{fmt(advanceRemaining(advance))}</td>
                  <td className="py-1.5">{statusTag(advance)}</td>
                  <td className="py-1.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="rounded p-1 text-sm hover:bg-forest-50"
                        onClick={() => openEdit(advance)}
                        aria-label={t('common.edit')}
                      >
                        ✎
                      </button>
                      <ConfirmButton
                        label="🗑"
                        confirmLabel={t('advances.deleteConfirm')}
                        cancelLabel={t('common.cancel')}
                        onConfirm={() => void deleteAdvance(advance.id)}
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
      <p className="mt-2 text-xs text-sage-500">{t('advances.hint')}</p>

      <Modal title={form.id ? t('common.edit') : t('advances.new')} open={open} onClose={() => setOpen(false)}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={t('advances.client')}>
            <TextInput
              value={form.partyName}
              onChange={(event) => setForm({ ...form, partyName: event.target.value })}
              maxLength={80}
              list="advance-clients"
            />
            <datalist id="advance-clients">
              {clients.map((party) => (
                <option key={party.id} value={party.name} />
              ))}
            </datalist>
          </Field>
          <Field label={t('advances.subject')}>
            <TextInput
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              maxLength={120}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <MoneyInput
              label={t('advances.amount')}
              amountMinor={form.amount}
              currency={primary}
              onMinor={(minor) => setForm({ ...form, amount: minor })}
            />
            <MoneyInput
              label={t('advances.expected')}
              amountMinor={form.expected}
              currency={primary}
              onMinor={(minor) => setForm({ ...form, expected: minor })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('advances.date')}>
              <TextInput
                type="date"
                value={form.receivedOn}
                onChange={(event) => setForm({ ...form, receivedOn: event.target.value })}
              />
            </Field>
            <Field label={t('advances.status')}>
              <SelectInput
                value={form.status}
                onChange={(value) => setForm({ ...form, status: value as Advance['status'] })}
                options={[
                  { value: 'open', label: t('advances.statusOpen') },
                  { value: 'delivered', label: t('advances.statusDelivered') },
                  { value: 'refunded', label: t('advances.statusRefunded') },
                ]}
              />
            </Field>
          </div>
          <Field label={t('advances.note')}>
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
      </Modal>
    </Page>
  );
}
