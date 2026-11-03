import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { Card, Field, Page, TextInput, btnPrimary } from '@/components/common';

type ResetMode = 'code' | 'phrase';

/**
 * Nouveau mot de passe, SANS authentification, deux voies :
 *
 * - « Code administrateur » : l'administrateur du foyer délivre un code à
 *   usage unique (30 min) relayé hors canal (pas de service d'e-mail).
 * - « Phrase de secours » : la phrase personnelle enregistrée dans les
 *   réglages remplace le code (aucun e-mail, aucun administrateur requis,
 *   même sans foyer). It also restores a family whose owner account was
 *   deleted, within the recovery window.
 */
export default function Reset() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ResetMode>('code');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'code') {
        await apiFetch('/api/v1/auth/reset-confirm', {
          method: 'POST',
          body: {
            email: email.trim(),
            resetCode: code.trim().toUpperCase(),
            newPassword: password,
          },
        });
      } else {
        await apiFetch('/api/v1/auth/recovery-reset', {
          method: 'POST',
          body: {
            email: email.trim(),
            recoveryPhrase: phrase.trim(),
            newPassword: password,
          },
        });
      }
      // Succès : écran de confirmation (aucune session créée).
      setDone(true);
    } catch {
      setError(t(mode === 'code' ? 'reset.error' : 'reset.errorPhrase'));
    } finally {
      setBusy(false);
    }
  };

  const tabClass = (active: boolean) =>
    `rounded-lg border px-4 py-2 text-sm font-semibold transition ${
      active
        ? 'border-forest-600 bg-forest-600 text-white'
        : 'border-forest-200 bg-white text-forest-800 hover:bg-forest-50'
    }`;

  return (
    <Page title={t('reset.title')}>
      <Card className="mx-auto max-w-md">
        {done ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-forest-700">{t('reset.done')}</p>
            <button type="button" className={btnPrimary} onClick={() => navigate('/login')}>
              {t('reset.backToLogin')}
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(e) => void submit(e)}>
            <div className="flex flex-wrap gap-2" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'code'}
                className={tabClass(mode === 'code')}
                onClick={() => {
                  setMode('code');
                  setError(null);
                }}
              >
                {t('reset.modeCode')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'phrase'}
                className={tabClass(mode === 'phrase')}
                onClick={() => {
                  setMode('phrase');
                  setError(null);
                }}
              >
                {t('reset.modePhrase')}
              </button>
            </div>
            {mode === 'code' ? (
              <p className="text-sm text-sage-600">{t('reset.hint')}</p>
            ) : (
              <p className="text-sm text-sage-600">{t('reset.hintPhrase')}</p>
            )}
            <Field label={t('reset.email')}>
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            {mode === 'code' ? (
              <Field label={t('reset.code')}>
                <TextInput
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="H4ML2K8N"
                  className="font-mono uppercase tracking-[0.3em]"
                  autoComplete="one-time-code"
                  required
                />
              </Field>
            ) : (
              <Field label={t('reset.phrase')}>
                <TextInput
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  autoComplete="off"
                  required
                />
              </Field>
            )}
            <Field label={t('reset.password')}>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
            {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" className={btnPrimary} disabled={busy}>
                {busy ? '…' : t('reset.submit')}
              </button>
              <button type="button" className="text-sm font-semibold underline text-forest-700" onClick={() => navigate('/login')}>
                {t('reset.backToLogin')}
              </button>
            </div>
          </form>
        )}
      </Card>
    </Page>
  );
}
