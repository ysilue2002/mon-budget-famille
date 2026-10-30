import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/dexie';
import { useCategories, usePrimaryCurrency, useTransactions } from '@/hooks/useData';
import { budgetStatus, spentByCategory } from '@/core/selectors';
import { createBudget, deleteBudget, updateBudget } from '@/core/repo';
import { formatAmount } from '@/core/currencies';
import { addMonths, currentMonth } from '@/lib/date';
import { Card, ConfirmButton, EmptyState, Field, Modal, MoneyInput, Page, ProgressBar, SelectInput, TextInput, btnGhost, btnPrimary } from '@/components/common';
const THRESHOLDS = [50, 80, 90, 100];
function Budgets() {
    const { t, i18n } = useTranslation();
    const categories = useCategories();
    const transactions = useTransactions();
    const primary = usePrimaryCurrency();
    const [month, setMonth] = useState(currentMonth());
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(null);
    const budgets = useLiveQuery(() => db.budgets.where('period').equals(month).toArray(), [month]);
    const expenseCategories = (categories ?? []).filter((c) => c.type === 'expense');
    const openForm = (budget) => {
        setForm(budget
            ? { id: budget.id, period: budget.period, categoryId: budget.categoryId, amountLimit: budget.amountLimit, alertThreshold: budget.alertThreshold }
            : { period: month, categoryId: expenseCategories[0]?.id ?? '', amountLimit: 0, alertThreshold: 80 });
        setOpen(true);
    };
    const save = async () => {
        if (!form || !form.categoryId)
            return;
        const input = { period: form.period, categoryId: form.categoryId, amountLimit: form.amountLimit, alertThreshold: form.alertThreshold };
        if (form.id)
            await updateBudget(form.id, input);
        else
            await createBudget(input);
        setOpen(false);
        setForm(null);
    };
    const rows = (budgets ?? []).map((budget) => {
        const category = categories?.find((c) => c.id === budget.categoryId);
        const status = budgetStatus(budget, spentByCategory(transactions ?? [], budget.categoryId));
        return { budget, category, status };
    });
    return (_jsxs(Page, { title: t('budgets.title'), actions: _jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setMonth(addMonths(month, -1)), "aria-label": "mois pr\u00E9c\u00E9dent", children: "\u25C0" }), _jsx("span", { className: "min-w-[6.5rem] text-center font-semibold", children: month }), _jsx("button", { type: "button", className: btnGhost, onClick: () => setMonth(addMonths(month, 1)), "aria-label": "mois suivant", children: "\u25B6" })] }), _jsxs("button", { type: "button", className: btnPrimary, onClick: () => openForm(), children: ["\uFF0B ", t('budgets.new')] })] }), children: [!primary ? (_jsx(EmptyState, { label: t('common.loading') })) : rows.length === 0 ? (_jsx(EmptyState, { label: t('budgets.empty'), icon: "\uD83C\uDFAF" })) : (_jsx("div", { className: "grid gap-3 md:grid-cols-2", children: rows.map(({ budget, category, status }) => (_jsxs(Card, { children: [_jsxs("div", { className: "mb-2 flex items-start justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("h3", { className: "font-semibold text-forest-950", children: [category?.icon, " ", category?.nameFr] }), _jsxs("p", { className: "text-xs text-sage-600", children: [fmt(i18n.language, budget.currency, status.spent), " / ", fmt(i18n.language, budget.currency, budget.amountLimit), " \u00B7", ' ', t('budgets.progress', { percent: Math.round(status.percent) }), status.over && _jsxs("span", { className: "ml-1 font-semibold text-red-600", children: ["\u00B7 ", t('budgets.overBudget')] })] })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { type: "button", className: "rounded p-1 text-sm hover:bg-forest-50", onClick: () => openForm(budget), "aria-label": t('common.edit'), children: "\u270E" }), _jsx(ConfirmButton, { label: "\uD83D\uDDD1", confirmLabel: t('budgets.deleteConfirm'), cancelLabel: t('common.cancel'), onConfirm: () => void deleteBudget(budget.id), danger: true })] })] }), _jsx(ProgressBar, { percent: status.percent, alert: status.alert, over: status.over }), _jsxs("p", { className: "mt-1 text-xs text-sage-600", children: [t('budgets.remaining'), " : ", fmt(i18n.language, budget.currency, status.remaining)] })] }, budget.id))) })), _jsx(Modal, { title: form?.id ? t('common.edit') : t('budgets.new'), open: open, onClose: () => setOpen(false), children: form && (_jsxs("form", { className: "flex flex-col gap-3", onSubmit: (e) => {
                        e.preventDefault();
                        void save();
                    }, children: [_jsx(SelectInput, { label: t('common.category'), value: form.categoryId, onChange: (v) => setForm({ ...form, categoryId: v }), options: expenseCategories.map((c) => ({ value: c.id, label: `${c.icon ?? ''} ${c.nameFr}` })) }), _jsx(Field, { label: t('budgets.month'), children: _jsx(TextInput, { type: "month", value: form.period, onChange: (e) => setForm({ ...form, period: e.target.value }) }) }), _jsx(MoneyInput, { label: t('budgets.limit'), amountMinor: form.amountLimit, currency: primary ?? 'XOF', onMinor: (minor) => setForm({ ...form, amountLimit: minor }) }), _jsx(SelectInput, { label: t('budgets.threshold'), value: String(form.alertThreshold), onChange: (v) => setForm({ ...form, alertThreshold: Number(v) }), options: THRESHOLDS.map((v) => ({ value: String(v), label: t('budgets.thresholdHint', { value: v }) })) }), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { type: "button", className: btnGhost, onClick: () => setOpen(false), children: t('common.cancel') }), _jsx("button", { type: "submit", className: btnPrimary, children: t('common.save') })] })] })) })] }));
}
function fmt(lang, currency, value) {
    return formatAmount(value, currency, lang);
}
export default Budgets;
