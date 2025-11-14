import { describe, expect, test } from 'vitest';
import baseline from '../model/baseline.json';
import { calculateMetrics, loadBaselineAssumptions, projectMonthlyCashFlows } from '../model/financeModel';

const TOLERANCE = 1e-2;

describe('finance model', () => {
  test('baseline matches workbook outputs', () => {
    const assumptions = loadBaselineAssumptions();
    const metrics = calculateMetrics(assumptions);

    expect(metrics.noi).toBeCloseTo(baseline.outputs.noi, TOLERANCE);
    expect(metrics.cashFlow).toBeCloseTo(baseline.outputs.cash_flow, TOLERANCE);
    expect(metrics.cashOnCash).toBeCloseTo(baseline.outputs.cash_on_cash, TOLERANCE);
    expect(metrics.dscr).toBeCloseTo(baseline.outputs.dscr, TOLERANCE);
    expect(metrics.capRate).toBeCloseTo(baseline.outputs.cap_rate, TOLERANCE);
  });

  test('richer rent and steadier debt improve returns', () => {
    const baselineAssumptions = loadBaselineAssumptions();
    const baseMetrics = calculateMetrics(baselineAssumptions);

    const adjusted = loadBaselineAssumptions();
    adjusted.unitMix = adjusted.unitMix.map((unit) => ({ ...unit, rent: unit.rent * 1.05 }));
    adjusted.interestRate = Math.max(adjusted.interestRate - 0.005, 0.001);

    const adjustedMetrics = calculateMetrics(adjusted);

    expect(adjustedMetrics.noi).toBeGreaterThan(baseMetrics.noi);
    expect(adjustedMetrics.cashFlow).toBeGreaterThan(baseMetrics.cashFlow);
    expect(adjustedMetrics.dscr).toBeGreaterThan(baseMetrics.dscr);
  });

  test('monthly projection sums to annual cash flow', () => {
    const assumptions = loadBaselineAssumptions();
    const metrics = calculateMetrics(assumptions);
    const monthlyProjection = projectMonthlyCashFlows(assumptions);
    const projectedAnnual = monthlyProjection.reduce((sum, row) => sum + row.cashFlow, 0);

    expect(projectedAnnual).toBeCloseTo(metrics.cashFlow, TOLERANCE);
  });
});
