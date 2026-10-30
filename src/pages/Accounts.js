import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAccounts, usePrimaryCurrency, useTransactions } from '@/hooks/useData';
import { computeAccountBalance } from '@/core/selectors';
import { createAccount, deleteAccount, updateAccount } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { Card, ConfirmButton, EmptyState, Field, Modal, MoneyInput, Page, SelectInput, TextInput, btnGhost, btnPrimary, } from '@/components/common';
const accountSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['cash', 'bank', 'mobile', 'other']),
    currency: z.string().min(3),
    initialBalance: z.number().int(),
});
const PROVIDERS = [
    { value: 'wave', key: 'accounts.mobileProviders.wave' },
    { value: 'orange', key: 'accounts.mobileProviders.orange' },
    { value: 'mtn', key: 'accounts.mobileProviders.mtn' },
    { value: 'moov', key: 'accounts.mobileProviders.moov' },
    { value: 'paypal', key: 'accounts.mobileProviders.paypal' },
    { value: 'other', key: 'accounts.mobileProviders.other' },
];
function Accounts() {
    const { t, i18n } = useTranslation();
    const accounts = useAccounts();
    const transactions = useTransactions();
    const primary = usePrimaryCurrency();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(null);
    const [error, setError] = useState(null);
    const openForm = (account) => {
        setForm(account
            ? { id: account.id, name: account.name, type: account.type, provider: account.provider, currency: account.currency, initialBalance: account.initialBalance }
            : { name: '', type: 'cash', provider: null, currency: primary ?? 'XOF', initialBalance: 0 });
        setError(null);
        setOpen(true);
    };
    const save = async () => {
        if (!form)
            return;
        const parsed = accountSchema.safeParse({ name: form.name, type: form.type, currency: form.currency, initialBalance: form.initialBalance });
        if (!parsed.success) {
            setError(t('validation.required'));
            return;
        }
        const input = {
            name: form.name,
            type: form.type,
            provider: form.type === 'mobile' ? form.provider : null,
            currency: form.currency,
            initialBalance: form.initialBalance,
        };
        if (form.id)
            await updateAccount(form.id, input);
        else
            await createAccount(input);
        setOpen(false);
        setForm(null);
    };
    return (_jsxs(Page, { title: t('accounts.title'), actions: _jsxs("button", { type: "button", className: btnPrimary, onClick: () => openForm(), children: ["\uFF0B ", t('accounts.new')] }), children: [!accounts?.length ? (_jsx(EmptyState, { label: t('accounts.empty'), icon: "\uD83C\uDFE6" })) : (_jsx("div", { className: "grid gap-3 sm:grid-cols-2 xl:grid-cols-3", children: accounts.map((account) => {
                    const txs = transactions?.filter((tx) => tx.accountId === account.id || tx.toAccountId === account.id) ?? [];
                    const balance = computeAccountBalance(account, txs);
                    return (_jsxs(Card, { className: account.archived ? 'opacity-50' : undefined, children: [_jsxs("div", { className: "mb-1 flex items-start justify-between gap-2", children: [_jsxs("div", { children: [_jsx("h3", { className: "font-semibold text-forest-950", children: account.name }), _jsxs("p", { className: "text-xs text-sage-600", children: [t(`accounts.${account.type}`), account.type === 'mobile' && account.provider ? ` · ${t(PROVIDERS.find((p) => p.value === account.provider)?.key ?? 'accounts.mobileProviders.other')}` : '', ' · ', account.currency] })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { type: "button", className: "rounded p-1 text-sm hover:bg-forest-50", onClick: () => openForm(account), "aria-label": t('common.edit'), children: "\u270E" }), _jsx(ConfirmButton, { label: "\uD83D\uDDD1", confirmLabel: t('accounts.deleteConfirm'), onConfirm: () => void deleteAccount(account.id), danger: true })] })] }), _jsx("p", { className: "text-2xl font-bold text-forest-800", children: formatAmount(balance, account.currency, i18n.language) })] }, account.id));
                }) })), _jsx(Modal, { title: form?.id ? t('common.edit') : t('accounts.new'), open: open, onClose: () => setOpen(false), children: form && (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                        e.preventDefault();
                        void save();
                    }, children: [_jsx(Field, { label: t('common.name'), children: _jsx(TextInput, { value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), required: true }) }), _jsx(SelectInput, { label: t('accounts.type'), value: form.type, onChange: (v) => setForm({ ...form, type: v, provider: null }), options: ['cash', 'bank', 'mobile', 'other'].map((v) => ({ value: v, label: t(`accounts.${v}`) })) }), form.type === 'mobile' && (_jsx(SelectInput, { label: t('accounts.mobileProvider'), value: form.provider ?? 'other', onChange: (v) => setForm({ ...form, provider: v }), options: PROVIDERS.map((p) => ({ value: p.value ?? 'other', label: t(p.key) })) })), _jsx(SelectInput, { label: t('common.currency'), value: form.currency, onChange: (v) => setForm({ ...form, currency: v }), options: ['XOF', 'XAF', 'USD', 'NGN', 'GBP', 'EUR', 'CHF'].map((c) => ({ value: c, label: c })) }), _jsx(MoneyInput, { label: t('accounts.initialBalance'), amountMinor: form.initialBalance, currency: form.currency, onMinor: (minor) => setForm({ ...form, initialBalance: minor }) }), error && _jsx("p", { className: "text-xs font-semibold text-red-600", children: error }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setOpen(false), children: t('common.cancel') }), _jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') })] })] })) })] }));
}
export default Accounts;
