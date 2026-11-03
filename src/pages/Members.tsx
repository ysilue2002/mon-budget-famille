import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import {
  assignTransactionMember,
  createMember,
  deleteMember,
  renameMember,
  syncMemberNames,
} from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { getAuth, apiFetch } from '@/lib/api';
import { useFamily } from '@/hooks/useData';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Page,
  SelectInput,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';
import type { CurrencyCode, HouseholdMember, Transaction } from '@/core/types';

interface MemberStats {
  member: HouseholdMember;
  count: number;
  income: number;
  expense: number;
}

/** Ligne de membre avec renommage en place. */
function MemberRow({
  stats,
  primary,
  onRename,
  onDelete,
}: {
  stats: MemberStats;
  primary: CurrencyCode;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const [draft, setDraft] = useState(stats.member.name);
  const dirty = draft.trim() !== stats.member.name && draft.trim().length > 0;

  return (
    <tr className="table-row-hover border-b border-forest-50">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <TextInput
            value={draft}
            aria-label={t('members.name')}
            onChange={(e) => setDraft(e.target.value)}
            className="max-w-[14rem]"
          />
          {dirty && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                onRename(draft.trim());
                setDraft(draft.trim());
              }}
            >
              {t('common.save')}
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-sage-600">{stats.count}</td>
      <td className="px-3 py-2 text-right font-medium text-forest-700">
        {formatAmount(stats.income, primary, lang)}
      </td>
      <td className="px-3 py-2 text-right font-medium text-red-600">
        {formatAmount(stats.expense, primary, lang)}
      </td>
      <td className="px-3 py-2 text-right">
        <ConfirmButton
          danger
          label={t('common.delete')}
          confirmLabel={t('members.deleteConfirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={onDelete}
        />
      </td>
    </tr>
  );
}

/** Carte d'invitation : génère un code à usage unique valable 7 jours. */
function InviteCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const isAdmin = getAuth()?.user.role === 'admin';
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isAdmin) return null;

  const createInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<{ code: string; expiresAt: string }>('/api/v1/auth/invite', { method: 'POST' });
      setInvite(created);
    } catch {
      setError(t('members.inviteError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-forest-950">{t('members.inviteTitle')}</h2>
          <p className="text-xs text-sage-600">{t('members.inviteHint')}</p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => void createInvite()} disabled={busy}>
          {busy ? '…' : t('members.inviteCreate')}
        </button>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
      {invite && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-forest-200 bg-forest-50 p-2">
          <code className="flex-1 font-mono text-lg tracking-[0.3em] text-forest-800">{invite.code}</code>
          <span className="text-xs text-sage-600">
            {t('members.inviteExpires', {
              date: new Date(invite.expiresAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US'),
            })}
          </span>
          <button
            type="button"
            className="text-xs font-semibold underline text-forest-700 hover:text-forest-900"
            onClick={() => void navigator.clipboard?.writeText(invite.code)}
          >
            {t('members.inviteCopy')}
          </button>
        </div>
      )}
    </Card>
  );
}

/** Carte admin : délivre un code de réinitialisation (30 min, usage unique). */
function ResetCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const isAdmin = getAuth()?.user.role === 'admin';
  const [email, setEmail] = useState('');
  const [reset, setReset] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isAdmin) return null;

  const createReset = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<{ code: string; expiresAt: string }>('/api/v1/auth/reset', {
        method: 'POST',
        body: { email: email.trim() },
      });
      setReset(created);
      setEmail('');
    } catch (e) {
      setError(e instanceof Error && /\b404\b/.test(e.message) ? t('members.resetNotFound') : t('members.resetError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-forest-950">{t('members.resetTitle')}</h2>
          <p className="text-xs text-sage-600">{t('members.resetHint')}</p>
        </div>
        <button type="button" className={btnPrimary} onClick={() => void createReset()} disabled={busy || email.trim().length === 0}>
          {busy ? '…' : t('members.resetCreate')}
        </button>
      </div>
      <div className="mt-3">
        <Field label={t('members.resetEmail')}>
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
      {reset && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-forest-200 bg-forest-50 p-2">
          <code className="flex-1 font-mono text-lg tracking-[0.3em] text-forest-800">{reset.code}</code>
          <span className="text-xs text-sage-600">
            {t('members.resetExpires', {
              date: new Date(reset.expiresAt).toLocaleTimeString(lang === 'fr' ? 'fr-FR' : 'en-US', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </span>
          <button
            type="button"
            className="text-xs font-semibold underline text-forest-700 hover:text-forest-900"
            onClick={() => void navigator.clipboard?.writeText(reset.code)}
          >
            {t('members.inviteCopy')}
          </button>
        </div>
      )}
    </Card>
  );
}

function Members() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const family = useFamily();
  const primary = family?.primaryCurrency ?? 'XOF';
  const members = useLiveQuery(async () => {
    const rows = await db.members.toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Les noms déjà utilisés par des opérations (import, autre appareil) sont
  // ajoutés à la liste au premier affichage.
  useEffect(() => {
    void syncMemberNames();
  }, []);

  const stats = useMemo<MemberStats[]>(() => {
    const rows = (members ?? []).map((member) => ({ member, count: 0, income: 0, expense: 0 }));
    const byName = new Map(rows.map((row) => [row.member.name, row]));
    for (const tx of transactions ?? []) {
      if (tx.type === 'transfer') continue;
      const row = tx.member ? byName.get(tx.member) : undefined;
      if (!row) continue;
      row.count += 1;
      if (tx.type === 'income') row.income += tx.amountInPrimary;
      else row.expense += tx.amountInPrimary;
    }
    return rows;
  }, [members, transactions]);

  const unassigned = useMemo(
    () => (transactions ?? []).filter((tx) => !tx.member && tx.type !== 'transfer').slice(0, 20),
    [transactions],
  );

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('members.nameRequired'));
      return;
    }
    if ((members ?? []).some((member) => member.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(t('members.duplicate'));
      return;
    }
    setError(null);
    await createMember(trimmed);
    setName('');
  };

  return (
    <Page title={t('members.title')}>
      <InviteCard />
      <ResetCard />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Field label={t('members.name')} error={error} hint={t('members.hint')}>
              <TextInput
                value={name}
                placeholder={t('members.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void add();
                  }
                }}
              />
            </Field>
          </div>
          <button type="button" className={`${btnPrimary} mb-1`} onClick={() => void add()}>
            {t('members.add')}
          </button>
        </div>
      </Card>

      <Card className="mb-4 p-0">
        {stats.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="👥" label={t('members.empty')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-100 text-left text-xs uppercase text-sage-600">
                  <th className="px-3 py-2">{t('members.name')}</th>
                  <th className="px-3 py-2 text-right">{t('statements.count')}</th>
                  <th className="px-3 py-2 text-right">{t('reports.incomeTotal')}</th>
                  <th className="px-3 py-2 text-right">{t('reports.expenseTotal')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <MemberRow
                    key={row.member.id}
                    stats={row}
                    primary={primary}
                    onRename={(next) => void renameMember(row.member.id, next)}
                    onDelete={() => void deleteMember(row.member.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-forest-900">
          {t('members.unassignedTitle')}
        </h2>
        <p className="mb-3 text-xs text-sage-600">{t('members.unassignedHint')}</p>
        {unassigned.length === 0 ? (
          <p className="text-sm text-sage-600">{t('members.unassignedEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-100 text-left text-xs uppercase text-sage-600">
                  <th className="px-3 py-2">{t('common.date')}</th>
                  <th className="px-3 py-2">{t('common.note')}</th>
                  <th className="px-3 py-2 text-right">{t('common.amount')}</th>
                  <th className="px-3 py-2">{t('statements.member')}</th>
                </tr>
              </thead>
              <tbody>
                {unassigned.map((tx: Transaction) => (
                  <tr key={tx.id} className="table-row-hover border-b border-forest-50">
                    <td className="whitespace-nowrap px-3 py-2">{tx.date}</td>
                    <td className="px-3 py-2 text-sage-700">{tx.note ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      {formatAmount(tx.type === 'income' ? tx.amountInPrimary : -tx.amountInPrimary, primary, lang)}
                    </td>
                    <td className="px-3 py-2">
                      <SelectInput
                        label={t('statements.member')}
                        value=""
                        onChange={(value) => void assignTransactionMember(tx.id, value || undefined)}
                        options={[
                          { value: '', label: '—' },
                          ...(members ?? []).map((member) => ({ value: member.name, label: member.name })),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}

export default Members;
