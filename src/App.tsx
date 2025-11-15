import { useMemo, useState } from 'react';
import { calculateMetrics, loadBaselineAssumptions, type Assumptions, type UnitAssumption } from './model/financeModel';
import './App.css';
import {
  ComposedChart,
  Bar,
  Customized,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { RectRadius } from 'recharts/types/shape/Rectangle';

const baselineMetrics = calculateMetrics(loadBaselineAssumptions());

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

type MetricCard = {
  label: string;
  value: number;
  format: (value: number) => string;
  subtitle?: string;
};

type WaterfallPoint = {
  name: string;
  value: number;
  start: number;
  end: number;
  color: string;
  isTotal?: boolean;
};

type WaterfallTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: WaterfallPoint }>;
};

const WaterfallTooltip = ({ active, payload }: WaterfallTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0].payload as WaterfallPoint;

  return (
    <div className="chart-tooltip">
      <strong>{item.name}</strong>
      <span>{item.isTotal ? 'Net Cash Flow' : 'Change'}: {currencyFormatter.format(item.value)}</span>
      {!item.isTotal && <span>Run Rate: {currencyFormatter.format(item.end)}</span>}
      {item.isTotal && <span>Monthly Run Rate: {currencyFormatter.format(item.end)}</span>}
    </div>
  );
};

const WaterfallBars = ({ data, xAxisMap, yAxisMap, offset }: { data: WaterfallPoint[] } & Record<string, any>) => {
  if (!xAxisMap || !yAxisMap) {
    return null;
  }

  const xAxis = Object.values(xAxisMap)[0] as any;
  const yAxis = Object.values(yAxisMap)[0] as any;

  if (!xAxis || !yAxis || !offset) {
    return null;
  }

  const xScale = xAxis.scale as ((value: string) => number) & { bandwidth?: () => number };
  const yScale = yAxis.scale as (value: number) => number;

  if (typeof xScale !== 'function' || typeof yScale !== 'function') {
    return null;
  }

  const rawBandwidth =
    typeof xAxis.bandwidth === 'number'
      ? xAxis.bandwidth
      : typeof xScale.bandwidth === 'function'
        ? xScale.bandwidth()
        : 0;

  const barWidth = rawBandwidth > 0 ? rawBandwidth * 0.55 : 28;

  return (
    <g>
      {data.map((entry, index) => {
        const xValue = xScale(entry.name);
        if (typeof xValue !== 'number') {
          return null;
        }
        const barX = offset.left + xValue + (rawBandwidth - barWidth) / 2;
        const topValue = Math.max(entry.start, entry.end);
        const bottomValue = Math.min(entry.start, entry.end);
        const yTop = offset.top + yScale(topValue);
        const yBottom = offset.top + yScale(bottomValue);
        const height = Math.abs(yBottom - yTop) || 2;
        const totalRadius: RectRadius = [10, 10, 10, 10];
        const positiveRadius: RectRadius = [10, 10, 2, 2];
        const negativeRadius: RectRadius = [2, 2, 10, 10];
        const radius: RectRadius = entry.isTotal ? totalRadius : entry.value >= 0 ? positiveRadius : negativeRadius;
        const labelY = entry.value >= 0 ? yTop - 8 : yBottom + 16;
        const labelColor = entry.value >= 0 ? '#0f172a' : '#b91c1c';

        const nextEntry = data[index + 1];
        const nextXValue = nextEntry ? xScale(nextEntry.name) : null;

        return (
          <g key={entry.name}>
            <Rectangle
              x={barX}
              y={Math.min(yTop, yBottom)}
              width={barWidth}
              height={Math.max(height, 2)}
              fill={entry.color}
              radius={radius}
            />
            <text x={barX + barWidth / 2} y={labelY} textAnchor="middle" fill={labelColor} fontSize={12} fontWeight={600}>
              {currencyFormatter.format(entry.isTotal ? entry.end : entry.value)}
            </text>
            {nextEntry && typeof nextXValue === 'number' && (
              <line
                x1={barX + barWidth}
                x2={offset.left + nextXValue + (rawBandwidth - barWidth) / 2}
                y1={offset.top + yScale(entry.end)}
                y2={offset.top + yScale(entry.end)}
                stroke="#cbd5f5"
                strokeWidth={2}
                strokeDasharray="4"
              />
            )}
          </g>
        );
      })}
    </g>
  );
};

function App() {
  const [assumptions, setAssumptions] = useState<Assumptions>(() => loadBaselineAssumptions());

  const metrics = useMemo(() => calculateMetrics(assumptions), [assumptions]);
  const { waterfallData, waterfallDomain } = useMemo(() => {
    const rentMonthly = metrics.grossRentAnnual / 12;
    const otherIncomeMonthly = metrics.otherIncomeAnnual / 12;
    const opexMonthly = metrics.operatingExpensesAnnual / 12;
    const debtMonthly = metrics.debtServiceAnnual / 12;

    const steps: Omit<WaterfallPoint, 'start' | 'end'>[] = [
      { name: 'Rental Income', value: rentMonthly, color: '#0ea5e9' },
      { name: 'Other Income', value: otherIncomeMonthly, color: '#38bdf8' },
      { name: 'Operating Expenses', value: -opexMonthly, color: '#fb7185' },
      { name: 'Debt Service', value: -debtMonthly, color: '#f97316' },
    ];

    let cumulative = 0;
    const breakdown: WaterfallPoint[] = steps.map((step) => {
      const start = cumulative;
      const end = cumulative + step.value;
      cumulative = end;
      return {
        ...step,
        start,
        end,
      };
    });

    breakdown.push({
      name: 'Net Cash Flow',
      value: cumulative,
      start: 0,
      end: cumulative,
      color: cumulative >= 0 ? '#16a34a' : '#dc2626',
      isTotal: true,
    });

    const extremes = breakdown.reduce(
      (acc, point) => ({
        min: Math.min(acc.min, point.start, point.end),
        max: Math.max(acc.max, point.start, point.end),
      }),
      { min: 0, max: 0 },
    );

    const padding = Math.max(Math.abs(extremes.max), Math.abs(extremes.min)) * 0.1;
    const domainMin = Math.min(0, extremes.min - padding);
    const domainMax = Math.max(0, extremes.max + padding);

    return {
      waterfallData: breakdown,
      waterfallDomain: [domainMin, domainMax] as [number, number],
    };
  }, [metrics]);

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
          <h1>Real Estate Finance Dashboard</h1>
          <p>Adjust assumptions pulled directly from 8plexmodel.xlsx and watch the underwriting update instantly.</p>
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
              <input
                type="number"
                value={Math.round(assumptions.purchasePrice)}
                onChange={(event) => handlePurchasePriceChange(Number(event.target.value))}
              />
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
                  <input
                    type="number"
                    value={unit.rent}
                    onChange={(event) => handleUnitRentChange(index, Number(event.target.value))}
                  />
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
            {Object.entries(assumptions.operatingExpenses ?? {}).map(([label, value]) => (
              <div key={label} className="expense-item">
                <label>
                  {label}
                  <input
                    type="number"
                    value={Math.round(value)}
                    onChange={(event) => handleOperatingExpenseChange(label, Number(event.target.value))}
                  />
                </label>
              </div>
            ))}
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
            <h3>Monthly Cash Flow Waterfall</h3>
            <p>Track how recurring income covers expenses and debt service.</p>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={waterfallData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d3e1ff" />
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 12 }} />
              <YAxis domain={waterfallDomain} tickFormatter={(value) => currencyFormatter.format(value)} tick={{ fill: '#475569', fontSize: 12 }} />
              <Tooltip content={<WaterfallTooltip />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
              <Bar dataKey="value" fill="transparent" isAnimationActive={false} />
              <Customized component={<WaterfallBars data={waterfallData} />} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export default App;
