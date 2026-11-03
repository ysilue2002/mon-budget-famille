import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, apiFetch } from '@/lib/api';
import { adoptInvitedFamily, joinFailureReason, type InvitedFamily } from '@/core/join';
import { runSync } from '@/sync/sync';
import { Card, Page, TextInput, btnPrimary } from '@/components/common';

/** Le code se saisit avec ou sans tiret, casse libre : normalisation stricte. */
function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-HJKMNP-Z2-9]/g, '');
}

/**
 * Rejoindre un foyer existant via un code d'invitation (utilisateur connecté).
 * Les données locales de cet appareil sont abandonnées : le foyer distant les
 * remplace (pull depuis le curseur 0), d'où la confirmation explicite.
 */
export default function Join() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = normalizeCode(code);
    if (!/^[A-HJKMNP-Z2-9]{8}$/.test(normalized)) {
      setError(t('join.error.format'));
      return;
    }
    if (!window.confirm(t('join.confirm'))) return;
    setBusy(true);
    try {
      const outcome = await apiFetch<{ family: InvitedFamily; role: string }>('/api/v1/auth/join', {
        method: 'POST',
        body: { invitationCode: normalized },
      });
      await adoptInvitedFamily(outcome.family);
      void navigate('/');
      void runSync().catch(() => undefined);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        const reason = joinFailureReason(submitError.status, submitError.body);
        setError(reason ? t(`join.error.${reason}`) : t('join.error.network'));
      } else {
        setError(t('join.error.network'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('join.title')}>
      <Card className="mx-auto max-w-md">
        <p className="mb-4 text-sm text-sage-600">{t('join.hint')}</p>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <label className="text-sm font-semibold text-forest-900" htmlFor="join-code">
            {t('join.code')}
          </label>
          <TextInput
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD1234"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={9}
            required
          />
          {error && <p className="text-sm font-medium text-red-700">{error}</p>}
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? '…' : t('join.submit')}
          </button>
          <button
            type="button"
            className="text-xs text-sage-600 underline hover:text-forest-800"
            onClick={() => void navigate('/')}
          >
            {t('common.back')}
          </button>
        </form>
      </Card>
    </Page>
  );
}
