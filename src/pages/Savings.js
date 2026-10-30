import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { usePrimaryCurrency } from '@/hooks/useData';
import { createGoal, deleteGoal, updateGoal, contributeGoal } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { Card, ConfirmButton, EmptyState, Modal, MoneyInput, Page, ProgressBar, TextInput, btnGhost, btnPrimary } from '@/components/common';
function Savings() {
    const { t, i18n } = useTranslation();
    const primary = usePrimaryCurrency();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(null);
    const [contrib, setContrib] = useState(null);
    const goals = useLiveQuery(() => db.goals.orderBy('createdAt').toArray());
    const openForm = (goal) => {
        setForm(goal
            ? { id: goal.id, name: goal.name, targetAmount: goal.targetAmount, currentAmount: goal.currentAmount, targetDate: goal.targetDate ?? '' }
            : { name: '', targetAmount: 0, currentAmount: 0, targetDate: '' });
        setOpen(true);
    };
    const save = async () => {
        if (!form || !form.name.trim() || !primary)
            return;
        if (form.id) {
            await updateGoal(form.id, { name: form.name.trim(), targetAmount: form.targetAmount, targetDate: form.targetDate || null });
        }
        else {
            await createGoal({ name: form.name.trim(), targetAmount: form.targetAmount, currency: primary, targetDate: form.targetDate || null });
        }
        setOpen(false);
        setForm(null);
    };
    return (_jsxs(Page, { title: t('savings.title'), actions: _jsxs("button", { type: "button", className: btnPrimary, onClick: () => openForm(), children: ["\uFF0B ", t('savings.new')] }), children: [(goals ?? []).length === 0 ? (_jsx(EmptyState, { label: t('savings.empty'), icon: "\uD83D\uDCB0" })) : (_jsx("div", { className: "grid gap-3 md:grid-cols-2", children: (goals ?? []).map((goal) => {
                    const percent = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
                    return (_jsxs(Card, { children: [_jsxs("div", { className: "mb-2 flex items-start justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("h3", { className: "font-semibold text-forest-950", children: [goal.name, " ", goal.status === 'completed' && _jsx("span", { className: "text-xs font-medium text-forest-600", children: "\u2714" })] }), _jsxs("p", { className: "text-xs text-sage-600", children: [formatAmount(goal.currentAmount, goal.currency, i18n.language), " / ", formatAmount(goal.targetAmount, goal.currency, i18n.language), goal.targetDate && _jsxs(_Fragment, { children: [" \u00B7 \uD83D\uDCC5 ", goal.targetDate] })] })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { type: "button", className: "rounded p-1 text-sm hover:bg-forest-50", onClick: () => setContrib({ goal, amount: 0 }), "aria-label": t('savings.contribute'), children: "\u2935" }), _jsx("button", { type: "button", className: "rounded p-1 text-sm hover:bg-forest-50", onClick: () => openForm(goal), "aria-label": t('common.edit'), children: "\u270E" }), _jsx(ConfirmButton, { label: "\uD83D\uDDD1", confirmLabel: t('savings.deleteConfirm'), cancelLabel: t('common.cancel'), onConfirm: () => void deleteGoal(goal.id), danger: true })] })] }), _jsx(ProgressBar, { percent: percent }), _jsxs("p", { className: "mt-1 text-xs text-sage-600", children: [t('savings.progress', { percent: Math.round(percent) }), " \u00B7", ' ', t('savings.remaining', { amount: formatAmount(Math.max(0, goal.targetAmount - goal.currentAmount), goal.currency, i18n.language) })] })] }, goal.id));
                }) })), _jsx(Modal, { title: form?.id ? t('common.edit') : t('savings.new'), open: open, onClose: () => setOpen(false), children: form && (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                        e.preventDefault();
                        void save();
                    }, children: [_jsx(TextInput, { placeholder: t('savings.name'), value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), required: true }), _jsx(MoneyInput, { label: t('savings.target'), amountMinor: form.targetAmount, currency: primary ?? 'XOF', onMinor: (minor) => setForm({ ...form, targetAmount: minor }) }), _jsx(TextInput, { type: "date", value: form.targetDate, onChange: (e) => setForm({ ...form, targetDate: e.target.value }), "aria-label": t('savings.targetDate') }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setOpen(false), children: t('common.cancel') }), _jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') })] })] })) }), _jsx(Modal, { title: t('savings.contribute'), open: !!contrib, onClose: () => setContrib(null), children: contrib && (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                        e.preventDefault();
                        void contributeGoal(contrib.goal.id, contrib.amount);
                        setContrib(null);
                    }, children: [_jsx(MoneyInput, { label: t('savings.amount'), amountMinor: contrib.amount, currency: contrib.goal.currency, onMinor: (minor) => setContrib({ goal: contrib.goal, amount: minor }) }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setContrib(null), children: t('common.cancel') }), _jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') })] })] })) })] }));
}
export default Savings;
