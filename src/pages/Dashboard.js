import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import { db } from '@/db/dexie';
import { useAccounts, useCategories, usePrimaryCurrency, useRates, useTransactions } from '@/hooks/useData';
import { buildDashboardSummary, budgetStatus, computeAccountBalance, monthTotalsOf, spentByCategory } from '@/core/selectors';
import { formatAmount } from '@/core/currencies';
import { currentMonth, monthOf } from '@/lib/date';
import { Card, EmptyState, Page, ProgressBar, StatCard } from '@/components/common';
const PALETTE = ['#36784e', '#6f7d61', '#9dcdaa', '#4a9463', '#254d35', '#b3bda6', '#6db081', '#2c6040', '#d3d9c9'];
function Dashboard() {
    const { t, i18n } = useTranslation();
    const rates = useRates();
    const accounts = useAccounts();
    const transactions = useTransactions();
    const categories = useCategories();
    const primary = usePrimaryCurrency();
    const budgets = useLiveQuery(() => db.budgets.where('period').equals(currentMonth()).toArray(), []);
    const month = currentMonth();
    const monthTxs = useMemo(() => (transactions ?? []).filter((tx) => monthOf(tx.date) === month), [transactions, month]);
    const live = useLiveQuery(async () => {
        if (!rates.snapshot || !primary || !accounts)
            return null;
        const [allTx, allGoals, allDebts] = await Promise.all([
            db.transactions.toArray(),
            db.goals.toArray(),
            db.debts.toArray(),
        ]);
        const totals = monthTotalsOf(monthTxs, 'transfer');
        const dash = buildDashboardSummary(accounts, allTx, allGoals, allDebts, primary, rates.snapshot);
        return { ...dash, ...totals };
    }, [rates.snapshot, primary, accounts, monthTxs]);
    const budgetRows = useMemo(() => {
        if (!budgets || !categories)
            return [];
        return budgets
            .map((b) => ({
            budget: b,
            status: budgetStatus(b, spentByCategory(monthTxs, b.categoryId)),
            category: categories.find((c) => c.id === b.categoryId),
        }))
            .sort((a, b) => b.status.percent - a.status.percent)
            .slice(0, 4);
    }, [budgets, categories, monthTxs]);
    const pieData = useMemo(() => {
        if (!categories || !primary)
            return [];
        const map = new Map();
        for (const tx of monthTxs) {
            if (tx.type !== 'expense')
                continue;
            const key = tx.categoryId ?? 'unknown';
            map.set(key, (map.get(key) ?? 0) + tx.amountInPrimary);
        }
        return [...map.entries()]
            .map(([categoryKey, value]) => ({
            name: categories.find((c) => c.id === categoryKey)?.nameFr ?? t('common.none'),
            value,
        }))
            .filter((d) => d.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [monthTxs, categories, primary, t]);
    const barData = useMemo(() => {
        if (!accounts || !rates.snapshot || !primary)
            return [];
        return accounts
            .filter((a) => !a.archived)
            .map((account) => {
            const balance = computeAccountBalance(account, transactions ?? []);
            const converted = account.currency === primary
                ? balance
                : balance * (rates.snapshot.rates[primary] ?? 1) / (rates.snapshot.rates[account.currency] ?? 1);
            return { name: account.name, value: Math.round(converted) };
        });
    }, [accounts, transactions, rates.snapshot, primary]);
    const fmt = (value) => (primary ? formatAmount(value, primary, i18n.language) : String(value));
    return (_jsx(Page, { title: t('nav.dashboard'), children: !live ? (_jsx(EmptyState, { label: t('common.loading'), icon: "\u23F3" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6", children: [_jsx(StatCard, { label: t('dashboard.totalBalance'), value: fmt(live.balance) }), _jsx(StatCard, { label: t('dashboard.monthlyIncome'), value: fmt(live.income), valueClass: "text-forest-600" }), _jsx(StatCard, { label: t('dashboard.monthlyExpense'), value: fmt(live.expense), valueClass: "text-red-600" }), _jsx(StatCard, { label: t('dashboard.remaining'), value: fmt(live.remaining), valueClass: live.remaining >= 0 ? 'text-forest-600' : 'text-red-600' }), _jsx(StatCard, { label: t('dashboard.savingsTotal'), value: fmt(live.savings) }), _jsx(StatCard, { label: t('dashboard.netDebt'), value: fmt(live.netDebt), valueClass: live.netDebt >= 0 ? 'text-forest-600' : 'text-red-600' })] }), _jsxs("p", { className: "mt-2 text-xs text-sage-500", children: [t('dashboard.inPrimary'), " \u00B7 ", primary] }), _jsxs("div", { className: "mt-6 grid gap-4 lg:grid-cols-2", children: [_jsxs(Card, { children: [_jsx("h2", { className: "mb-3 text-sm font-semibold text-forest-950", children: t('dashboard.byCategory') }), pieData.length === 0 ? (_jsx(EmptyState, { label: t('common.empty') })) : (_jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(PieChart, { children: [_jsx(Pie, { data: pieData, dataKey: "value", nameKey: "name", innerRadius: 45, outerRadius: 80, paddingAngle: 2, children: pieData.map((entry, index) => (_jsx(Cell, { fill: PALETTE[index % PALETTE.length] }, entry.name))) }), _jsx(Tooltip, { formatter: (value) => fmt(value) }), _jsx(Legend, { wrapperStyle: { fontSize: 12 } })] }) }) }))] }), _jsxs(Card, { children: [_jsx("h2", { className: "mb-3 text-sm font-semibold text-forest-950", children: t('dashboard.byAccount') }), barData.length === 0 ? (_jsx(EmptyState, { label: t('common.empty') })) : (_jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: barData, layout: "vertical", children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#d3d9c9" }), _jsx(XAxis, { type: "number", tickFormatter: (v) => fmt(v), fontSize: 11 }), _jsx(YAxis, { type: "category", dataKey: "name", width: 90, fontSize: 12 }), _jsx(Tooltip, { formatter: (value) => fmt(value) }), _jsx(Bar, { dataKey: "value", fill: "#36784e", radius: [0, 4, 4, 0] })] }) }) }))] })] }), budgetRows.length > 0 && (_jsxs(Card, { className: "mt-4", children: [_jsx("h2", { className: "mb-3 text-sm font-semibold text-forest-950", children: t('dashboard.budgetHealth') }), _jsx("div", { className: "flex flex-col gap-3", children: budgetRows.map(({ budget, status, category }) => (_jsxs("div", { className: "flex flex-col gap-1", children: [_jsxs("div", { className: "flex justify-between text-xs text-forest-900", children: [_jsxs("span", { className: "font-medium", children: [category?.icon, " ", category?.nameFr] }), _jsxs("span", { children: [fmt(status.spent), " / ", fmt(status.limit), " \u00B7 ", t('budgets.progress', { percent: Math.round(status.percent) })] })] }), _jsx(ProgressBar, { percent: status.percent, alert: status.alert, over: status.over })] }, budget.id))) })] }))] })) }));
}
export default Dashboard;
