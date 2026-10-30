import type React from 'react';
import { type ReactNode, useEffect, useState, type ChangeEvent, type ChangeEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, SUPPORTED_CURRENCIES } from '@/core/currencies';
import { parseAmountInput, toMajor } from '@/core/money';
import type { CurrencyCode } from '@/core/types';

export function cx(...names: (string | false | undefined | null)[]): string {
  return names.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- boutons

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-forest-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-600 disabled:opacity-50';
export const btnGhost =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-forest-200 bg-white px-4 py-2 text-sm font-medium text-forest-800 transition hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-400 disabled:opacity-50';
export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400';

// ---------------------------------------------------------------- structure

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-forest-950">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-forest-100 bg-white p-4 shadow-sm', className)}>{children}</div>;
}

export function StatCard({ label, value, hint, valueClass }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-sage-600">{label}</span>
      <span className={cx('text-xl font-bold text-forest-900 sm:text-2xl', valueClass)}>{value}</span>
      {hint && <span className="text-xs text-sage-500">{hint}</span>}
    </Card>
  );
}

export function EmptyState({ icon, label }: { icon?: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-forest-200 bg-forest-50/40 px-6 py-10 text-center">
      <span aria-hidden className="text-3xl">{icon ?? '🌱'}</span>
      <p className="text-sm text-sage-600">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------- modale

export function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-forest-950">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-sage-500 hover:bg-forest-50" aria-label="close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmButton({ label, confirmLabel, cancelLabel, onConfirm, danger, disabled }: { label: ReactNode; confirmLabel: string; cancelLabel?: string; onConfirm: () => void; danger?: boolean; disabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cx('rounded-lg px-2 py-1 text-sm font-medium transition', danger ? 'text-red-600 hover:bg-red-50' : 'text-forest-700 hover:bg-forest-50')}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
      <Modal title={confirmLabel} open={confirming} onClose={() => setConfirming(false)}>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={() => setConfirming(false)}>
            {cancelLabel ?? '✕'}
          </button>
          <button
            type="button"
            className={cx(btnPrimary, 'bg-red-600 hover:bg-red-700')}
            onClick={() => {
              onConfirm();
              setConfirming(false);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- formulaire

export function Field({ label, children, error, hint }: { label: string; children: ReactNode; error?: string | null; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-forest-900">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-sage-500">{hint}</span>}
      {error && <span className="text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-forest-200 bg-white px-3 py-2 text-sm text-forest-950 shadow-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea(props: TextAreaProps) {
  return <textarea {...props} className={cx(inputClass, props.className)} rows={props.rows ?? 2} />;
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const handle: ChangeEventHandler<HTMLSelectElement> = (e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value);
  const select = (
    <select value={value} onChange={handle} className={inputClass} aria-label={label}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-forest-900">{label}</span>
      {select}
    </label>
  );
}

// ------------------------------ saisie monétaire en sous-unités entières

export function MoneyInput({
  label,
  amountMinor,
  currency,
  onMinor,
  onCurrency,
  currencies = SUPPORTED_CURRENCIES,
  error,
}: {
  label: string;
  amountMinor: number;
  currency: CurrencyCode;
  onMinor: (minor: number) => void;
  onCurrency?: (code: CurrencyCode) => void;
  currencies?: readonly CurrencyCode[];
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => String(toMajor(amountMinor, currency)));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // resynchronise l'affichage si le montant change hors saisie
    if (!dirty && Number.isFinite(amountMinor)) {
      setText(String(toMajor(amountMinor, currency)));
    }
  }, [amountMinor, currency, dirty]);

  const commit = (e: React.FocusEvent<HTMLInputElement>) => {
    const minor = parseAmountInput(e.target.value, currency);
    if (minor === null) {
      setText(String(toMajor(amountMinor, currency)));
    } else {
      onMinor(minor);
      setText(String(toMajor(minor, currency)));
    }
  };

  return (
    <Field label={label} error={error}>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          className={cx(inputClass, 'flex-1')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onFocus={() => setDirty(true)}
          placeholder={CURRENCIES[currency].decimals === 0 ? '0' : '0.00'}
        />
        {onCurrency ? (
          <CurrencySelect value={currency} onChange={onCurrency} currencies={currencies} />
        ) : (
          <span className="flex min-w-[4rem] items-center justify-center rounded-lg border border-forest-200 bg-forest-50 px-2 text-sm font-semibold text-forest-800">
            {CURRENCIES[currency].symbol}
          </span>
        )}
      </div>
      <span className="text-xs text-sage-500">{t('common.amountHint')}</span>
      {error && <span className="text-xs text-red-600">{t('validation.invalidAmount')}</span>}
    </Field>
  );
}

export function CurrencySelect({
  value,
  onChange,
  currencies = SUPPORTED_CURRENCIES,
  className,
}: {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  currencies?: readonly CurrencyCode[];
  className?: string;
}) {
  const { i18n } = useTranslation();
  const isFr = i18n.language.startsWith('fr');
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
      className={cx('rounded-lg border border-forest-200 bg-white px-2 text-sm font-semibold text-forest-800', className ?? 'w-24')}
    >
      {currencies.map((code) => (
        <option key={code} value={code}>
          {isFr ? `${CURRENCIES[code].symbol} (${code})` : code}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------- divers

export function ProgressBar({ percent, alert, over }: { percent: number; alert?: boolean; over?: boolean }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = over ? 'bg-red-500' : alert ? 'bg-amber-400' : 'bg-forest-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-forest-100" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Tag({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'sage'; children: ReactNode }) {
  const tones = {
    green: 'bg-forest-100 text-forest-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    sage: 'bg-sage-100 text-sage-700',
  } as const;
  return <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}
