import { useTranslation } from 'react-i18next';
import { useProjects } from '@/hooks/useData';
import { Field, SelectInput } from '@/components/common';

/**
 * Choix du chantier dans un formulaire (vente, achat, devis, dépense, acompte).
 * Les chantiers de l'activité choisie sont proposés, plus ceux sans activité.
 * La valeur vide vaut « aucun chantier » : le document n'est rattaché à rien.
 */
export function ProjectSelect({
  value,
  onChange,
  businessId,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Activité du document : ne garder que ses chantiers (facultatif). */
  businessId?: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const projects = useProjects();
  const rows = (projects ?? []).filter(
    (project) =>
      !project.archived &&
      (!businessId || !project.businessId || project.businessId === businessId),
  );
  return (
    <Field label={label ?? t('projects.choose')}>
      <SelectInput
        value={value}
        onChange={onChange}
        options={[
          { value: '', label: t('projects.none') },
          ...rows.map((project) => ({
            value: project.id,
            label: project.partyName ? `${project.name} — ${project.partyName}` : project.name,
          })),
        ]}
      />
    </Field>
  );
}
