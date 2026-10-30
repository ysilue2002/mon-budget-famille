import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAccounts, useCategories, useRates, useTransactions } from '@/hooks/useData';
import { db } from '@/db/dexie';
import { createTransaction, deleteTransaction, updateTransactionToAmount } from '@/core/repo';
import { convertMinor } from '@/core/money';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import { Card, ConfirmButton, EmptyState, Field, Modal, MoneyInput, Page, SelectInput, Tag, TextArea, TextInput, btnGhost, btnPrimary } from '@/components/common';
const schema = z.object({
    type: z.enum(['income', 'expense', 'transfer']),
    accountId: z.string().min(1),
    toAccountId: z.string().min(1).optional(),
    amountOriginal: z.number().int().positive(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    categoryId: z.string().optional(),
    note: z.string().max(500).optional(),
});
function Transactions() {
    const { t, i18n } = useTranslation();
    const accounts = useAccounts();
    const categories = useCategories();
    const transactions = useTransactions();
    const rates = useRates();
    const [open, setOpen] = useState(false);
    const [filterType, setFilterType] = useState('all');
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(null);
    const [error, setError] = useState(null);
    const openNew = (type) => {
        const first = accounts?.find((a) => !a.archived);
        if (!first) {
            setError(t('validation.noAccounts'));
            return;
        }
        setError(null);
        setForm({
            type,
            accountId: first.id,
            toAccountId: '',
            amountOriginal: 0,
            currency: first.currency,
            categoryId: '',
            date: todayISO(),
            note: '',
        });
        setOpen(true);
    };
    const account = form ? accounts?.find((a) => a.id === form.accountId) : undefined;
    const toAccount = form ? accounts?.find((a) => a.id === form.toAccountId) : undefined;
    const typeCategories = useMemo(() => {
        if (!categories)
            return [];
        return categories.filter((c) => c.type === (form?.type === 'income' ? 'income' : 'expense'));
    }, [categories, form?.type]);
    const save = async () => {
        if (!form || !account)
            return;
        const parsed = schema.safeParse({
            type: form.type,
            accountId: form.accountId,
            toAccountId: form.type === 'transfer' ? form.toAccountId || undefined : undefined,
            amountOriginal: form.amountOriginal,
            date: form.date,
            categoryId: form.categoryId || undefined,
            note: form.note || undefined,
        });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? t('validation.required'));
            return;
        }
        if (form.type === 'transfer' && form.toAccountId === form.accountId) {
            setError(t('validation.sameAccount'));
            return;
        }
        await createTransaction({
            type: form.type,
            accountId: form.accountId,
            toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
            amountOriginal: form.amountOriginal,
            currencyOriginal: account.currency,
            categoryId: form.categoryId || undefined,
            date: form.date,
            note: form.note || undefined,
        });
        if (form.type === 'transfer' && toAccount && toAccount.currency !== account.currency && rates.snapshot) {
            // Montant crédité converti dans la devise du compte de destination
            const tx = await db.transactions.orderBy('date').last();
            const converted = convertMinor(form.amountOriginal, account.currency, toAccount.currency, rates.snapshot);
            if (tx && converted !== null) {
                await updateTransactionToAmount(tx.id, converted);
            }
        }
        setOpen(false);
        setForm(null);
    };
    const remove = async (id) => {
        await deleteTransaction(id);
    };
    const rows = (transactions ?? []).filter((tx) => {
        if (filterType !== 'all' && tx.type !== filterType)
            return false;
        if (search && !(tx.note ?? '').toLowerCase().includes(search.toLowerCase()))
            return false;
        return true;
    });
    return (_jsxs(Page, { title: t('transactions.title'), actions: _jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: btnPrimary, onClick: () => openNew('expense'), children: ["\uFF0B ", t('transactions.new')] }), _jsxs("button", { type: "button", className: btnGhost, onClick: () => openNew('transfer'), children: ["\u21C4 ", t('transactions.newTransfer')] })] }), children: [_jsxs("div", { className: "mb-4 flex flex-wrap items-center gap-2", children: [_jsx(TextInput, { className: "max-w-xs", placeholder: t('transactions.searchPlaceholder'), value: search, onChange: (e) => setSearch(e.target.value) }), _jsx(SelectInput, { value: filterType, onChange: setFilterType, options: [
                            { value: 'all', label: t('transactions.allTypes') },
                            { value: 'income', label: t('transactions.income') },
                            { value: 'expense', label: t('transactions.expense') },
                            { value: 'transfer', label: t('transactions.transfer') },
                        ] }), _jsx("span", { className: "text-xs text-sage-600", children: t('transactions.count', { count: rows.length }) })] }), rows.length === 0 ? (_jsx(EmptyState, { label: t('transactions.empty'), icon: "\uD83E\uDDFE" })) : (_jsx(Card, { className: "overflow-hidden p-0", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { className: "bg-forest-50 text-left text-xs uppercase text-sage-600", children: _jsxs("tr", { children: [_jsx("th", { className: "px-3 py-2", children: t('common.date') }), _jsx("th", { className: "px-3 py-2", children: t('common.category') }), _jsx("th", { className: "px-3 py-2", children: t('common.note') }), _jsx("th", { className: "px-3 py-2 text-right", children: t('common.amount') }), _jsx("th", { className: "px-3 py-2", "aria-label": "actions" })] }) }), _jsx("tbody", { children: rows.map((tx) => (_jsxs("tr", { className: "table-row-hover border-t border-forest-100", children: [_jsx("td", { className: "whitespace-nowrap px-3 py-2", children: tx.date }), _jsx("td", { className: "px-3 py-2", children: _jsx(TypeTag, { type: tx.type }) }), _jsx("td", { className: "max-w-[16rem] truncate px-3 py-2", children: tx.note
                                            ? tx.note
                                            : `${accounts?.find((a) => a.id === tx.accountId)?.name ?? ''}${tx.toAccountId ? ` → ${accounts?.find((a) => a.id === tx.toAccountId)?.name ?? ''}` : ''}` }), _jsxs("td", { className: "whitespace-nowrap px-3 py-2 text-right font-semibold", children: [tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '⇄', ' ', formatAmount(tx.amountOriginal, tx.currencyOriginal, i18n.language), tx.type === 'transfer' && toAccountOf(tx, accounts) && tx.toAmount != null && (_jsxs("span", { className: "ml-1 text-xs font-normal text-sage-500", children: ["\u2192 ", formatAmount(tx.toAmount, toAccountOf(tx, accounts).currency, i18n.language)] }))] }), _jsx("td", { className: "px-3 py-2 text-right", children: _jsx(ConfirmButton, { label: "\uD83D\uDDD1", confirmLabel: t('transactions.deleteConfirm'), onConfirm: () => void remove(tx.id), danger: true }) })] }, tx.id))) })] }) })), _jsx(Modal, { title: form?.type === 'transfer' ? t('transactions.newTransfer') : t('transactions.new'), open: open, onClose: () => setOpen(false), children: form && (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                        e.preventDefault();
                        void save();
                    }, children: [_jsx(SelectInput, { label: t('transactions.type'), value: form.type, onChange: (v) => setForm({ ...form, type: v, categoryId: '' }), options: ['expense', 'income', 'transfer'].map((v) => ({ value: v, label: t(`transactions.${v}`) })) }), _jsx(SelectInput, { label: form.type === 'transfer' ? t('transactions.fromAccount') : t('transactions.account'), value: form.accountId, onChange: (v) => {
                                const selected = accounts?.find((a) => a.id === v);
                                setForm({ ...form, accountId: v, currency: selected?.currency ?? form.currency });
                            }, options: (accounts ?? []).filter((a) => !a.archived).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })) }), form.type === 'transfer' && (_jsx(SelectInput, { label: t('transactions.toAccount'), value: form.toAccountId, onChange: (v) => setForm({ ...form, toAccountId: v }), options: (accounts ?? []).filter((a) => !a.archived && a.id !== form.accountId).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })) })), _jsx(MoneyInput, { label: t('common.amount'), amountMinor: form.amountOriginal, currency: account?.currency ?? form.currency, onMinor: (minor) => setForm({ ...form, amountOriginal: minor }) }), form.type !== 'transfer' && (_jsx(SelectInput, { label: t('common.category'), value: form.categoryId, onChange: (v) => setForm({ ...form, categoryId: v }), options: [{ value: '', label: '—' }, ...typeCategories.map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.nameFr}` }))] })), _jsx(Field, { label: t('common.date'), children: _jsx(TextInput, { type: "date", value: form.date, onChange: (e) => setForm({ ...form, date: e.target.value }) }) }), _jsx(Field, { label: t('transactions.note'), children: _jsx(TextArea, { value: form.note, onChange: (e) => setForm({ ...form, note: e.target.value }) }) }), form.type === 'transfer' && (_jsx("p", { className: "rounded-lg bg-forest-50 px-3 py-2 text-xs text-forest-800", children: t('transactions.transferHint') })), error && _jsx("p", { className: "text-xs font-semibold text-red-600", children: error }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setOpen(false), children: t('common.cancel') }), _jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') })] })] })) })] }));
}
function toAccountOf(tx, accounts) {
    if (!tx.toAccountId)
        return undefined;
    return accounts?.find((a) => a.id === tx.toAccountId);
}
function TypeTag({ type }) {
    const { t } = useTranslation();
    const tone = type === 'income' ? 'green' : type === 'expense' ? 'red' : 'sage';
    return _jsx(Tag, { tone: tone, children: t(`transactions.${type}`) });
}
export default Transactions;
