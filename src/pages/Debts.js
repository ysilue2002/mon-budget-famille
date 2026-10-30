import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { useAccounts, usePrimaryCurrency } from '@/hooks/useData';
import { createDebt, deleteDebt, repayDebt } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { todayISO } from '@/lib/date';
import { Card, ConfirmButton, EmptyState, Field, Modal, MoneyInput, Page, ProgressBar, SelectInput, TextInput, Tag, btnGhost, btnPrimary, } from '@/components/common';
function Debts() {
    const { t, i18n } = useTranslation();
    const primary = usePrimaryCurrency();
    const accounts = useAccounts();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(null);
    const [repay, setRepay] = useState(null);
    const debts = useLiveQuery(() => db.debts.orderBy('createdAt').toArray());
    const openForm = (kind = 'payable') => {
        setForm({ kind, partyName: '', initialAmount: 0, dueDate: '' });
        setOpen(true);
    };
    const save = async () => {
        if (!form || !form.partyName.trim() || !primary)
            return;
        await createDebt({
            kind: form.kind,
            partyName: form.partyName.trim(),
            initialAmount: form.initialAmount,
            currency: primary,
            dueDate: form.dueDate || null,
        });
        setOpen(false);
        setForm(null);
    };
    return (_jsxs(Page, { title: t('debts.title'), actions: _jsxs(_Fragment, { children: [_jsxs("button", { type: "button", className: btnGhost, onClick: () => openForm('payable'), children: ["\uFF0B ", t('debts.payable')] }), _jsxs("button", { type: "button", className: btnGhost, onClick: () => openForm('receivable'), children: ["\uFF0B ", t('debts.receivable')] })] }), children: [(debts ?? []).length === 0 ? (_jsx(EmptyState, { label: t('debts.empty'), icon: "\uD83E\uDD1D" })) : (_jsx("div", { className: "grid gap-3 md:grid-cols-2", children: (debts ?? []).map((debt) => {
                    const percent = debt.initialAmount > 0 ? Math.min(100, ((debt.initialAmount - debt.remainingAmount) / debt.initialAmount) * 100) : 0;
                    return (_jsxs(Card, { children: [_jsxs("div", { className: "mb-2 flex items-start justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("h3", { className: "font-semibold text-forest-950", children: [debt.kind === 'payable' ? '↘' : '↗', " ", debt.partyName] }), _jsxs("p", { className: "text-xs text-sage-600", children: [debt.kind === 'payable' ? t('debts.payable') : t('debts.receivable'), " \u00B7", ' ', t('debts.remaining'), " : ", formatAmount(debt.remainingAmount, debt.currency, i18n.language), debt.dueDate && _jsxs(_Fragment, { children: [" \u00B7 \uD83D\uDCC5 ", debt.dueDate] })] })] }), _jsxs("div", { className: "flex items-center gap-1", children: [debt.status === 'settled' ? _jsx(Tag, { tone: "green", children: t('debts.settled') }) : _jsx(Tag, { tone: "sage", children: t('debts.open') }), debt.status === 'open' && (_jsx("button", { type: "button", className: "rounded p-1 text-sm hover:bg-forest-50", onClick: () => setRepay({ debt, amount: 0, date: todayISO(), accountId: '' }), "aria-label": t('debts.repay'), children: "\uD83D\uDCB3" })), _jsx(ConfirmButton, { label: "\uD83D\uDDD1", confirmLabel: t('debts.deleteConfirm'), cancelLabel: t('common.cancel'), onConfirm: () => void deleteDebt(debt.id), danger: true })] })] }), _jsx(ProgressBar, { percent: percent }), _jsxs("p", { className: "mt-1 text-xs text-sage-600", children: [t('debts.initialAmount'), " : ", formatAmount(debt.initialAmount, debt.currency, i18n.language), debt.payments.length > 0 && _jsxs(_Fragment, { children: [" \u00B7 ", debt.payments.length, " \u00D7 \uD83D\uDCB3"] })] })] }, debt.id));
                }) })), _jsx(Modal, { title: form?.kind === 'receivable' ? t('debts.receivable') : t('debts.payable'), open: open, onClose: () => setOpen(false), children: form && (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                        e.preventDefault();
                        void save();
                    }, children: [_jsx(SelectInput, { label: t('debts.kind'), value: form.kind, onChange: (v) => setForm({ ...form, kind: v }), options: [
                                { value: 'payable', label: t('debts.payable') },
                                { value: 'receivable', label: t('debts.receivable') },
                            ] }), _jsx(TextInput, { placeholder: t('debts.party'), value: form.partyName, onChange: (e) => setForm({ ...form, partyName: e.target.value }), required: true }), _jsx(MoneyInput, { label: t('debts.initialAmount'), amountMinor: form.initialAmount, currency: primary ?? 'XOF', onMinor: (minor) => setForm({ ...form, initialAmount: minor }) }), _jsx(Field, { label: t('debts.dueDate'), children: _jsx(TextInput, { type: "date", value: form.dueDate, onChange: (e) => setForm({ ...form, dueDate: e.target.value }) }) }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setOpen(false), children: t('common.cancel') }), _jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') })] })] })) }), _jsx(Modal, { title: t('debts.repay'), open: !!repay, onClose: () => setRepay(null), children: repay && (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                        e.preventDefault();
                        void repayDebt(repay.debt.id, repay.amount, repay.date, repay.accountId || undefined);
                        setRepay(null);
                    }, children: [_jsx(MoneyInput, { label: t('debts.repaymentAmount'), amountMinor: repay.amount, currency: repay.debt.currency, onMinor: (minor) => setRepay({ ...repay, amount: minor }) }), _jsx(Field, { label: t('common.date'), children: _jsx(TextInput, { type: "date", value: repay.date, onChange: (e) => setRepay({ ...repay, date: e.target.value }) }) }), _jsx(SelectInput, { label: t('transactions.account'), value: repay.accountId, onChange: (v) => setRepay({ ...repay, accountId: v }), options: [{ value: '', label: `— ${t('common.none')} —` }, ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))] }), _jsx("p", { className: "text-xs text-sage-500", children: t('debts.affectsAccounts') }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setRepay(null), children: t('common.cancel') }), _jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') })] })] })) })] }));
}
export default Debts;
