import { useEffect, useMemo, useState } from 'react';
import { calculateMetrics, loadBaselineAssumptions, type Assumptions, type UnitAssumption } from './model/financeModel';
import './App.css';
import {
  BarChart,
  Bar,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { TooltipProps, LabelProps } from 'recharts';

const baselineAssumptions = loadBaselineAssumptions();
const baselineMetrics = calculateMetrics(baselineAssumptions);

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const sanitizeExpenseLabel = (label: string): string =>
  label.replace(/@\s*\d+%/gi, '').replace(/\s+\d+%$/gi, '').replace(/\s{2,}/g, ' ').trim();

const normalizeExpenseLabel = (label: string): string => sanitizeExpenseLabel(label).toLowerCase();

const percentageExpenseLabels = new Set(['management & salaries', 'vacancy and bad debt']);

const computeGrossRentAnnual = (assumptions: Assumptions): number => {
  const unitMix = assumptions.unitMix ?? [];
  const monthlyRent = unitMix.reduce((sum, unit) => sum + unit.units * unit.rent, 0);
  return monthlyRent * 12;
};

const deriveInitialPercentExpenses = (): Record<string, number> => {
  const result: Record<string, number> = {};
  const grossRentAnnual = computeGrossRentAnnual(baselineAssumptions);
  if (grossRentAnnual <= 0) {
    return result;
  }
  Object.entries(baselineAssumptions.operatingExpenses ?? {}).forEach(([label, amount]) => {
    const normalized = normalizeExpenseLabel(label);
    if (percentageExpenseLabels.has(normalized)) {
      result[normalized] = Number(((amount / grossRentAnnual) * 100).toFixed(2));
    }
  });
  return result;
};

type MetricCard = {
  label: string;
  value: number;
  format: (value: number) => string;
  subtitle?: string;
};

type CashFlowBar = {
  name: string;
  value: number;
  color: string;
  isTotal?: boolean;
};

type WaterfallTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: CashFlowBar }>;
};

const WaterfallTooltip = ({ active, payload }: WaterfallTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0].payload as CashFlowBar;

  return (
    <div className="chart-tooltip">
      <strong>{item.name}</strong>
      <span>{item.isTotal ? 'Net Cash Flow' : 'Change'}: {currencyFormatter.format(item.value)}</span>
    </div>
  );
};

const WaterfallLabel = ({ x, y, width, value }: LabelProps) => {
  if (x == null || y == null || width == null || value == null) {
    return null;
  }

  const numericValue = Number(value);
  const isPositive = numericValue >= 0;
  const yPosition = Number(y);
  const labelY = isPositive ? yPosition - 8 : yPosition + 20;
  const labelColor = isPositive ? '#0f172a' : '#b91c1c';
  const xPosition = Number(x) + Number(width) / 2;

  return (
    <text x={xPosition} y={labelY} textAnchor="middle" fill={labelColor} fontSize={12} fontWeight={600}>
      {currencyFormatter.format(numericValue)}
    </text>
  );
};

function App() {
  const [assumptions, setAssumptions] = useState<Assumptions>(() => loadBaselineAssumptions());
  const [percentExpenseValues, setPercentExpenseValues] = useState<Record<string, number>>(() => deriveInitialPercentExpenses());

  const metrics = useMemo(() => calculateMetrics(assumptions), [assumptions]);
  const { waterfallData, waterfallDomain } = useMemo(() => {
    const data: CashFlowBar[] = [
      { name: 'Gross Rent', value: metrics.grossRentAnnual, color: '#0ea5e9' },
      { name: 'Other Income', value: metrics.otherIncomeAnnual, color: '#38bdf8' },
      { name: 'Operating Expenses', value: -metrics.operatingExpensesAnnual, color: '#fb7185' },
      { name: 'Debt Service', value: -metrics.debtServiceAnnual, color: '#f97316' },
      { name: 'Net Cash Flow', value: metrics.cashFlow, color: '#16a34a', isTotal: true },
    ];

    const values = data.map((item) => item.value);
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(0, ...values);
    const paddingBase = Math.max(Math.abs(minValue), Math.abs(maxValue), 1) * 0.15;
    const domain: [number, number] = [minValue - paddingBase, maxValue + paddingBase];

    return { waterfallData: data, waterfallDomain: domain };
  }, [metrics]);

  useEffect(() => {
    if (!Object.keys(percentExpenseValues).length || metrics.grossRentAnnual <= 0) {
      return;
    }

    setAssumptions((prev) => {
      const expenses = { ...(prev.operatingExpenses ?? {}) };
      let changed = false;

      Object.entries(percentExpenseValues).forEach(([normalized, percent]) => {
        const expenseKey = Object.keys(expenses).find(
          (key) => normalizeExpenseLabel(key) === normalized,
        );
        if (!expenseKey) {
          return;
        }
        const nextValue = (percent / 100) * metrics.grossRentAnnual;
        if (!Number.isFinite(nextValue)) {
          return;
        }
        if (Math.abs((expenses[expenseKey] ?? 0) - nextValue) > 0.5) {
          expenses[expenseKey] = nextValue;
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }

      return {
        ...prev,
        operatingExpenses: expenses,
        operatingExpenseTotal: Object.values(expenses).reduce((sum, val) => sum + val, 0),
      };
    });
  }, [metrics.grossRentAnnual, percentExpenseValues]);

  const handlePurchasePriceChange = (value: number) => {
    setAssumptions((prev) => {
      const ratio = (prev.loanToValue ?? 1 - (prev.depositPct ?? 0)) || 0.75;
      return {
        ...prev,
        purchasePrice: value,
        loanAmount: (value + prev.brokerFee) * ratio,
      };
    });
  };

  const handleInterestChange = (value: number) => {
    setAssumptions((prev) => ({ ...prev, interestRate: value }));
  };

  const handleAmortChange = (value: number) => {
    setAssumptions((prev) => ({ ...prev, amortYears: value }));
  };

  const handleLoanToValueChange = (value: number) => {
    const ratio = value / 100;
    setAssumptions((prev) => {
      const totalCost = prev.purchasePrice + prev.brokerFee;
      return {
        ...prev,
        loanToValue: ratio,
        depositPct: 1 - ratio,
        loanAmount: totalCost * ratio,
      };
    });
  };

  const totalOperatingExpenses = useMemo(() => {
    const expenses = assumptions.operatingExpenses ?? {};
    return Object.values(expenses).reduce((sum, value) => sum + value, 0);
  }, [assumptions.operatingExpenses]);

  const handleOperatingExpenseChange = (label: string, value: number) => {
    setAssumptions((prev) => {
      const updated = { ...(prev.operatingExpenses ?? {}) };
      updated[label] = value;
      return {
        ...prev,
        operatingExpenses: updated,
        operatingExpenseTotal: Object.values(updated).reduce((sum, v) => sum + v, 0),
      };
    });
  };

  const handlePercentExpenseChange = (normalizedLabel: string, value: number) => {
    const percentValue = Number.isFinite(value) ? value : 0;
    setPercentExpenseValues((prev) => ({
      ...prev,
      [normalizedLabel]: percentValue,
    }));
  };

  const handleUnitRentChange = (unitIndex: number, rent: number) => {
    setAssumptions((prev) => {
      const updatedUnits = prev.unitMix.map((unit, index) => (index === unitIndex ? { ...unit, rent } : unit));
      return {
        ...prev,
        unitMix: updatedUnits,
      };
    });
  };

  const assumptionCards: MetricCard[] = [
    {
      label: 'Capex Adjusted Purchase Price',
      value: assumptions.purchasePrice + assumptions.brokerFee,
      format: currencyFormatter.format,
      subtitle: 'Price + broker fee',
    },
    {
      label: 'Loan Amount',
      value: metrics.loanAmountEffective,
      format: currencyFormatter.format,
      subtitle: `${Math.round((assumptions.loanToValue ?? 0) * 100)}% LTV`,
    },
    {
      label: 'Equity Required',
      value: metrics.equityRequired,
      format: currencyFormatter.format,
      subtitle: percentFormatter.format(assumptions.depositPct ?? 0),
    },
  ];

  const metricCards: MetricCard[] = [
    { label: 'NOI', value: metrics.noi, format: currencyFormatter.format },
    { label: 'Annual Cash Flow', value: metrics.cashFlow, format: currencyFormatter.format },
    { label: 'Cash-on-Cash', value: metrics.cashOnCash, format: percentFormatter.format },
    { label: 'DSCR', value: metrics.dscr, format: (value) => value.toFixed(2) },
    { label: 'Cap Rate', value: metrics.capRate, format: percentFormatter.format },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">8-Plex Model</p>
          <h1>CMHC MLI Select Investment Calculator</h1>
        </div>
        <div className="baseline-chip">
          Baseline NOI: {currencyFormatter.format(baselineMetrics.noi)}
        </div>
      </header>

      <section className="panel-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Capital Stack</h2>
            <p>Purchase price, debt terms, and equity.</p>
          </div>
          <div className="input-control">
            <label htmlFor="purchasePrice">Purchase Price</label>
            <div className="input-row">
              <input
                id="purchasePrice"
                type="range"
                min={1_500_000}
                max={3_500_000}
                step={10_000}
                value={assumptions.purchasePrice}
                onChange={(event) => handlePurchasePriceChange(Number(event.target.value))}
              />
              <div className="currency-input">
                <span className="prefix">$</span>
                <input
                  type="number"
                  value={Math.round(assumptions.purchasePrice)}
                  onChange={(event) => handlePurchasePriceChange(Number(event.target.value))}
                />
              </div>
            </div>
          </div>
          <div className="input-control">
            <label htmlFor="loanToValue">Loan to Value</label>
            <div className="input-row">
              <input
                id="loanToValue"
                type="range"
                min={50}
                max={95}
                step={1}
                value={Math.round((assumptions.loanToValue ?? 0) * 100)}
                onChange={(event) => handleLoanToValueChange(Number(event.target.value))}
              />
              <input
                type="number"
                value={Math.round((assumptions.loanToValue ?? 0) * 100)}
                onChange={(event) => handleLoanToValueChange(Number(event.target.value))}
              />
              <span className="suffix">%</span>
            </div>
          </div>
          <div className="input-stack">
            <div className="input-control">
              <label htmlFor="interestRate">Interest Rate</label>
              <div className="input-row">
                <input
                  id="interestRate"
                  type="range"
                  min={2}
                  max={8}
                  step={0.05}
                  value={(assumptions.interestRate ?? 0) * 100}
                  onChange={(event) => handleInterestChange(Number(event.target.value) / 100)}
                />
                <input
                  type="number"
                  value={Number(((assumptions.interestRate ?? 0) * 100).toFixed(2))}
                  onChange={(event) => handleInterestChange(Number(event.target.value) / 100)}
                />
                <span className="suffix">%</span>
              </div>
            </div>
            <div className="input-control">
              <label htmlFor="amortYears">Amortization (Years)</label>
              <div className="input-row">
                <input
                  id="amortYears"
                  type="range"
                  min={15}
                  max={50}
                  step={1}
                  value={assumptions.amortYears}
                  onChange={(event) => handleAmortChange(Number(event.target.value))}
                />
                <input
                  type="number"
                  value={assumptions.amortYears}
                  onChange={(event) => handleAmortChange(Number(event.target.value))}
                />
              </div>
            </div>
          </div>
          <div className="assumption-cards">
            {assumptionCards.map((card) => (
              <div key={card.label} className="metric-card subtle">
                <p className="metric-label">{card.label}</p>
                <p className="metric-value">{card.format(card.value)}</p>
                {card.subtitle && <p className="metric-subtitle">{card.subtitle}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Rents & Income</h2>
            <p>Update the rent roll and other monthly revenue streams.</p>
          </div>
          <div className="unit-grid">
            {assumptions.unitMix.map((unit: UnitAssumption, index: number) => (
              <div key={unit.name} className="unit-card">
                <p className="unit-label">
                  {unit.units}x {unit.name}
                </p>
                <label>
                  Monthly Rent
                <div className="currency-input">
                  <span className="prefix">$</span>
                  <input
                    type="number"
                    value={unit.rent}
                    onChange={(event) => handleUnitRentChange(index, Number(event.target.value))}
                  />
                </div>
                </label>
              </div>
            ))}
          </div>
          <div className="other-income">
            {assumptions.otherIncomeItems.map((item, index) => (
              <div key={item.name} className="unit-card">
                <p className="unit-label">{item.name}</p>
                <label>
                  Monthly Amount
                  <div className="currency-input">
                    <span className="prefix">$</span>
                    <input
                      type="number"
                      value={item.monthlyAmount}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setAssumptions((prev) => {
                          const updated = prev.otherIncomeItems.map((income, idx) =>
                            idx === index ? { ...income, monthlyAmount: value } : income,
                          );
                          return { ...prev, otherIncomeItems: updated };
                        });
                      }}
                    />
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Operating Expenses</h2>
            <p>Control total opex or fine-tune individual categories.</p>
          </div>
          <div className="expense-row total">
            <div>
              <p>Total Opex</p>
              <h3>{currencyFormatter.format(totalOperatingExpenses)}</h3>
            </div>
            <p className="muted">Per year</p>
          </div>
          <div className="expense-list">
            {Object.entries(assumptions.operatingExpenses ?? {}).map(([label, value]) => {
              const displayLabel = sanitizeExpenseLabel(label);
              const normalizedLabel = normalizeExpenseLabel(label);
              const isPercentExpense = percentageExpenseLabels.has(normalizedLabel);
              return (
                <div key={label} className="expense-item">
                  <label>
                    {displayLabel}
                    {isPercentExpense ? (
                      <div className="percent-input">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={percentExpenseValues[normalizedLabel] ?? 0}
                          onChange={(event) => handlePercentExpenseChange(normalizedLabel, Number(event.target.value))}
                        />
                        <span className="suffix">%</span>
                      </div>
                    ) : (
                      <div className="currency-input">
                        <span className="prefix">$</span>
                        <input
                          type="number"
                          value={Math.round(value)}
                          onChange={(event) => handleOperatingExpenseChange(label, Number(event.target.value))}
                        />
                      </div>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {metricCards.map((card) => (
          <div key={card.label} className="metric-card">
            <p className="metric-label">{card.label}</p>
            <p className="metric-value">{card.format(card.value)}</p>
            {card.subtitle && <p className="metric-subtitle">{card.subtitle}</p>}
          </div>
        ))}
      </section>

      <section className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <h3>Annual Cash Flow Waterfall</h3>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={waterfallData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d3e1ff" />
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 12 }} />
              <YAxis domain={waterfallDomain} hide />
              <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
              <Bar dataKey="value" radius={[10, 10, 10, 10]}>
                {waterfallData.map((entry) => (
                  <Cell key={entry.name} fill={entry.isTotal ? '#16a34a' : entry.color} />
                ))}
                <LabelList dataKey="value" content={<WaterfallLabel />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export default App;
