import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFamily, useRates } from '@/hooks/useData';
import { useSync } from '@/sync/SyncProvider';
import { updateFamilyProfile } from '@/core/repo';
import { setLanguage, LANGUAGES, type Language } from '@/i18n';
import { currencyLabel } from '@/core/currencies';
import { RATES_API_URL } from '@/core/exchange';
import type { CurrencyCode } from '@/core/types';
import { Card, CurrencySelect, Field, Page, Tag, TextInput, btnPrimary } from '@/components/common';

function Settings() {
  const { t, i18n } = useTranslation();
  const family = useFamily();
  const rates = useRates();
  const { online, pending, lastSyncAt, syncNow } = useSync();

  const [name, setName] = useState('');
  const [primary, setPrimary] = useState<CurrencyCode>('XOF');
  const [saved, setSaved] = useState(false);

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
                {lng === 'fr' ? '🇫🇷 Français' : '🇬🇧 English'}
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
      </div>
    </Page>
  );
}

export default Settings;
