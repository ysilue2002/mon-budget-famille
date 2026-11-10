import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, getAuth } from '@/lib/api';
import { readSnoozeUntil, shouldRemindRecovery, snoozeReminder } from '@/lib/recoveryReminder';

type State = 'loading' | 'remind' | 'quiet';

/**
 * Bandeau de sécurité : tant qu'aucune phrase de secours n'est enregistrée, on
 * le rappelle après la connexion. Un clic mène aux réglages pour la définir ;
 * « Plus tard » range le rappel trois jours sur cet appareil. Hors connexion,
 * le statut est inconnu : on n'affiche rien plutôt qu'un avertissement faux.
 */
export function RecoveryReminder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('loading');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!getAuth()) return;
    let alive = true;
    void apiFetch<{ set: boolean }>('/api/v1/auth/recovery-phrase')
      .then((status) => {
        if (!alive) return;
        const remind = shouldRemindRecovery({
          set: status.set,
          snoozedUntil: readSnoozeUntil(),
          now: Date.now(),
        });
        setState(remind ? 'remind' : 'quiet');
      })
      .catch(() => {
        if (alive) setState('quiet');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (hidden || state !== 'remind') return null;

  return (
    <div className="no-print px-4 pt-3 lg:px-6 lg:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-900">
        <span>{t('recovery.remindTitle')}</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void navigate('/settings')}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-50"
          >
            {t('recovery.remindAction')}
          </button>
          <button
            type="button"
            onClick={() => {
              snoozeReminder();
              setHidden(true);
            }}
            className="text-xs font-semibold underline hover:text-amber-950"
          >
            {t('recovery.remindLater')}
          </button>
        </span>
      </div>
    </div>
  );
}
