import { getAuth, apiFetch } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFamily, useRates } from '@/hooks/useData';
import { deleteAccountRemotely } from '@/core/account';
import { useSync } from '@/sync/SyncProvider';
import { updateFamilyProfile } from '@/core/repo';
import {
  BackupError,
  backupFileName,
  backupToJson,
  exportBackup,
  parseBackup,
  restoreBackup,
} from '@/core/backup';
import { setLanguage, LANGUAGES, LANGUAGE_LABELS, type Language } from '@/i18n';
import { currencyLabel } from '@/core/currencies';
import { RATES_API_URL } from '@/core/exchange';
import type { CurrencyCode } from '@/core/types';
import { Card, CurrencySelect, Field, Page, Tag, TextInput, btnPrimary } from '@/components/common';

/** Carte destructive : suppression du compte (et foyers devenus vides). */
function DangerCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [typing, setTyping] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = getAuth();
  if (!auth) return null;
  const confirmed = confirmText.trim().toUpperCase() === auth.user.email.trim().toUpperCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccountRemotely();
      navigate('/login');
    } catch {
      setError(t('settings.deleteAccountError'));
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-4 font-semibold text-red-700">{t('settings.deleteAccountTitle')}</h2>
      <p className="text-sm text-sage-600">{t('settings.deleteAccountHint')}</p>
      {typing ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label={t('settings.deleteAccountType')} hint={auth.user.email}>
            <TextInput value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              disabled={!confirmed || busy}
              onClick={() => void remove()}
            >
              {busy ? '…' : t('settings.deleteAccountConfirm')}
            </button>
            <button
              type="button"
              className="text-sm font-semibold underline text-forest-700"
              onClick={() => {
                setTyping(false);
                setConfirmText('');
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="mt-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          onClick={() => setTyping(true)}
        >
          {t('settings.deleteAccountStart')}
        </button>
      )}
      {error && (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

/**
 * Carte « Phrase de secours » : la phrase remplace le code d'administrateur
 * en cas de mot de passe perdu (aucun e-mail, aucun admin requis), et sert
 * à reprendre un foyer en attente de récupération (30 jours) après une
 * suppression de compte. Elle est générée sur l'appareil et n'arrive sur le
 * serveur qu'une fois, hachée en bcrypt : le serveur ne peut pas la relire.
 */
function RecoveryCard() {
  const { t } = useTranslation();
  const [set, setSet] = useState<boolean | null>(null);
  const [phrase, setPhrase] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auth = getAuth();

  useEffect(() => {
    if (!auth) return;
    void apiFetch<{ set: boolean }>('/api/v1/auth/recovery-phrase')
      .then((status) => setSet(status.set))
      .catch(() => setSet(null));
  }, [auth]);

  if (set === null) return null;

  // Phrase de secours générée LOCALEMENT (22 caractères) : le serveur ne
  // voit qu'un bcrypt ; personne ne peut la relire ni l'écho.
  const generate = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const generated = btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
    setPhrase(generated);
    setCopied(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponible (PWA non sécurisée ?) : la phrase reste affichée.
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/v1/auth/recovery-phrase', {
        method: 'POST',
        body: { recoveryPhrase: phrase.trim() },
      });
      setSet(true);
      setPhrase('');
      setMessage(t('recovery.success'));
    } catch {
      setError(t('recovery.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-4 font-semibold text-forest-950">{t('recovery.title')}</h2>
      <p className="text-sm text-sage-600">{t('recovery.hint')}</p>
      <p className="mt-2 text-sm font-medium" role="status">
        {set ? (
          <span className="text-forest-700">✔ {t('recovery.set')}</span>
        ) : (
          <span className="text-red-600">⚠ {t('recovery.notSet')}</span>
        )}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <Field label={t('recovery.label')}>
          <TextInput
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={t('recovery.placeholder')}
            autoComplete="off"
            minLength={16}
            required
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="text-sm font-semibold underline text-forest-700" onClick={generate}>
            {t('recovery.generate')}
          </button>
          {phrase && (
            <button type="button" className="text-sm font-semibold underline text-forest-700" onClick={() => void copy()}>
              {copied ? `✔ ${t('recovery.copied')}` : t('recovery.copy')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btnPrimary}
            disabled={busy || phrase.trim().length < 16}
            onClick={() => void save()}
          >
            {busy ? '…' : set ? t('recovery.replace') : t('recovery.save')}
          </button>
        </div>
        {message && <p className="text-sm font-medium text-forest-600" role="status">✔ {message}</p>}
        {error && <p className="text-sm font-medium text-red-600" role="alert">{error}</p>}
      </div>
    </Card>
  );
}

function Settings() {
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const rates = useRates();
  const { online, pending, lastSyncAt, syncNow } = useSync();

  const [name, setName] = useState('');
  const [primary, setPrimary] = useState<CurrencyCode>('XOF');
  const [saved, setSaved] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (family) {
      setName(family.name);
      setPrimary(family.primaryCurrency);
    }
  }, [family]);

  const save = async () => {
    if (!family) return;
    await updateFamilyProfile({ name: name.trim() || family.name, primaryCurrency: primary });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const countOf = (counts: Record<string, number>) => Object.values(counts).reduce((total, n) => total + n, 0);

  /** Télécharge un fichier JSON du foyer complet (aucune donnée ne quitte l'appareil). */
  const downloadBackup = async () => {
    try {
      const backup = await exportBackup();
      const blob = new Blob([backupToJson(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFileName();
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupError(null);
      setBackupMessage(t('settings.backupExported', { count: countOf(backup.counts) }));
    } catch {
      setBackupMessage(null);
      setBackupError(t('settings.backupExportFailed'));
    }
  };

  /** Restaure un fichier : chaque enregistrement repasse par la file de synchronisation. */
  const importBackup = async (file: File) => {
    try {
      const backup = parseBackup(await file.text());
      const total = countOf(backup.counts);
      if (!window.confirm(t('settings.backupConfirm', { count: total }))) return;
      const report = await restoreBackup(backup);
      setBackupError(null);
      setBackupMessage(
        t('settings.backupRestored', { created: report.created, updated: report.updated, skipped: report.skipped }),
      );
    } catch (error) {
      setBackupMessage(null);
      setBackupError(
        error instanceof BackupError
          ? t(`settings.backupError.${error.reason}`)
          : t('settings.backupError.invalid-content'),
      );
    } finally {
      if (backupInput.current) backupInput.current.value = '';
    }
  };

  return (
    <Page title={t('settings.title')}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-forest-950">{t('settings.family')}</h2>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field label={t('settings.familyName')}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label={t('settings.primaryCurrency')} hint={t('settings.primaryCurrencyHint')}>
              <div className="flex gap-2">
                <CurrencySelect value={primary} onChange={setPrimary} />
                <span className="flex items-center text-sm text-sage-600">
                  {currencyLabel(primary, i18n.language)}
                </span>
              </div>
            </Field>

            <div className="flex items-center justify-between">
              <button type="submit" className={btnPrimary}>
                {t('common.save')}
              </button>
              {saved && (
                <span className="text-sm font-medium text-forest-600" role="status">
                  ✔ {t('settings.saved')}
                </span>
              )}
            </div>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-forest-950">{t('settings.language')}</h2>
          <div className="flex gap-2">
            {LANGUAGES.map((lng: Language) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLanguage(lng)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  i18n.language.startsWith(lng)
                    ? 'border-forest-600 bg-forest-600 text-white'
                    : 'border-forest-200 bg-white text-forest-800 hover:bg-forest-50'
                }`}
                aria-pressed={i18n.language.startsWith(lng)}
              >
                {LANGUAGE_LABELS[lng]}
              </button>
            ))}
          </div>

          <h2 className="mb-2 mt-6 font-semibold text-forest-950">{t('settings.rateApi')}</h2>
          <p className="break-all text-xs text-sage-600">{RATES_API_URL}</p>
          <p className="mt-2 text-sm text-sage-600">
            {!rates.snapshot
              ? t('common.loading')
              : rates.snapshot.fetchedAt > 0
                ? t('converter.lastUpdate', {
                    date: new Date(rates.snapshot.fetchedAt).toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US'),
                  })
                : t('converter.offline')}{' '}
            {rates.snapshot && (
              <span className="ml-1 inline-flex gap-1 align-middle">
                {rates.source === 'network' && <Tag tone="green">{t('sync.online')}</Tag>}
                {rates.source === 'cache' && <Tag tone="amber">{t('sync.offline')}</Tag>}
                {rates.source === 'fallback' && <Tag tone="red">{t('sync.offline')}</Tag>}
              </span>
            )}
          </p>

          <h2 className="mb-2 mt-6 font-semibold text-forest-950">{t('settings.sync')}</h2>
          <p className="text-sm text-sage-600">
            {online ? <Tag tone="green">{t('sync.online')}</Tag> : <Tag tone="amber">{t('sync.offline')}</Tag>}{' '}
            {pending > 0 ? t('sync.pending', { count: pending }) : t('sync.synced')}
            {lastSyncAt && (
              <>
                {' '}
                · {t('sync.lastSync', { date: new Date(lastSyncAt).toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US') })}
              </>
            )}
          </p>
          <button type="button" className={`${btnPrimary} mt-3`} onClick={() => void syncNow()}>
            ⟳ {t('sync.syncNow')}
          </button>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-forest-950">{t('settings.backup')}</h2>
          <p className="text-sm text-sage-600">{t('settings.backupHint')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={btnPrimary} onClick={() => void downloadBackup()}>
              ⤓ {t('settings.backupExport')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-forest-200 bg-white px-4 py-2 text-sm font-semibold text-forest-800 transition hover:bg-forest-50"
              onClick={() => backupInput.current?.click()}
            >
              ⤒ {t('settings.backupImport')}
            </button>
            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
              }}
            />
          </div>
          {backupMessage && (
            <p className="mt-3 text-sm font-medium text-forest-600" role="status">
              ✔ {backupMessage}
            </p>
          )}
          {backupError && (
            <p className="mt-3 text-sm font-medium text-red-600" role="alert">
              {backupError}
            </p>
          )}
        </Card>

        <RecoveryCard />

        <DangerCard />
      </div>
    </Page>
  );
}

export default Settings;
