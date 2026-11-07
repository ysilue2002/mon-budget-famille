import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, clearAuth, setAuth, type Session } from '@/lib/api';
import { adoptInvitedFamily, type InvitedFamily } from '@/core/join';
import { businessProfilesFromRegistration } from '@/core/onboarding';
import { createBusiness, updateFamilyProfile } from '@/core/repo';
import type { CurrencyCode } from '@/core/types';
import { runSync } from '@/sync/sync';
import { clearOfflineMode, setOfflineMode } from '@/lib/session';
import { useSpace } from '@/spaces/space';
import { Card, CurrencySelect, Field, Page, TextInput, btnGhost, btnPrimary } from '@/components/common';

type Mode = 'login' | 'register';

/** Nombre maximal de natures d'activité saisies à l'inscription. */
const MAX_ACTIVITIES = 6;

/**
 * Connexion / inscription, adaptée à l'espace choisi juste avant.
 *
 * - Espace « budget familial » : foyer, devise et compte.
 * - Espace « activité » : en plus, le profil de l'entrepreneur, la nature des
 *   activités (ou leur ajout au fur et à mesure) et les coordonnées imprimées
 *   sur les devis et factures. Ces informations deviennent l'activité locale
 *   (synchronisée ensuite entre les appareils).
 *
 * Le jeton est conservé dans localStorage (mbf.auth) et utilisé par apiFetch.
 */
export default function Login() {
  const { t } = useTranslation();
  const { space } = useSpace();
  const navigate = useNavigate();
  const isBusiness = space === 'business';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  // Espace activité uniquement : profil, coordonnées et natures exercées.
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [taxId, setTaxId] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('XOF');
  const [activities, setActivities] = useState<string[]>(['']);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Un code d'invitation saisi bascule l'inscription vers le foyer partagé.
  const invited = /^[A-HJKMNP-Z2-9]{8}$/.test(inviteCode.trim().toUpperCase());

  const updateActivity = (index: number, value: string) => {
    setActivities((rows) => rows.map((row, position) => (position === index ? value : row)));
  };
  const addActivity = () => {
    setActivities((rows) => (rows.length >= MAX_ACTIVITIES ? rows : [...rows, '']));
  };
  const removeActivity = (index: number) => {
    setActivities((rows) => (rows.length <= 1 ? [''] : rows.filter((_, position) => position !== index)));
  };

  /** Applique localement le profil et l'activité issus de l'inscription. */
  const applyLocalProfile = async () => {
    // Le compte est créé : un souci purement local ne doit pas faire échouer
    // l'inscription, d'où le journal plutôt que la remontée d'erreur.
    await updateFamilyProfile({ name: familyName.trim(), primaryCurrency: currency }).catch((error: unknown) =>
      console.error('profil local', error),
    );
    if (!isBusiness) return;
    const profiles = businessProfilesFromRegistration({
      company: familyName,
      ownerName: name,
      phone: companyPhone.trim() || phone.trim(),
      email: companyEmail.trim() || email.trim(),
      address,
      taxId,
      activities,
    });
    for (const profile of profiles) {
      await createBusiness(profile).catch((error: unknown) => console.error('activité locale', error));
    }
  };

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
            : {
                email: email.trim(),
                password,
                name: name.trim(),
                familyName: familyName.trim(),
                primaryCurrency: currency,
              };
      const session = await apiFetch<Session & { family?: InvitedFamily; role?: string }>(path, {
        method: 'POST',
        body,
      });
      setAuth(session);
      // Adhésion par code : l'appareil adopte le foyer partagé (base locale
      // recréée, pull intégral). Sans code, le foyer local amorcé est complété
      // avec la devise et l'activité saisies.
      if (mode === 'register' && invited && session.family) {
        await adoptInvitedFamily(session.family);
        void navigate('/', { replace: true });
        void runSync().catch(() => undefined);
        return;
      }
      if (mode === 'register') {
        await applyLocalProfile();
      }
      void navigate('/', { replace: true });
    } catch {
      setError(t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearAuth();
    clearOfflineMode();
    setMode('login');
    setEmail('');
    setPassword('');
    void navigate('/login', { replace: true });
  };

  const registerTab = isBusiness ? t('login.tabRegisterBusiness') : t('login.tabRegister');

  return (
    <Page title={isBusiness ? t('login.businessTitle') : t('login.familyTitle')}>
      <Card className="mx-auto max-w-2xl">
        <p className="mb-4 text-sm text-sage-600">{isBusiness ? t('login.businessIntro') : t('login.familyIntro')}</p>

        <div className="mb-4 flex rounded-lg border border-forest-200 bg-white text-sm font-semibold">
          {(
            [
              ['login', t('login.tabLogin')],
              ['register', registerTab],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`flex-1 px-3 py-2 ${mode === value ? 'bg-forest-600 text-white' : 'text-forest-700 hover:bg-forest-50'}`}
              aria-pressed={mode === value}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-3" onSubmit={submit}>
          {mode === 'register' && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">
                {isBusiness ? t('login.companySection') : t('login.familySection')}
              </p>
              <Field label={isBusiness ? t('login.company') : t('login.familyName')} hint={isBusiness ? t('login.companyHint') : undefined}>
                <TextInput
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  required={!invited}
                  minLength={invited ? 0 : 2}
                  maxLength={80}
                />
              </Field>

              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-sage-600">{t('login.profileSection')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('login.name')}>
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
                </Field>
                <Field label={t('login.phone')}>
                  <TextInput
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={30}
                    autoComplete="tel"
                  />
                </Field>
              </div>

              {isBusiness && (
                <>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-sage-600">
                    {t('login.docContact')}
                  </p>
                  <Field label={t('login.address')}>
                    <TextInput
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      maxLength={160}
                      autoComplete="street-address"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t('login.companyPhone')}>
                      <TextInput
                        type="tel"
                        value={companyPhone}
                        onChange={(e) => setCompanyPhone(e.target.value)}
                        maxLength={30}
                        placeholder={phone}
                      />
                    </Field>
                    <Field label={t('login.companyEmail')}>
                      <TextInput
                        type="email"
                        value={companyEmail}
                        onChange={(e) => setCompanyEmail(e.target.value)}
                        maxLength={120}
                        placeholder={email}
                      />
                    </Field>
                  </div>
                  <Field label={t('login.taxId')}>
                    <TextInput value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={60} />
                  </Field>

                  <Field label={t('login.activities')} hint={t('login.activitiesHint')}>
                    <div className="flex flex-col gap-2">
                      {activities.map((row, index) => (
                        <div key={index} className="flex gap-2">
                          <TextInput
                            value={row}
                            onChange={(e) => updateActivity(index, e.target.value)}
                            placeholder={t('login.activityPlaceholder')}
                            maxLength={120}
                            className="flex-1"
                          />
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => removeActivity(index)}
                            aria-label={t('login.removeActivity')}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className={`${btnGhost} self-start`}
                        onClick={addActivity}
                        disabled={activities.length >= MAX_ACTIVITIES}
                      >
                        ＋ {t('login.addActivity')}
                      </button>
                    </div>
                  </Field>
                </>
              )}

              <Field label={t('login.currency')} hint={t('login.currencyHint')}>
                <CurrencySelect value={currency} onChange={setCurrency} className="w-full" />
              </Field>

              <p className="text-xs text-sage-600">{t('login.laterHint')}</p>

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
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label={t('login.password')}>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
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
            {busy ? '…' : mode === 'login' ? t('login.tabLogin') : registerTab}
          </button>

          <button type="button" onClick={logout} className="text-xs text-sage-600 underline hover:text-forest-800">
            {t('login.logout')}
          </button>
          <button
            type="button"
            onClick={() => {
              setOfflineMode();
              void navigate('/', { replace: true });
            }}
            className="text-xs text-sage-500 underline hover:text-forest-800"
          >
            {t('login.continueOffline')}
          </button>
        </form>
      </Card>
    </Page>
  );
}
