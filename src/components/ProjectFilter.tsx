import { useTranslation } from 'react-i18next';
import { useProjects } from '@/hooks/useData';

/**
 * Filtre « chantier » des listes (ventes, achats, dépenses). La valeur vide
 * garde tous les documents ; sinon on ne montre que ceux du chantier choisi.
 * Rien n'est affiché tant qu'aucun chantier n'existe.
 */
export function ProjectFilter({
  value,
  onChange,
  businessId,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Ne proposer que les chantiers de cette activité (facultatif). */
  businessId?: string;
}) {
  const { t } = useTranslation();
  const projects = useProjects();
  const rows = (projects ?? []).filter(
    (project) =>
      !project.archived && (!businessId || !project.businessId || project.businessId === businessId),
  );
  if (rows.length === 0) return null;
  // Un chantier supprimé entre-temps ne doit pas vider la liste sans raison.
  const current = rows.some((project) => project.id === value) ? value : '';
  return (
    <select
      value={current}
      onChange={(event) => onChange(event.target.value)}
      aria-label={t('projects.filterLabel')}
      className="rounded-lg border border-forest-200 bg-white px-2 py-1.5 text-sm text-forest-900"
    >
      <option value="">{t('projects.all')}</option>
      {rows.map((project) => (
        <option key={project.id} value={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  );
}
