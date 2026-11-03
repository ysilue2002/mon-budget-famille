import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, clearAuth, setAuth, type Session } from '@/lib/api';
import { adoptInvitedFamily, type InvitedFamily } from '@/core/join';
import { runSync } from '@/sync/sync';
import { Card, Field, Page, TextInput, btnPrimary } from '@/components/common';

type Mode = 'login' | 'register';

/**
 * Connexion / inscription au foyer.
 * Le jeton est conservé dans localStorage (mbf.auth) et utilisé par apiFetch.
 */
export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Un code d'invitation saisi bascule l'inscription vers le foyer partagé.
  const invited = /^[A-HJKMNP-Z2-9]{8}$/.test(inviteCode.trim().toUpperCase());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body =
        mode === 'login'
          ? { email: email.trim(), password }
          : invited
            // Inscription par invitation : le foyer distant partagé est créé —
            // familyName indifférent, mais le schéma l'exige.
            ? {
                email: email.trim(),
                password,
                name: name.trim(),
                familyName: familyName.trim() || 'Invité',
                invitationCode: inviteCode.trim().toUpperCase(),
              }
            : { email: email.trim(), password, name: name.trim(), familyName: familyName.trim() };
      const session = await apiFetch<Session & { family?: InvitedFamily; role?: string }>(path, {
        method: 'POST',
        body,
      });
      setAuth(session);
      // Adhésion par code : l'appareil adopte le foyer partagé (base locale
      // recréée, pull intégral). Sans code, le foyer local amorcé suffit.
      if (mode === 'register' && invited && session.family) {
        await adoptInvitedFamily(session.family);
        void navigate('/');
        void runSync().catch(() => undefined);
        return;
      }
      void navigate('/');
    } catch {
      setError(t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearAuth();
    setMode('login');
    setEmail('');
    setPassword('');
    void navigate('/');
  };

  return (
    <Page title={t('login.title')}>
      <Card className="mx-auto max-w-md">
        <div className="mb-4 flex rounded-lg border border-forest-200 bg-white text-sm font-semibold">
          {([['login', t('login.tabLogin')], ['register', t('login.tabRegister')]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 px-3 py-2 ${mode === m ? 'bg-forest-600 text-white' : 'text-forest-700 hover:bg-forest-50'}`}
              aria-pressed={mode === m}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <Field label={t('login.name')}>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label={t('login.familyName')}>
                <TextInput
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  required={!invited}
                  minLength={invited ? 0 : 2}
                />
              </Field>
              <Field label={t('login.inviteCode')} hint={t('login.inviteHint')}>
                <TextInput
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={9}
                  inputMode="text"
                />
              </Field>
              {!invited && (
                <p className="text-xs text-sage-600">
                  {t('login.inviteJoin')}{' '}
                  <button type="button" className="underline hover:text-forest-800" onClick={() => void navigate('/join')}>
                    {t('login.joinLink')}
                  </button>
                </p>
              )}
            </>
          )}
          <Field label={t('login.email')}>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('login.password')}>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>

          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

          {mode === 'login' && (
            <p className="text-xs text-sage-600">
              {t('login.forgot')}{' '}
              <button type="button" className="underline hover:text-forest-800" onClick={() => void navigate('/reset')}>
                {t('login.forgotLink')}
              </button>
            </p>
          )}

          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? '…' : mode === 'login' ? t('login.tabLogin') : t('login.tabRegister')}
          </button>

          <button type="button" onClick={logout} className="text-xs text-sage-600 underline hover:text-forest-800">
            {t('login.logout')}
          </button>
        </form>
      </Card>
    </Page>
  );
}
