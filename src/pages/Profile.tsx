import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBusinesses, useFamily } from '@/hooks/useData';
import { createBusiness, updateBusiness } from '@/core/repo';
import { currencyLabel } from '@/core/currencies';
import {
  Card,
  EmptyState,
  Field,
  Page,
  Tag,
  TextArea,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

interface ProfileForm {
  name: string;
  ownerName: string;
  activity: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  notes: string;
}

const EMPTY_FORM: ProfileForm = {
  name: '',
  ownerName: '',
  activity: '',
  phone: '',
  email: '',
  address: '',
  taxId: '',
  notes: '',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '👤';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Profil de l'entrepreneur : identité de l'activité (nom commercial, nom de
 * l'entrepreneur, coordonnées, identifiant fiscal). Ces informations sont
 * stockées avec l'activité, donc synchronisées entre les appareils du foyer.
 */
export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const businesses = useBusinesses();
  const family = useFamily();

  const active = (businesses ?? []).filter((business) => !business.archived);
  const [selectedId, setSelectedId] = useState('');
  const selected = active.find((business) => business.id === selectedId) ?? active[0] ?? null;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const openEdit = () => {
    if (!selected) {
      setForm(EMPTY_FORM);
    } else {
      setForm({
        name: selected.name,
        ownerName: selected.ownerName ?? '',
        activity: selected.activity,
        phone: selected.phone ?? '',
        email: selected.email ?? '',
        address: selected.address ?? '',
        taxId: selected.taxId ?? '',
        notes: selected.notes ?? '',
      });
    }
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError(t('profile.nameRequired'));
      return;
    }
    const input = {
      name: form.name,
      ownerName: form.ownerName,
      activity: form.activity,
      phone: form.phone,
      email: form.email,
      address: form.address,
      taxId: form.taxId,
      notes: form.notes,
    };
    if (selected) {
      await updateBusiness(selected.id, input);
    } else {
      const id = await createBusiness(input);
      setSelectedId(id);
    }
    setEditing(false);
  };

  if (businesses === undefined) {
    return (
      <Page title={t('profile.title')}>
        <EmptyState label={t('common.loading')} />
      </Page>
    );
  }

  return (
    <Page
      title={t('profile.title')}
      actions={
        active.length > 0 && !editing ? (
          <button type="button" className={btnGhost} onClick={openEdit}>
            ✎ {t('profile.edit')}
          </button>
        ) : undefined
      }
    >
      {active.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {active.map((business) => (
            <button
              key={business.id}
              type="button"
              onClick={() => {
                setSelectedId(business.id);
                setEditing(false);
              }}
              aria-pressed={business.id === selected?.id}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                business.id === selected?.id
                  ? 'border-forest-600 bg-forest-600 text-white'
                  : 'border-forest-200 bg-white text-forest-800 hover:bg-forest-50'
              }`}
            >
              {business.name}
            </button>
          ))}
        </div>
      )}

      {!selected && !editing ? (
        <Card>
          <EmptyState label={t('profile.empty')} icon="🧑‍💼" />
          <p className="mt-3 text-center text-xs text-sage-600">{t('profile.emptyHint')}</p>
          <div className="mt-4 flex justify-center">
            <button type="button" className={btnPrimary} onClick={openEdit}>
              ＋ {t('profile.create')}
            </button>
          </div>
        </Card>
      ) : editing ? (
        <Card>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('profile.name')}>
                <TextInput
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  maxLength={80}
                  required
                />
              </Field>
              <Field label={t('profile.ownerName')}>
                <TextInput
                  value={form.ownerName}
                  onChange={(event) => setForm({ ...form, ownerName: event.target.value })}
                  maxLength={80}
                />
              </Field>
            </div>
            <Field label={t('profile.activity')}>
              <TextInput
                value={form.activity}
                onChange={(event) => setForm({ ...form, activity: event.target.value })}
                maxLength={120}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('profile.phone')}>
                <TextInput
                  type="tel"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  maxLength={30}
                />
              </Field>
              <Field label={t('profile.email')}>
                <TextInput
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  maxLength={120}
                />
              </Field>
            </div>
            <Field label={t('profile.address')}>
              <TextInput
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
                maxLength={160}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('profile.taxId')}>
                <TextInput
                  value={form.taxId}
                  onChange={(event) => setForm({ ...form, taxId: event.target.value })}
                  maxLength={60}
                />
              </Field>
              <Field label={t('profile.currency')} hint={t('profile.currencyHint')}>
                <TextInput
                  value={family ? `${family.primaryCurrency} — ${currencyLabel(family.primaryCurrency, i18n.language)}` : '—'}
                  readOnly
                  disabled
                />
              </Field>
            </div>
            <Field label={t('profile.notes')}>
              <TextArea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                maxLength={500}
              />
            </Field>
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className={btnPrimary}>
                {t('common.save')}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        selected && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-forest-600 text-xl font-bold text-white"
                >
                  {initials(selected.ownerName || selected.name)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-forest-950">{selected.name}</h2>
                  <p className="text-sm text-sage-600">{selected.ownerName || t('profile.noOwner')}</p>
                  <p className="text-xs text-sage-500">{selected.activity || t('profile.noActivity')}</p>
                </div>
              </div>

              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  { label: t('profile.phone'), value: selected.phone },
                  { label: t('profile.email'), value: selected.email },
                  { label: t('profile.address'), value: selected.address },
                  { label: t('profile.taxId'), value: selected.taxId },
                ].map((row) => (
                  <div key={row.label} className="rounded-lg border border-forest-100 bg-forest-50/40 px-3 py-2">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-sage-600">{row.label}</dt>
                    <dd className="break-words text-sm text-forest-900">{row.value || '—'}</dd>
                  </div>
                ))}
              </dl>

              {selected.notes && (
                <div className="mt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-sage-600">{t('profile.notes')}</p>
                  <p className="whitespace-pre-line text-sm text-forest-900">{selected.notes}</p>
                </div>
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-bold uppercase tracking-wide text-forest-900">{t('profile.account')}</h3>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-sage-600">{t('profile.space')}</dt>
                  <dd>
                    <Tag tone="green">{t('spaces.businessShort')}</Tag>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-sage-600">{t('profile.currency')}</dt>
                  <dd className="font-medium text-forest-900">{family?.primaryCurrency ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-sage-600">{t('profile.language')}</dt>
                  <dd className="font-medium text-forest-900">{t(`profile.languages.${i18n.language.slice(0, 2)}`)}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-sage-600">{t('profile.activities')}</dt>
                  <dd className="font-medium text-forest-900">{active.length}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-sage-500">{t('profile.identityHint')}</p>
            </Card>
          </div>
        )
      )}
    </Page>
  );
}
