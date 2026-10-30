import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { usePrimaryCurrency, useTransactions } from '@/hooks/useData';
import { formatAmount } from '@/core/currencies';
import { monthOf, todayISO } from '@/lib/date';
import { Card, Field, Page, StatCard, TextInput, btnGhost, btnPrimary } from '@/components/common';
function download(name, mime, data) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
function csvCell(value) {
    const text = String(value);
    return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function Reports() {
    const { t, i18n } = useTranslation();
    const transactions = useTransactions();
    const primary = usePrimaryCurrency();
    const today = todayISO();
    const [from, setFrom] = useState(`${monthOf(today)}-01`);
    const [to, setTo] = useState(today);
    const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
    const periodTxs = useMemo(() => (transactions ?? []).filter((tx) => tx.date >= from && tx.date <= to), [transactions, from, to]);
    const summary = useMemo(() => {
        let income = 0;
        let expense = 0;
        const byCategory = new Map();
        for (const tx of periodTxs) {
            if (tx.type === 'income')
                income += tx.amountInPrimary;
            if (tx.type === 'expense')
                expense += tx.amountInPrimary;
            const key = tx.type === 'transfer' ? null : tx.categoryId ?? 'unknown';
            if (key === null)
                continue;
            const direction = tx.type === 'income' ? 1 : -1;
            const row = byCategory.get(key) ?? { name: key, total: 0, count: 0 };
            row.total += direction * tx.amountInPrimary;
            row.count += 1;
            byCategory.set(key, row);
        }
        return { income, expense, net: income - expense, byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total) };
    }, [periodTxs]);
    const rows = useMemo(() => periodTxs.map((tx) => ({
        date: tx.date,
        type: tx.type,
        amount: tx.amountInPrimary,
        currency: primary ?? '',
        note: tx.note ?? '',
    })), [periodTxs, primary]);
    const fmt = (value) => (primary ? formatAmount(value, primary, lang) : String(value));
    const exportCsv = () => {
        const header = ['date', 'type', `amount (${primary ?? ''})`, 'note'];
        const lines = [header.join(';'), ...rows.map((r) => [csvCell(r.date), csvCell(r.type), csvCell(r.amount), csvCell(r.note)].join(';'))];
        download(`budget_${from}_${to}.csv`, 'text/csv;charset=utf-8', '\uFEFF' + lines.join('\n'));
    };
    const exportXlsx = () => {
        const sheet = XLSX.utils.json_to_sheet(rows);
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'operations');
        XLSX.writeFile(book, `budget_${from}_${to}.xlsx`);
    };
    const exportPdf = () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt' });
        doc.setFontSize(16);
        doc.text('Mon Budget Famille', 40, 40);
        doc.setFontSize(10);
        doc.text(`${t('reports.from')} ${from} — ${t('reports.to')} ${to}`, 40, 60);
        doc.text(t('reports.generatedAt', { date: new Date().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US') }), 40, 76);
        doc.setFontSize(12);
        doc.text(`${t('reports.incomeTotal')} : ${fmt(summary.income)}   ${t('reports.expenseTotal')} : ${fmt(summary.expense)}   ${t('reports.net')} : ${fmt(summary.net)}`, 40, 100);
        autoTable(doc, {
            startY: 116,
            head: [[t('common.date'), t('transactions.amount'), t('common.note')]],
            body: periodTxs.map((tx) => [tx.date, fmt(tx.type === 'income' ? tx.amountInPrimary : -tx.amountInPrimary), tx.note ?? '']),
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [20, 83, 45] },
            columnStyles: { 1: { halign: 'right' } },
        });
        doc.save(`budget_${from}_${to}.pdf`);
    };
    return (_jsxs(Page, { title: t('reports.title'), actions: _jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: btnGhost, onClick: exportCsv, disabled: periodTxs.length === 0, children: "\u2913 CSV" }), _jsx("button", { type: "button", className: btnGhost, onClick: exportXlsx, disabled: periodTxs.length === 0, children: "\u2913 XLSX" }), _jsx("button", { type: "button", className: btnPrimary, onClick: exportPdf, disabled: periodTxs.length === 0, children: "\u2913 PDF" })] }), children: [_jsx(Card, { className: "mb-4", children: _jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsx(Field, { label: t('reports.from'), children: _jsx(TextInput, { type: "date", value: from, onChange: (e) => setFrom(e.target.value) }) }), _jsx(Field, { label: t('reports.to'), children: _jsx(TextInput, { type: "date", value: to, onChange: (e) => setTo(e.target.value) }) }), _jsx("button", { type: "button", className: btnGhost, onClick: () => {
                                setFrom(`${monthOf(today)}-01`);
                                setTo(today);
                            }, children: t('dashboard.thisMonth') })] }) }), _jsxs("div", { className: "mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(StatCard, { label: t('reports.incomeTotal'), value: fmt(summary.income) }), _jsx(StatCard, { label: t('reports.expenseTotal'), value: fmt(summary.expense), valueClass: "text-red-700" }), _jsx(StatCard, { label: t('reports.net'), value: fmt(summary.net), valueClass: summary.net >= 0 ? 'text-forest-700' : 'text-red-700' }), _jsx(StatCard, { label: t('transactions.count', { count: periodTxs.length }), value: `${periodTxs.length}` })] }), summary.byCategory.length === 0 ? (_jsx(Card, { className: "text-sm text-sage-600", children: t('common.empty') })) : (_jsxs(Card, { className: "overflow-x-auto", children: [_jsx("h2", { className: "mb-3 font-semibold text-forest-950", children: t('dashboard.byCategory') }), _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-forest-100 text-left text-xs uppercase tracking-wide text-sage-600", children: [_jsx("th", { className: "py-2 pe-4", children: t('common.category') }), _jsx("th", { className: "py-2 pe-4 text-right", children: t('dashboard.monthlyExpense') }), _jsx("th", { className: "py-2 text-right", children: "N" })] }) }), _jsx("tbody", { children: summary.byCategory.map((row) => (_jsxs("tr", { className: "border-b border-forest-50 last:border-0", children: [_jsx("td", { className: "py-2 pe-4", children: row.name }), _jsx("td", { className: "py-2 pe-4 text-right font-medium", children: fmt(row.total) }), _jsx("td", { className: "py-2 text-right text-sage-500", children: row.count })] }, row.name))) })] }), _jsx("p", { className: "mt-3 text-xs text-sage-500", children: t('reports.hint') })] }))] }));
}
export default Reports;
