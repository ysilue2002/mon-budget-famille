import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '@/db/dexie';
import { useAccounts, useCategories, useFamily, useRates, useTransactions } from '@/hooks/useData';
import { fallbackSnapshot } from '@/core/exchange';
import { buildStatement, type StatementComparisonLine } from '@/core/statements';
import { wealthSeries } from '@/core/wealth';
import WealthChart from '@/components/WealthChart';
import { formatAmount } from '@/core/currencies';
import { currentMonth, endOfMonth } from '@/lib/date';
import type { CurrencyCode, Transaction } from '@/core/types';
import { Card, EmptyState, Field, Page, TextInput, btnGhost, btnPrimary } from '@/components/common';

type Mode = 'month' | 'year';

function Statements() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('fr') ? 'fr' : 'en';
  const accounts = useAccounts();
  const transactions = useTransactions();
  const categories = useCategories();
  const family = useFamily();
  const rates = useRates();
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const debts = useLiveQuery(() => db.debts.toArray(), []);
  const wealth = useLiveQuery(() => db.wealth.orderBy('date').toArray(), []);
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [includeDetails, setIncludeDetails] = useState(false);
  const [compare, setCompare] = useState(true);

  const primary: CurrencyCode = family?.primaryCurrency ?? 'XOF';
  const snapshot = rates.snapshot ?? fallbackSnapshot();

  const safeYear = /^\d{4}$/.test(year) ? year : String(new Date().getFullYear());
  const from = mode === 'month' ? `${month}-01` : `${safeYear}-01-01`;
  const to = mode === 'month' ? endOfMonth(month) : `${safeYear}-12-31`;

  const periodLabel =
    mode === 'month'
      ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString(
          lang === 'fr' ? 'fr-FR' : 'en-US',
          { month: 'long', year: 'numeric' },
        )
      : safeYear;

  const statement = useMemo(
    () =>
      buildStatement({
        accounts: accounts ?? [],
        transactions: transactions ?? [],
        categories: categories ?? [],
        goals: (goals ?? []).map((g) => ({ currentAmount: g.currentAmount, currency: g.currency })),
        debts: (debts ?? []).map((d) => ({ kind: d.kind, remainingAmount: d.remainingAmount, currency: d.currency })),
        wealth: (wealth ?? []).map((w) => ({
          date: w.date,
          savings: w.savings,
          receivables: w.receivables,
          payables: w.payables,
          estimated: w.estimated,
        })),
        from,
        to,
        primary,
        snapshot,
        lang,
        compare,
      }),
    [accounts, transactions, categories, goals, debts, wealth, from, to, primary, snapshot, lang, compare],
  );

  // Douze derniers relevés jusqu'à la clôture : courbe du patrimoine net du bilan.
  const wealthTrend = useMemo(
    () => wealthSeries((wealth ?? []).filter((row) => row.date <= to), 12),
    [wealth, to],
  );

  const comparison = statement.comparison;
  const delta = (current: number, previous: number) => current - previous;
  const deltaPct = (current: number, previous: number) =>
    previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / Math.abs(previous)) * 100;

  const fmt = (value: number) => formatAmount(value, primary, lang);
  const fmtIn = (value: number, currency: CurrencyCode) => formatAmount(value, currency, lang);
  const comparisonTable = (title: string, lines: StatementComparisonLine[]) =>
    lines.length === 0 ? null : (
      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold text-forest-900">{title}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
              <th className="py-1">{t('common.category')}</th>
              <th className="py-1 text-right">{t('statements.previous')}</th>
              <th className="py-1 text-right">{t('statements.current')}</th>
              <th className="py-1 text-right">{t('statements.change')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-forest-50">
                <td className="py-1.5">{line.label}</td>
                <td className="py-1.5 text-right text-sage-700">{fmt(line.previous)}</td>
                <td className="py-1.5 text-right font-medium">{fmt(line.current)}</td>
                <td className={`py-1.5 text-right font-semibold ${line.delta >= 0 ? 'text-forest-700' : 'text-red-600'}`}>
                  {`${line.delta > 0 ? '+' : ''}${fmt(line.delta)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const signed = (tx: Transaction) =>
    formatAmount(tx.type === 'income' ? tx.amountInPrimary : -tx.amountInPrimary, primary, lang);

  const categoryOf = (tx: Transaction) => {
    const category = (categories ?? []).find((c) => c.id === tx.categoryId);
    if (!category) return t('statements.uncategorised');
    return lang === 'fr' ? category.nameFr : category.nameEn;
  };

  const detailRows = (transactions ?? []).filter((tx) => tx.date >= from && tx.date <= to);

  const heading = mode === 'month' ? t('statements.monthly') : t('statements.annual');
  const generatedAt = new Date().toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US');

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    let y = 40;
    doc.setFontSize(15);
    doc.text('Mon Budget Famille', 40, y);
    y += 20;
    doc.setFontSize(12);
    doc.text(`${heading} — ${periodLabel}`, 40, y);
    y += 16;
    doc.setFontSize(9);
    doc.text(`${t('statements.household')} : ${family?.name ?? '—'}`, 40, y);
    y += 12;
    doc.text(`${t('statements.period')} : ${from} → ${to} · ${t('statements.currency')} : ${primary}`, 40, y);
    y += 12;
    doc.text(t('reports.generatedAt', { date: generatedAt }), 40, y);
    y += 20;

    const addTable = (title: string, head: string[], body: (string | number)[][]) => {
      if (body.length === 0) return;
      if (y > 740) {
        doc.addPage();
        y = 40;
      }
      doc.setFontSize(10);
      doc.text(title, 40, y);
      autoTable(doc, {
        startY: y + 6,
        head: [head],
        body,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [20, 83, 45] },
        margin: { left: 40, right: 40 },
        columnStyles: { [head.length - 1]: { halign: 'right' } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
    };

    addTable(t('statements.result'), [t('common.amount')], [
      [t('reports.incomeTotal'), fmt(statement.income)],
      [t('reports.expenseTotal'), fmt(statement.expense)],
      [t('reports.net'), fmt(statement.net)],
      [t('statements.savingsRate'), `${statement.savingsRate.toFixed(1)} %`],
    ]);
    if (statement.comparison) {
      const p = statement.comparison;
      const addComparisonLines = (title: string, lines: StatementComparisonLine[]) => {
        if (lines.length === 0) return;
        addTable(
          title,
          [t('common.category'), t('statements.previous'), t('statements.current'), t('statements.change')],
          lines.map((line) => [line.label, fmt(line.previous), fmt(line.current), fmt(line.delta)]),
        );
      };
      addTable(
        `${t('statements.comparison')} (${p.from} → ${p.to})`,
        [t('statements.comparisonRow'), t('statements.previous'), t('statements.current'), t('statements.change')],
        [
          [
            t('reports.incomeTotal'),
            fmt(p.income),
            fmt(statement.income),
            `${fmt(delta(statement.income, p.income))} (${deltaPct(statement.income, p.income).toFixed(1)} %)`,
          ],
          [
            t('reports.expenseTotal'),
            fmt(p.expense),
            fmt(statement.expense),
            `${fmt(delta(statement.expense, p.expense))} (${deltaPct(statement.expense, p.expense).toFixed(1)} %)`,
          ],
          [
            t('reports.net'),
            fmt(p.net),
            fmt(statement.net),
            `${fmt(delta(statement.net, p.net))} (${deltaPct(statement.net, p.net).toFixed(1)} %)`,
          ],
        ],
      );
      addComparisonLines(`${t('statements.expenseByCategory')} — ${t('statements.change')}`, p.expenseLines);
      addComparisonLines(`${t('statements.incomeByCategory')} — ${t('statements.change')}`, p.incomeLines);
    }
    addTable(
      t('statements.incomeByCategory'),
      [t('common.category'), t('statements.count'), t('statements.share'), t('common.amount')],
      statement.incomeLines.map((line) => [line.label, line.count, `${line.share.toFixed(1)} %`, fmt(line.total)]),
    );
    addTable(
      t('statements.expenseByCategory'),
      [t('common.category'), t('statements.count'), t('statements.share'), t('common.amount')],
      statement.expenseLines.map((line) => [line.label, line.count, `${line.share.toFixed(1)} %`, fmt(line.total)]),
    );
    addTable(
      t('statements.members'),
      [t('statements.member'), t('statements.count'), t('reports.incomeTotal'), t('reports.expenseTotal'), t('reports.net')],
      statement.members.map((line) => [line.label, line.count, fmt(line.income), fmt(line.expense), fmt(line.net)]),
    );
    addTable(
      t('statements.accounts'),
      [
        t('statements.account'),
        t('statements.opening'),
        t('statements.inflow'),
        t('statements.outflow'),
        t('statements.closing'),
      ],
      statement.accounts.map((line) => [
        `${line.name} (${line.currency})`,
        fmtIn(line.opening, line.currency),
        fmtIn(line.inflow, line.currency),
        fmtIn(line.outflow, line.currency),
        fmtIn(line.closing, line.currency),
      ]),
    );
    addTable(t('statements.wealth'), [t('common.amount')], [
      [t('statements.accountsTotal'), fmt(statement.accountsTotal)],
      [t('statements.savings'), fmt(statement.savings)],
      [t('statements.receivables'), fmt(statement.receivables)],
      [t('statements.payables'), fmt(statement.payables)],
      [t('statements.netWorth'), fmt(statement.netWorth)],
    ]);
    if (wealthTrend.length > 1) {
      if (y > 660) {
        doc.addPage();
        y = 40;
      }
      doc.setFontSize(10);
      doc.text(t('statements.wealthTrend'), 40, y);
      const chartX = 40;
      const chartY = y + 14;
      const chartW = 515;
      const chartH = 100;
      const nets = wealthTrend.map((point) => point.net);
      const max = Math.max(...nets);
      const min = Math.min(...nets);
      const span = max - min || Math.max(1, Math.abs(max));
      const px = (index: number) => chartX + (index / (wealthTrend.length - 1)) * chartW;
      const py = (value: number) => chartY + chartH - ((value - min) / span) * chartH;
      doc.setDrawColor(209, 217, 209);
      doc.setLineWidth(0.5);
      doc.rect(chartX, chartY, chartW, chartH);
      doc.setDrawColor(21, 128, 61);
      doc.setLineWidth(1.2);
      for (let i = 1; i < wealthTrend.length; i += 1) {
        doc.line(px(i - 1), py(nets[i - 1]), px(i), py(nets[i]));
      }
      doc.setFontSize(7);
      doc.setTextColor(75, 85, 99);
      doc.text(fmt(max), chartX + chartW, chartY - 2, { align: 'right' });
      doc.text(fmt(min), chartX + chartW, chartY + chartH + 8, { align: 'right' });
      doc.text(wealthTrend[0].date, chartX, chartY + chartH + 8);
      // Repères annuels : verticales discrètes et millésime au bord bas.
      doc.setDrawColor(220, 230, 220);
      doc.setLineWidth(0.4);
      let previousYear = '';
      wealthTrend.forEach((point, index) => {
        const year = point.date.slice(0, 4);
        if (year === previousYear) return;
        previousYear = year;
        const tickX = Math.min(Math.max(px(index), chartX + 10), chartX + chartW - 10);
        if (index > 0) doc.line(tickX, chartY, tickX, chartY + chartH);
        doc.setTextColor(139, 154, 139);
        doc.text(year, tickX, chartY + chartH - 3, { align: 'center' });
      });
      doc.setTextColor(0, 0, 0);
      doc.setLineWidth(0.2);
      y = chartY + chartH + 22;
    }
    if (includeDetails && detailRows.length > 0) {
      addTable(
        t('statements.details'),
        [t('common.date'), t('common.category'), t('common.note'), t('common.amount')],
        detailRows.map((tx) => [tx.date, categoryOf(tx), tx.note ?? '', signed(tx)]),
      );
    }

    doc.save(`bilan_${mode === 'month' ? month : safeYear}_${from}_${to}.pdf`);
  };

  if (accounts === undefined || transactions === undefined) {
    return (
      <Page title={t('statements.title')}>
        <EmptyState label={t('common.loading')} />
      </Page>
    );
  }

  return (
    <Page
      title={t('statements.title')}
      actions={
        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={exportPdf}>
            ⤓ PDF
          </button>
          <button type="button" className={btnPrimary} onClick={() => window.print()}>
            🖨 {t('statements.print')}
          </button>
        </div>
      }
    >
      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex overflow-hidden rounded-lg border border-forest-200">
            {(['month', 'year'] as Mode[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={`px-3 py-2 text-sm font-medium ${
                  mode === value ? 'bg-forest-600 text-white' : 'bg-white text-forest-800 hover:bg-forest-50'
                }`}
              >
                {value === 'month' ? t('statements.monthlyShort') : t('statements.annualShort')}
              </button>
            ))}
          </div>
          {mode === 'month' ? (
            <Field label={t('statements.month')}>
              <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
          ) : (
            <Field label={t('statements.year')}>
              <TextInput
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-28"
              />
            </Field>
          )}
          <label className="flex items-center gap-2 pb-2 text-sm text-forest-900">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-4 w-4 rounded border-forest-300"
            />
            {t('statements.compare')}
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-forest-900">
            <input
              type="checkbox"
              checked={includeDetails}
              onChange={(e) => setIncludeDetails(e.target.checked)}
              className="h-4 w-4 rounded border-forest-300"
            />
            {t('statements.includeDetails')}
          </label>
        </div>
      </Card>

      <article className="print-sheet rounded-xl border border-forest-100 bg-white p-5 shadow-sm sm:p-8">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-forest-200 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sage-600">Mon Budget Famille</p>
            <h2 className="text-xl font-bold text-forest-950">
              {heading} — {periodLabel}
            </h2>
            <p className="text-xs text-sage-600">
              {t('statements.household')} : {family?.name ?? '—'} · {t('statements.period')} : {from} → {to}
            </p>
          </div>
          <div className="text-right text-xs text-sage-600">
            <p>{t('statements.currency')} : {primary}</p>
            <p>{t('reports.generatedAt', { date: generatedAt })}</p>
          </div>
        </header>

        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-forest-900">{t('statements.result')}</h3>
        <table className="mb-2 w-full text-sm">
          <tbody>
            <tr className="border-b border-forest-100">
              <td className="py-1.5">{t('reports.incomeTotal')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.income)}</td>
            </tr>
            <tr className="border-b border-forest-100">
              <td className="py-1.5">{t('reports.expenseTotal')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.expense)}</td>
            </tr>
            <tr className="border-b-2 border-forest-300">
              <td className="py-1.5 font-semibold">{t('reports.net')}</td>
              <td className={`py-1.5 text-right font-bold ${statement.net >= 0 ? 'text-forest-700' : 'text-red-700'}`}>
                {fmt(statement.net)}
              </td>
            </tr>
            <tr>
              <td className="py-1.5 text-xs text-sage-600">
                {t('statements.savingsRate')} · {t('statements.transfers')} : {statement.transferCount}
              </td>
              <td className="py-1.5 text-right text-xs font-medium text-sage-700">
                {statement.savingsRate.toFixed(1)} %
              </td>
            </tr>
          </tbody>
        </table>

        {comparison && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
              {t('statements.comparison')}
            </h3>
            <p className="mb-2 text-[11px] text-sage-600">
              {t('statements.previousPeriod')} : {comparison.from} → {comparison.to}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                  <th className="py-1">{t('statements.comparisonRow')}</th>
                  <th className="py-1 text-right">{t('statements.previous')}</th>
                  <th className="py-1 text-right">{t('statements.current')}</th>
                  <th className="py-1 text-right">{t('statements.change')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { key: 'income', label: t('reports.incomeTotal'), current: statement.income, previous: comparison.income },
                  { key: 'expense', label: t('reports.expenseTotal'), current: statement.expense, previous: comparison.expense },
                  { key: 'net', label: t('reports.net'), current: statement.net, previous: comparison.net },
                ].map((row) => {
                  const diff = delta(row.current, row.previous);
                  return (
                    <tr key={row.key} className="border-b border-forest-50">
                      <td className="py-1.5">{row.label}</td>
                      <td className="py-1.5 text-right text-sage-700">{fmt(row.previous)}</td>
                      <td className="py-1.5 text-right font-medium">{fmt(row.current)}</td>
                      <td className={`py-1.5 text-right font-semibold ${diff >= 0 ? 'text-forest-700' : 'text-red-600'}`}>
                        {`${diff > 0 ? '+' : ''}${fmt(diff)}`}
                        <span className="ml-1 text-[11px] font-normal text-sage-500">
                          {`${deltaPct(row.current, row.previous) > 0 ? '+' : ''}${deltaPct(
                            row.current,
                            row.previous,
                          ).toFixed(1)} %`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {comparisonTable(t('statements.expenseByCategory'), comparison.expenseLines)}
            {comparisonTable(t('statements.incomeByCategory'), comparison.incomeLines)}
          </>
        )}

        {statement.incomeLines.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
              {t('statements.incomeByCategory')}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                  <th className="py-1">{t('common.category')}</th>
                  <th className="py-1 text-right">{t('statements.count')}</th>
                  <th className="py-1 text-right">{t('statements.share')}</th>
                  <th className="py-1 text-right">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {statement.incomeLines.map((line) => (
                  <tr key={line.id} className="border-b border-forest-50">
                    <td className="py-1.5">{line.label}</td>
                    <td className="py-1.5 text-right text-sage-600">{line.count}</td>
                    <td className="py-1.5 text-right text-sage-600">{line.share.toFixed(1)} %</td>
                    <td className="py-1.5 text-right font-medium">{fmt(line.total)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 font-semibold" colSpan={3}>
                    {t('reports.incomeTotal')}
                  </td>
                  <td className="py-1.5 text-right font-bold">{fmt(statement.income)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {statement.expenseLines.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
              {t('statements.expenseByCategory')}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                  <th className="py-1">{t('common.category')}</th>
                  <th className="py-1 text-right">{t('statements.count')}</th>
                  <th className="py-1 text-right">{t('statements.share')}</th>
                  <th className="py-1 text-right">{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {statement.expenseLines.map((line) => (
                  <tr key={line.id} className="border-b border-forest-50">
                    <td className="py-1.5">{line.label}</td>
                    <td className="py-1.5 text-right text-sage-600">{line.count}</td>
                    <td className="py-1.5 text-right text-sage-600">{line.share.toFixed(1)} %</td>
                    <td className="py-1.5 text-right font-medium">{fmt(line.total)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 font-semibold" colSpan={3}>
                    {t('reports.expenseTotal')}
                  </td>
                  <td className="py-1.5 text-right font-bold">{fmt(statement.expense)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {statement.members.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
              {t('statements.members')}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                  <th className="py-1">{t('statements.member')}</th>
                  <th className="py-1 text-right">{t('statements.count')}</th>
                  <th className="py-1 text-right">{t('reports.incomeTotal')}</th>
                  <th className="py-1 text-right">{t('reports.expenseTotal')}</th>
                  <th className="py-1 text-right">{t('reports.net')}</th>
                  <th className="py-1 text-right">{t('statements.share')}</th>
                </tr>
              </thead>
              <tbody>
                {statement.members.map((line) => (
                  <tr key={line.id} className="border-b border-forest-50">
                    <td className="py-1.5">{line.label}</td>
                    <td className="py-1.5 text-right text-sage-600">{line.count}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(line.income)}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(line.expense)}</td>
                    <td className={`py-1.5 text-right font-semibold ${line.net >= 0 ? 'text-forest-700' : 'text-red-600'}`}>
                      {fmt(line.net)}
                    </td>
                    <td className="py-1.5 text-right text-sage-600">{line.share.toFixed(1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
          {t('statements.accounts')}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
              <th className="py-1">{t('statements.account')}</th>
              <th className="py-1 text-right">{t('statements.opening')}</th>
              <th className="py-1 text-right">{t('statements.inflow')}</th>
              <th className="py-1 text-right">{t('statements.outflow')}</th>
              <th className="py-1 text-right">{t('statements.closing')}</th>
            </tr>
          </thead>
          <tbody>
            {statement.accounts.map((line) => (
              <tr key={line.id} className="border-b border-forest-50">
                <td className="py-1.5">
                  {line.name} <span className="text-xs text-sage-500">({line.currency})</span>
                </td>
                <td className="py-1.5 text-right">{fmtIn(line.opening, line.currency)}</td>
                <td className="py-1.5 text-right text-forest-700">{fmtIn(line.inflow, line.currency)}</td>
                <td className="py-1.5 text-right text-red-600">{fmtIn(line.outflow, line.currency)}</td>
                <td className="py-1.5 text-right font-semibold">{fmtIn(line.closing, line.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-sage-500">{t('statements.footnote', { currency: primary })}</p>

        <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
          {t('statements.wealth')}
        </h3>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-forest-100">
              <td className="py-1.5">{t('statements.accountsTotal')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.accountsTotal)}</td>
            </tr>
            <tr className="border-b border-forest-100">
              <td className="py-1.5">{t('statements.savings')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.savings)}</td>
            </tr>
            <tr className="border-b border-forest-100">
              <td className="py-1.5">{t('statements.receivables')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.receivables)}</td>
            </tr>
            <tr className="border-b-2 border-forest-300">
              <td className="py-1.5">{t('statements.payables')}</td>
              <td className="py-1.5 text-right font-medium">{fmt(statement.payables)}</td>
            </tr>
            <tr>
              <td className="py-1.5 font-semibold">{t('statements.netWorth')}</td>
              <td className="py-1.5 text-right font-bold">{fmt(statement.netWorth)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-sage-500">
          {statement.wealthHistorical
            ? t('statements.wealthAsOf', { date: statement.wealthDate })
            : t('statements.wealthCurrent', { date: statement.wealthDate })}
          {statement.wealthEstimated ? ` ${t('statements.wealthEstimated')}` : ''}
        </p>

        {wealthTrend.length > 1 && (
          <>
            <h3 className="mb-1 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
              {t('statements.wealthTrend')}
            </h3>
            <p className="text-[11px] text-sage-600">
              {t('statements.wealthTrendHint', { count: wealthTrend.length })}
            </p>
            <WealthChart
              points={wealthTrend}
              format={fmt}
              label={t('statements.wealthTrend')}
              estimatedLabel={t('statements.wealthEstimated')}
            />
            {wealthTrend.some((point) => point.estimated) && (
              <p className="text-[11px] text-sage-500">◇ {t('statements.wealthTrendEstimated')}</p>
            )}
          </>
        )}

        {includeDetails && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-forest-900">
              {t('statements.details')}
            </h3>
            {detailRows.length === 0 ? (
              <p className="text-sm text-sage-600">{t('statements.empty')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-forest-200 text-left text-[11px] uppercase text-sage-600">
                    <th className="py-1">{t('common.date')}</th>
                    <th className="py-1">{t('common.category')}</th>
                    <th className="py-1">{t('common.note')}</th>
                    <th className="py-1 text-right">{t('common.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((tx) => (
                    <tr key={tx.id} className="border-b border-forest-50">
                      <td className="whitespace-nowrap py-1.5">{tx.date}</td>
                      <td className="py-1.5">{tx.type === 'transfer' ? t('transactions.transfer') : categoryOf(tx)}</td>
                      <td className="py-1.5 text-sage-700">{tx.note ?? '—'}</td>
                      <td className="py-1.5 text-right font-medium">{signed(tx)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        <footer className="mt-6 border-t border-forest-200 pt-3 text-[11px] text-sage-500">
          {t('statements.footer', { date: generatedAt })}
        </footer>
      </article>
    </Page>
  );
}

export default Statements;
