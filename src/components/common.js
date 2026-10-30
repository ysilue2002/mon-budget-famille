import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENCIES, SUPPORTED_CURRENCIES } from '@/core/currencies';
import { parseAmountInput, toMajor } from '@/core/money';
export function cx(...names) {
    return names.filter(Boolean).join(' ');
}
// ---------------------------------------------------------------- boutons
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-forest-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-forest-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-600 disabled:opacity-50';
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-lg border border-forest-200 bg-white px-4 py-2 text-sm font-medium text-forest-800 transition hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-forest-400 disabled:opacity-50';
export const btnDanger = 'inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400';
// ---------------------------------------------------------------- structure
export function Page({ title, actions, children }) {
    return (_jsxs("section", { className: "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6", children: [_jsxs("header", { className: "mb-6 flex flex-wrap items-center justify-between gap-3", children: [_jsx("h1", { className: "text-2xl font-bold text-forest-950", children: title }), actions && _jsx("div", { className: "flex flex-wrap items-center gap-2", children: actions })] }), children] }));
}
export function Card({ className, children }) {
    return _jsx("div", { className: cx('rounded-xl border border-forest-100 bg-white p-4 shadow-sm', className), children: children });
}
export function StatCard({ label, value, hint, valueClass }) {
    return (_jsxs(Card, { className: "flex flex-col gap-1", children: [_jsx("span", { className: "text-xs font-medium uppercase tracking-wide text-sage-600", children: label }), _jsx("span", { className: cx('text-xl font-bold text-forest-900 sm:text-2xl', valueClass), children: value }), hint && _jsx("span", { className: "text-xs text-sage-500", children: hint })] }));
}
export function EmptyState({ icon, label }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-2 rounded-xl border border-dashed border-forest-200 bg-forest-50/40 px-6 py-10 text-center", children: [_jsx("span", { "aria-hidden": true, className: "text-3xl", children: icon ?? '🌱' }), _jsx("p", { className: "text-sm text-sage-600", children: label })] }));
}
// ---------------------------------------------------------------- modale
export function Modal({ title, open, onClose, children }) {
    useEffect(() => {
        if (!open)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4", role: "dialog", "aria-modal": "true", "aria-label": title, children: _jsxs("div", { className: "w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold text-forest-950", children: title }), _jsx("button", { type: "button", onClick: onClose, className: "rounded p-1 text-sage-500 hover:bg-forest-50", "aria-label": "close", children: "\u2715" })] }), children] }) }));
}
export function ConfirmButton({ label, confirmLabel, cancelLabel, onConfirm, danger, disabled }) {
    const [confirming, setConfirming] = useState(false);
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: cx('rounded-lg px-2 py-1 text-sm font-medium transition', danger ? 'text-red-600 hover:bg-red-50' : 'text-forest-700 hover:bg-forest-50'), disabled: disabled, onClick: () => setConfirming(true), children: label }), _jsx(Modal, { title: confirmLabel, open: confirming, onClose: () => setConfirming(false), children: _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setConfirming(false), children: cancelLabel ?? '✕' }), _jsx("button", { type: "button", className: cx(btnPrimary, 'bg-red-600 hover:bg-red-700'), onClick: () => {
                                onConfirm();
                                setConfirming(false);
                            }, children: confirmLabel })] }) })] }));
}
// ---------------------------------------------------------------- formulaire
export function Field({ label, children, error, hint }) {
    return (_jsxs("label", { className: "flex flex-col gap-1 text-sm", children: [_jsx("span", { className: "font-medium text-forest-900", children: label }), children, hint && !error && _jsx("span", { className: "text-xs text-sage-500", children: hint }), error && _jsx("span", { className: "text-xs font-medium text-red-600", children: error })] }));
}
const inputClass = 'w-full rounded-lg border border-forest-200 bg-white px-3 py-2 text-sm text-forest-950 shadow-sm outline-none focus:border-forest-500 focus:ring-2 focus:ring-forest-200';
export function TextInput(props) {
    return _jsx("input", { ...props, className: cx(inputClass, props.className) });
}
export function TextArea(props) {
    return _jsx("textarea", { ...props, className: cx(inputClass, props.className), rows: props.rows ?? 2 });
}
export function SelectInput({ label, value, onChange, options, }) {
    const handle = (e) => onChange(e.target.value);
    const select = (_jsx("select", { value: value, onChange: handle, className: inputClass, "aria-label": label, children: options.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value))) }));
    if (!label)
        return select;
    return (_jsxs("label", { className: "flex flex-col gap-1 text-sm", children: [_jsx("span", { className: "font-medium text-forest-900", children: label }), select] }));
}
// ------------------------------ saisie monétaire en sous-unités entières
export function MoneyInput({ label, amountMinor, currency, onMinor, onCurrency, currencies = SUPPORTED_CURRENCIES, error, }) {
    const { t } = useTranslation();
    const [text, setText] = useState(() => String(toMajor(amountMinor, currency)));
    const [dirty, setDirty] = useState(false);
    useEffect(() => {
        // resynchronise l'affichage si le montant change hors saisie
        if (!dirty && Number.isFinite(amountMinor)) {
            setText(String(toMajor(amountMinor, currency)));
        }
    }, [amountMinor, currency, dirty]);
    const commit = (e) => {
        const minor = parseAmountInput(e.target.value, currency);
        if (minor === null) {
            setText(String(toMajor(amountMinor, currency)));
        }
        else {
            onMinor(minor);
            setText(String(toMajor(minor, currency)));
        }
    };
    return (_jsxs(Field, { label: label, error: error, children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", inputMode: "decimal", className: cx(inputClass, 'flex-1'), value: text, onChange: (e) => setText(e.target.value), onBlur: commit, onFocus: () => setDirty(true), placeholder: CURRENCIES[currency].decimals === 0 ? '0' : '0.00' }), onCurrency ? (_jsx(CurrencySelect, { value: currency, onChange: onCurrency, currencies: currencies })) : (_jsx("span", { className: "flex min-w-[4rem] items-center justify-center rounded-lg border border-forest-200 bg-forest-50 px-2 text-sm font-semibold text-forest-800", children: CURRENCIES[currency].symbol }))] }), _jsx("span", { className: "text-xs text-sage-500", children: t('common.amountHint') }), error && _jsx("span", { className: "text-xs text-red-600", children: t('validation.invalidAmount') })] }));
}
export function CurrencySelect({ value, onChange, currencies = SUPPORTED_CURRENCIES, className, }) {
    const { i18n } = useTranslation();
    const isFr = i18n.language.startsWith('fr');
    return (_jsx("select", { value: value, onChange: (e) => onChange(e.target.value), className: cx('rounded-lg border border-forest-200 bg-white px-2 text-sm font-semibold text-forest-800', className ?? 'w-24'), children: currencies.map((code) => (_jsx("option", { value: code, children: isFr ? `${CURRENCIES[code].symbol} (${code})` : code }, code))) }));
}
// ---------------------------------------------------------------- divers
export function ProgressBar({ percent, alert, over }) {
    const clamped = Math.min(100, Math.max(0, percent));
    const color = over ? 'bg-red-500' : alert ? 'bg-amber-400' : 'bg-forest-500';
    return (_jsx("div", { className: "h-2 w-full overflow-hidden rounded-full bg-forest-100", role: "progressbar", "aria-valuenow": clamped, "aria-valuemin": 0, "aria-valuemax": 100, children: _jsx("div", { className: cx('h-full rounded-full transition-all', color), style: { width: `${clamped}%` } }) }));
}
export function Tag({ tone, children }) {
    const tones = {
        green: 'bg-forest-100 text-forest-800',
        amber: 'bg-amber-100 text-amber-800',
        red: 'bg-red-100 text-red-700',
        sage: 'bg-sage-100 text-sage-700',
    };
    return _jsx("span", { className: cx('rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone]), children: children });
}
