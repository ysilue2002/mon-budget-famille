import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAdvances,
  useBusinesses,
  useParties,
  usePrimaryCurrency,
  useProducts,
  useProjects,
  usePurchases,
  useSales,
  useTransactions,
} from '@/hooks/useData';
import { createProject, deleteProject, updateProject } from '@/core/repo';
import { projectEntries, projectTotals, sortedProjects } from '@/core/projects';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import type { Project } from '@/core/types';
import {
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  Modal,
  Page,
  SelectInput,
  StatCard,
  Tag,
  TextArea,
  TextInput,
  btnGhost,
  btnPrimary,
} from '@/components/common';

interface ProjectForm {
  id?: string;
  businessId: string;
  name: string;
  partyName: string;
  startDate: string;
  endDate: string;
  status: Project['status'];
  note: string;
}

function emptyForm(): ProjectForm {
  return {
    businessId: '',
    name: '',
    partyName: '',
    startDate: todayISO(),
    endDate: '',
    status: 'open',
    note: '',
  };
}

const ENTRY_ICONS: Record<'sale' | 'purchase' | 'expense' | 'advance', string> = {
  sale: '🛒',
  purchase: '📥',
  expense: '🧾',
  advance: '💵',
};

/**
 * Chantiers : chaque travail (maison, toiture, réparation, commande) regroupe
 * ses ventes, ses achats, ses dépenses et ses acomptes pour dire s'il est
 * rentable. Un chantier ne crée aucune écriture : il étiquette l'existant.
 */
export default function Projects() {
  const { t, i18n } = useTranslation();
  const projects = useProjects();
  const sales = useSales();
  const purchases = usePurchases();
  const transactions = useTransactions();
  const advances = useAdvances();
  const products = useProducts();
  const parties = useParties();
  const businesses = useBusinesses();
  const primary = usePrimaryCurrency() ?? 'XOF';

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const fmt = (minor: number) => formatAmount(minor, primary, i18n.language);

  const books = useMemo(
    () => ({
      sales: sales ?? [],
      purchases: purchases ?? [],
      transactions: transactions ?? [],
      advances: advances ?? [],
      products: products ?? [],
    }),
    [sales, purchases, transactions, advances, products],
  );

  const activeBusinesses = (businesses ?? []).filter((business) => !business.archived);
  const clients = (parties ?? []).filter((party) => party.kind === 'client' && !party.archived);
  const rows = sortedProjects(projects ?? []);
  const summary = (id: string) => projectTotals(id, books);

  const totals = rows.reduce(
    (acc, project) => {
      const value = summary(project.id);
      if (project.status === 'open' && !project.archived) {
        acc.sales += value.salesHt;
        acc.margin += value.margin;
        acc.advances += value.advancesReceived;
      }
      return acc;
    },
    { sales: 0, margin: 0, advances: 0 },
  );

  const openCreate = () => {
    setForm({ ...emptyForm(), businessId: activeBusinesses[0]?.id ?? '' });
    setError(null);
    setOpen(true);
  };

  const openEdit = (project: Project) => {
    setForm({
      id: project.id,
      businessId: project.businessId ?? '',
      name: project.name,
      partyName: project.partyName ?? '',
      startDate: project.startDate,
      endDate: project.endDate ?? '',
      status: project.status,
      note: project.note ?? '',
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError(t('projects.nameRequired'));
      return;
    }
    const matched = clients.find(
      (party) => party.name.trim().toLowerCase() === form.partyName.trim().toLowerCase(),
    );
    const input = {
      businessId: form.businessId || undefined,
      name: form.name,
      partyId: matched?.id,
      partyName: form.partyName,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
      note: form.note,
    };
    if (form.id) await updateProject(form.id, input);
    else await createProject(input);
    setOpen(false);
    setForm(emptyForm());
  };

  const statusTag = (project: Project) =>
    project.status === 'done' ? (
      <Tag tone="sage">{t('projects.statusDone')}</Tag>
    ) : (
      <Tag tone="amber">{t('projects.statusOpen')}</Tag>
    );

  return (
    <Page
      title={t('projects.title')}
      actions={
        <button type="button" className={btnPrimary} onClick={openCreate}>
          ＋ {t('projects.new')}
        </button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('projects.openCount')}
          value={String(rows.filter((project) => !project.archived && project.status === 'open').length)}
          hint={t('projects.openCountHint')}
        />
        <StatCard label={t('projects.openSales')} value={fmt(totals.sales)} hint={t('projects.openHint')} />
        <StatCard
          label={t('projects.openMargin')}
          value={fmt(totals.margin)}
          valueClass={totals.margin >= 0 ? 'text-forest-700' : 'text-red-600'}
          hint={t('projects.marginHint')}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState label={t('projects.empty')} icon="🏗️" />
          <p className="mt-2 text-center text-xs text-sage-600">{t('projects.emptyHint')}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((project) => {
            const value = summary(project.id);
            const entries = projectEntries(project.id, books);
            const business = activeBusinesses.find((row) => row.id === project.businessId);
            return (
              <Card key={project.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-forest-950">{project.name}</h2>
                      {statusTag(project)}
                    </div>
                    <p className="text-xs text-sage-600">
                      {project.partyName || t('projects.noClient')}
                      {' · '}
                      {project.startDate}
                      {project.endDate ? ` → ${project.endDate}` : ''}
                      {business ? ` · ${business.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded p-1 text-sm hover:bg-forest-50"
                      onClick={() => openEdit(project)}
                      aria-label={t('common.edit')}
                    >
                      ✎
                    </button>
                    <ConfirmButton
                      label="🗑"
                      confirmLabel={t('projects.deleteConfirm')}
                      cancelLabel={t('common.cancel')}
                      onConfirm={() => void deleteProject(project.id)}
                      danger
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg border border-forest-100 bg-forest-50/40 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-sage-600">{t('projects.sales')}</p>
                    <p className="font-semibold text-forest-900">{fmt(value.salesHt)}</p>
                    <p className="text-[11px] text-sage-500">
                      {t('projects.salesSplit', { labor: fmt(value.laborHt), supplies: fmt(value.suppliesHt) })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-forest-100 bg-forest-50/40 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-sage-600">{t('projects.purchases')}</p>
                    <p className="font-semibold text-forest-900">{fmt(value.purchasesHt)}</p>
                    <p className="text-[11px] text-sage-500">{t('projects.purchasesHint')}</p>
                  </div>
                  <div className="rounded-lg border border-forest-100 bg-forest-50/40 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-sage-600">{t('projects.expenses')}</p>
                    <p className="font-semibold text-forest-900">{fmt(value.expenses)}</p>
                    <p className="text-[11px] text-sage-500">{t('projects.advancesShort', { value: fmt(value.advancesReceived) })}</p>
                  </div>
                  <div className="rounded-lg border border-forest-100 bg-forest-50/40 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-sage-600">{t('projects.margin')}</p>
                    <p className={`font-bold ${value.margin >= 0 ? 'text-forest-700' : 'text-red-600'}`}>
                      {fmt(value.margin)}
                    </p>
                    <p className="text-[11px] text-sage-500">
                      {value.due > 0 ? t('projects.dueShort', { value: fmt(value.due) }) : t('projects.paidUp')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {([
                    ['sales', '🛒'],
                    ['purchases', '📥'],
                    ['expenses', '🧾'],
                  ] as const).map(([route, icon]) => (
                    <Link
                      key={route}
                      to={`/${route}?chantier=${project.id}`}
                      className="rounded-lg border border-forest-200 px-2 py-1 text-xs font-medium capitalize text-forest-800 hover:bg-forest-50"
                    >
                      {icon} {t(`nav.${route}`)}
                    </Link>
                  ))}
                </div>

                {project.note && <p className="text-xs text-sage-600">{project.note}</p>}

                <details className="rounded-lg border border-forest-100">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-forest-800">
                    {t('projects.entries', { count: entries.length })}
                  </summary>
                  {entries.length === 0 ? (
                    <p className="px-3 pb-3 text-xs text-sage-600">{t('projects.noEntries')}</p>
                  ) : (
                    <ul className="divide-y divide-forest-50 px-3 pb-2 text-sm">
                      {entries.map((entry) => (
                        <li key={`${entry.kind}-${entry.id}`} className="flex items-center justify-between gap-2 py-1.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <span aria-hidden>{ENTRY_ICONS[entry.kind]}</span>
                            <span className="truncate text-forest-900">{entry.label || t(`projects.kinds.${entry.kind}`)}</span>
                            <span className="shrink-0 text-xs text-sage-500">{entry.date}</span>
                          </span>
                          <span className="shrink-0 font-semibold text-forest-900">{fmt(entry.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-sage-500">{t('projects.hint')}</p>

      <Modal title={form.id ? t('common.edit') : t('projects.new')} open={open} onClose={() => setOpen(false)}>
        <form
          className="flex max-h-[75vh] flex-col gap-3 overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label={t('projects.name')}>
            <TextInput
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t('projects.nameHint')}
              maxLength={80}
              required
            />
          </Field>
          <Field label={t('projects.client')}>
            <TextInput
              value={form.partyName}
              onChange={(event) => setForm({ ...form, partyName: event.target.value })}
              maxLength={80}
              list="project-clients"
            />
            <datalist id="project-clients">
              {clients.map((party) => (
                <option key={party.id} value={party.name} />
              ))}
            </datalist>
          </Field>
          {activeBusinesses.length > 1 && (
            <Field label={t('projects.business')}>
              <SelectInput
                value={form.businessId}
                onChange={(value) => setForm({ ...form, businessId: value })}
                options={activeBusinesses.map((business) => ({ value: business.id, label: business.name }))}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('projects.startDate')}>
              <TextInput
                type="date"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </Field>
            <Field label={t('projects.endDate')}>
              <TextInput
                type="date"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </Field>
          </div>
          <Field label={t('projects.status')}>
            <SelectInput
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value as Project['status'] })}
              options={[
                { value: 'open', label: t('projects.statusOpen') },
                { value: 'done', label: t('projects.statusDone') },
              ]}
            />
          </Field>
          <Field label={t('projects.note')}>
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
