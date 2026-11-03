import { describe, expect, it } from 'vitest';
import { lastDayOfMonth, monthEndsSince, planMonthEndValuations, wealthSeries, wealthYearTicks } from '@/core/wealth';

describe('wealth', () => {
  it('trouve le dernier jour du mois, années bissextiles comprises', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(lastDayOfMonth('2026-10')).toBe('2026-10-31');
  });

  it('liste les fins de mois révolues, plus celle du mois courant si atteinte', () => {
    expect(monthEndsSince('2026-08-15', '2026-10-30')).toEqual(['2026-08-31', '2026-09-30']);
    expect(monthEndsSince('2026-08-15', '2026-10-31')).toEqual([
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
    ]);
    expect(monthEndsSince('2026-11-01', '2026-10-30')).toEqual([]);
  });

  it('reporte le dernier relevé connu et marque les estimations', () => {
    const existing = [
      { date: '2026-08-31', savings: 100_000, receivables: 5_000, payables: 7_000, estimated: false },
    ];
    const plan = planMonthEndValuations(existing, ['2026-08-31', '2026-09-30'], {
      savings: 999_000,
      receivables: 1,
      payables: 2,
    });
    expect(plan).toEqual([
      { date: '2026-09-30', savings: 100_000, receivables: 5_000, payables: 7_000, estimated: false },
    ]);

    const estimated = planMonthEndValuations([], ['2026-07-31'], {
      savings: 42_000,
      receivables: 0,
      payables: 3_000,
    });
    expect(estimated).toEqual([
      { date: '2026-07-31', savings: 42_000, receivables: 0, payables: 3_000, estimated: true },
    ]);
  });
  it('construit la série du patrimoine net des derniers relevés', () => {
    const points = [
      { date: '2026-08-31', savings: 100_000, receivables: 20_000, payables: 30_000 },
      { date: '2026-09-30', savings: 120_000, receivables: 0, payables: 10_000, estimated: true },
      { date: '2026-07-31', savings: 90_000, receivables: 0, payables: 0 },
    ];
    expect(wealthSeries(points, 2)).toEqual([
      { date: '2026-08-31', net: 90_000, estimated: false },
      { date: '2026-09-30', net: 110_000, estimated: true },
    ]);
    expect(wealthSeries(points).map((point) => point.date)).toEqual([
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
    ]);
    expect(wealthSeries([], 12)).toEqual([]);
  });

  it('repère le premier relevé de chaque année', () => {
    const series = wealthSeries([
      { date: '2025-11-30', savings: 1, receivables: 0, payables: 0 },
      { date: '2025-12-31', savings: 1, receivables: 0, payables: 0 },
      { date: '2026-01-31', savings: 1, receivables: 0, payables: 0 },
      { date: '2026-02-28', savings: 1, receivables: 0, payables: 0 },
    ]);
    expect(wealthYearTicks(series)).toEqual([
      { index: 0, year: '2025' },
      { index: 2, year: '2026' },
    ]);
    expect(wealthYearTicks([])).toEqual([]);
    expect(wealthYearTicks(series.slice(0, 1))).toEqual([{ index: 0, year: '2025' }]);
  });
});
