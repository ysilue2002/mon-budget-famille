import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRates } from '@/hooks/useData';
import { convertMinor, rateBetween } from '@/core/money';
import { formatAmount } from '@/core/currencies';
import type { CurrencyCode } from '@/core/types';
import { Card, CurrencySelect, Field, MoneyInput, Page, Tag, btnGhost } from '@/components/common';

/**
 * Widget de conversion : saisie unilatérale (from → to) calculée en
 * sous-unités entières, avec dernier taux connu et information sur la
 * fraîcheur des taux (temps réel / cache / repli).
 */
function Converter() {
  const { t, i18n } = useTranslation();
  const { snapshot, source, loading, refresh } = useRates();

  const [amount, setAmount] = useState(1000);
  const [from, setFrom] = useState<CurrencyCode>('XOF');
  const [to, setTo] = useState<CurrencyCode>('USD');

  const swapped = from === to ? null : convertMinor(amount, from, to, snapshot);
  const reverse = from === to ? null : convertMinor(amount, to, from, snapshot);
  const rate = rateBetween(from, to, snapshot);
  const lastUpdate = snapshot && snapshot.fetchedAt > 0 ? new Date(snapshot.fetchedAt) : null;

  return (
    <Page
      title={t('converter.title')}
      actions={
        <button type="button" className={btnGhost} onClick={() => void refresh()} disabled={loading}>
          ⟳ {t('converter.refresh')}
        </button>
      }
    >
      <Card className="mx-auto max-w-xl">
        <h2 className="mb-4 font-semibold text-forest-950">{t('converter.widget')}</h2>
        <MoneyInput
          label={t('converter.amount')}
          amountMinor={amount}
          currency={from}
          onCurrency={(code) => setFrom(code)}
          onMinor={(minor) => setAmount(minor)}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label={t('converter.from')}>
            <CurrencySelect value={from} onChange={setFrom} />
          </Field>
          <button
            type="button"
            aria-label={t('converter.swap')}
            className="mx-auto rounded-full border border-forest-200 bg-white p-2 text-lg leading-none shadow-sm transition hover:bg-forest-50"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            ⇄
          </button>
          <Field label={t('converter.to')}>
            <CurrencySelect value={to} onChange={setTo} />
          </Field>
        </div>

        <div className="mt-5 rounded-xl bg-forest-50 p-4 text-center">
          {swapped === null ? (
            <p className="text-sm text-sage-600">{t('converter.invalidRates')}</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-forest-900">{formatAmount(swapped, to, i18n.language)}</p>
              {reverse !== null && <p className="mt-1 text-xs text-sage-600">⇄ {formatAmount(reverse, from, i18n.language)}</p>}
              {rate !== null && <p className="mt-2 text-xs text-sage-600">{t('converter.rate', { from, to, rate: rate.toPrecision(6) })}</p>}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-sage-600">
          <span>
            {source === 'network' && <Tag tone="green">{t('sync.online')}</Tag>}{' '}
            {source === 'cache' && <Tag tone="amber">{t('sync.offline')}</Tag>}{' '}
            {source === 'fallback' && <Tag tone="red">{t('sync.offline')}</Tag>}
          </span>
          <span>
            {!snapshot
              ? '…'
              : snapshot.stale
                ? t('converter.offline')
                : lastUpdate
                  ? t('converter.lastUpdate', { date: lastUpdate.toLocaleString(i18n.language.startsWith('fr') ? 'fr-FR' : 'en-US') })
                  : ''}
          </span>
        </div>
      </Card>
    </Page>
  );
}

export default Converter;
