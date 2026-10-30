import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, clearAuth, setAuth, type Session } from '@/lib/api';
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
      const body =
        mode === 'login'
          ? { email: email.trim(), password }
          : { email: email.trim(), password, name: name.trim(), familyName: familyName.trim() };
      const session = await apiFetch<Session>(path, { method: 'POST', body });
      setAuth(session);
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
                <TextInput value={familyName} onChange={(e) => setFamilyName(e.target.value)} required minLength={2} />
              </Field>
            </>
          )}
          <Field label={t('login.email')}>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t('login.password')}>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>

          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

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
