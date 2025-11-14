import { useMemo, useState } from 'react';
import {
  calculateMetrics,
  loadBaselineAssumptions,
  projectMonthlyCashFlows,
  type Assumptions,
  type UnitAssumption,
} from './model/financeModel';
import './App.css';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

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

const pieColors = ['#1d4ed8', '#0ea5e9', '#fb7185', '#f97316'];

type MetricCard = {
  label: string;
  value: number;
  format: (value: number) => string;
  subtitle?: string;
};

function App() {
  const [assumptions, setAssumptions] = useState<Assumptions>(() => loadBaselineAssumptions());

  const metrics = useMemo(() => calculateMetrics(assumptions), [assumptions]);
  const monthlyProjection = useMemo(() => projectMonthlyCashFlows(assumptions), [assumptions]);

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

  const pieData = [
    { name: 'Gross Rent', value: metrics.grossRentAnnual },
    { name: 'Other Income', value: metrics.otherIncomeAnnual },
    { name: 'Operating Expenses', value: metrics.operatingExpensesAnnual },
    { name: 'Debt Service', value: metrics.debtServiceAnnual },
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
          <div className="input-row compact">
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
            <h3>Income vs Expenses</h3>
            <p>Annualized dollars sourced from baseline workbook.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={80} outerRadius={120} paddingAngle={2}>
                {pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => currencyFormatter.format(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <div className="chart-header">
            <h3>Monthly Cash Flow</h3>
            <p>Projected over the next 12 months.</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthlyProjection}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d3e1ff" />
              <XAxis dataKey="monthIndex" tickFormatter={(value) => `M${value}`} />
              <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number) => currencyFormatter.format(value)} labelFormatter={(label) => `Month ${label}`} />
              <Line type="monotone" dataKey="cashFlow" stroke="#0ea5e9" strokeWidth={3} dot={{ strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

export default App;
