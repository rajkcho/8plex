import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { calculateMetrics, loadBaselineAssumptions, type Assumptions, type UnitAssumption } from './model/financeModel';
import diskIcon from '../disk.png';
import headerLogo from '../logo2.png';
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
import rentsCsv from '../rents.csv?raw';

const baselineAssumptions = loadBaselineAssumptions();
const baselineMetrics = calculateMetrics(baselineAssumptions);
const scenarioApiBaseUrl = import.meta.env.VITE_SCENARIO_API_URL ?? '';

const buildScenarioUrl = (path: string): string => (scenarioApiBaseUrl ? `${scenarioApiBaseUrl}${path}` : path);

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const formatCurrencyInputValue = (value?: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return '';
  }
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

const parseCurrencyInputValue = (raw: string): number => {
  if (!raw) {
    return 0;
  }
  const sanitized = raw.replace(/[^0-9.-]/g, '');
  if (!sanitized || sanitized === '-' || sanitized === '.' || sanitized === '-.' || sanitized === '.-') {
    return 0;
  }
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sanitizeExpenseLabel = (label: string): string =>
  label.replace(/@\s*\d+%/gi, '').replace(/\s+\d+%$/gi, '').replace(/\s{2,}/g, ' ').trim();

const normalizeExpenseLabel = (label: string): string => sanitizeExpenseLabel(label).toLowerCase();

const slugifyLabel = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const percentageExpenseLabels = new Set(['vacancy and bad debt', 'management & salaries']);

type MarketRentRow = {
  city: string;
  bachelor: number;
  oneBedroom: number;
  twoBedroom: number;
  threeBedroom: number;
};

const parseCsvLine = (line: string): string[] => {
  const sanitizedLine = line.replace(/^\uFEFF/, '');
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < sanitizedLine.length; index += 1) {
    const char = sanitizedLine[index];
    if (char === '"') {
      if (inQuotes && sanitizedLine[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

const parseCurrencyValue = (value: string): number => {
  const cleaned = value.replace(/[^\d.-]/g, '');
  const parsed = Number(cleaned || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseMarketRentCsv = (csv: string): MarketRentRow[] => {
  if (!csv) {
    return [];
  }

  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);

  if (!lines.length) {
    return [];
  }

  const headerCells = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const columnIndexes = {
    city: headerCells.findIndex((cell) => cell === 'city'),
    bachelor: headerCells.findIndex((cell) => cell === 'bachelor'),
    oneBedroom: headerCells.findIndex((cell) => cell === '1br'),
    twoBedroom: headerCells.findIndex((cell) => cell === '2br'),
    threeBedroom: headerCells.findIndex((cell) => cell === '3br'),
  };

  if (Object.values(columnIndexes).some((value) => value === -1)) {
    return [];
  }

  return lines.slice(1).reduce<MarketRentRow[]>((acc, line) => {
    const cells = parseCsvLine(line);
    const city = cells[columnIndexes.city] ?? '';
    if (!city) {
      return acc;
    }

    acc.push({
      city,
      bachelor: parseCurrencyValue(cells[columnIndexes.bachelor] ?? ''),
      oneBedroom: parseCurrencyValue(cells[columnIndexes.oneBedroom] ?? ''),
      twoBedroom: parseCurrencyValue(cells[columnIndexes.twoBedroom] ?? ''),
      threeBedroom: parseCurrencyValue(cells[columnIndexes.threeBedroom] ?? ''),
    });
    return acc;
  }, []);
};

const marketRentData = parseMarketRentCsv(rentsCsv);

const computeGrossRentAnnual = (assumptions: Assumptions): number => {
  const unitMix = assumptions.unitMix ?? [];
  const monthlyRent = unitMix.reduce((sum, unit) => sum + unit.units * unit.rent, 0);
  return monthlyRent * 12;
};

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const derivePercentExpenseValues = (source: Assumptions): Record<string, number> => {
  const result: Record<string, number> = {};
  const grossRentAnnual = computeGrossRentAnnual(source);
  if (grossRentAnnual <= 0) {
    return result;
  }
  Object.entries(source.operatingExpenses ?? {}).forEach(([label, amount]) => {
    const normalized = normalizeExpenseLabel(label);
    if (percentageExpenseLabels.has(normalized)) {
      result[normalized] = Number(((amount / grossRentAnnual) * 100).toFixed(2));
    }
  });
  return result;
};

type SavedScenario = {
  id: string;
  name: string;
  createdAt: string;
  assumptions: Assumptions;
};

const formatScenarioTimestamp = (isoString: string): string => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${month}-${day}-${year} ${hours}:${minutes}${period}`;
};

const parseScenarioFromApi = (raw: unknown): SavedScenario | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const { id, name, createdAt, assumptions } = candidate;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof createdAt !== 'string') {
    return null;
  }
  if (!assumptions || typeof assumptions !== 'object') {
    return null;
  }
  return {
    id,
    name,
    createdAt,
    assumptions: deepClone(assumptions as Assumptions),
  };
};

type MetricTooltip = {
  title: string;
  description: string;
};

type MetricCard = {
  label: string;
  value: number;
  format: (value: number) => string;
  subtitle?: string;
  tooltip?: MetricTooltip;
};

type MetricCardViewProps = {
  card: MetricCard;
};

const MetricCardView = ({ card }: MetricCardViewProps) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipAlign, setTooltipAlign] = useState<'left' | 'right'>('left');
  const tooltipId = `metric-tooltip-${slugifyLabel(card.label)}`;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const evaluateTooltipAlignment = () => {
    if (typeof window === 'undefined') {
      setTooltipAlign('left');
      return;
    }
    const cardElement = cardRef.current;
    const tooltipElement = tooltipRef.current;
    if (!cardElement || !tooltipElement) {
      setTooltipAlign('left');
      return;
    }
    const tooltipWidth = tooltipElement.offsetWidth || 0;
    const cardBounds = cardElement.getBoundingClientRect();
    const spaceOnRight = window.innerWidth - cardBounds.left;
    const spaceOnLeft = cardBounds.right;
    if (spaceOnRight < tooltipWidth && spaceOnLeft >= tooltipWidth) {
      setTooltipAlign('right');
    } else if (spaceOnLeft < tooltipWidth && spaceOnRight >= tooltipWidth) {
      setTooltipAlign('left');
    } else {
      setTooltipAlign(spaceOnRight >= spaceOnLeft ? 'left' : 'right');
    }
  };

  const showTooltip = () => {
    setIsTooltipVisible(true);
    if (typeof window === 'undefined') {
      setTooltipAlign('left');
      return;
    }
    window.requestAnimationFrame(() => evaluateTooltipAlignment());
  };
  const hideTooltip = () => setIsTooltipVisible(false);

  useEffect(() => {
    if (!isTooltipVisible || typeof window === 'undefined') {
      return;
    }
    const handleResize = () => evaluateTooltipAlignment();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isTooltipVisible]);

  return (
    <div className="metric-card" ref={cardRef}>
      <div className="metric-card-header">
        <p className="metric-label">{card.label}</p>
        {card.tooltip && (
          <button
            type="button"
            className="metric-info-button"
            aria-label={`What is ${card.tooltip.title}?`}
            aria-describedby={tooltipId}
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            onPointerEnter={showTooltip}
            onPointerLeave={hideTooltip}
            onFocus={showTooltip}
            onBlur={hideTooltip}
          >
            <span aria-hidden="true">?</span>
            <div
              id={tooltipId}
              ref={tooltipRef}
              className="metric-tooltip"
              role="tooltip"
              data-visible={isTooltipVisible}
              data-align={tooltipAlign}
            >
              <p className="metric-tooltip-title">{card.tooltip.title}</p>
              <p className="metric-tooltip-text">{card.tooltip.description}</p>
            </div>
          </button>
        )}
      </div>
      <p className="metric-value">{card.format(card.value)}</p>
      {card.subtitle && <p className="metric-subtitle">{card.subtitle}</p>}
    </div>
  );
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

type ScenarioComparisonBar = {
  id: string;
  name: string;
  cashFlow: number;
};

type ScenarioComparisonTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: ScenarioComparisonBar }>;
};

const ScenarioComparisonTooltip = ({ active, payload }: ScenarioComparisonTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0].payload as ScenarioComparisonBar;

  return (
    <div className="chart-tooltip">
      <strong>{item.name}</strong>
      <span>Net Cash Flow: {currencyFormatter.format(item.cashFlow)}</span>
    </div>
  );
};

function App() {
  const [assumptions, setAssumptions] = useState<Assumptions>(() => loadBaselineAssumptions());
  const [percentExpenseValues, setPercentExpenseValues] = useState<Record<string, number>>(() =>
    derivePercentExpenseValues(baselineAssumptions),
  );
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [isLoadingScenarios, setIsLoadingScenarios] = useState(false);
  const [isSavingScenario, setIsSavingScenario] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [selectedMarketCity, setSelectedMarketCity] = useState<string>(marketRentData[0]?.city ?? '');
  const [newExpenseLabel, setNewExpenseLabel] = useState('');
  const [newExpenseValue, setNewExpenseValue] = useState('');
  const [newExpenseError, setNewExpenseError] = useState<string | null>(null);

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
  const { scenarioComparisonData, scenarioComparisonDomain } = useMemo(() => {
    if (!scenarios.length) {
      return {
        scenarioComparisonData: [] as ScenarioComparisonBar[],
        scenarioComparisonDomain: [0, 0] as [number, number],
      };
    }
    const data = scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      cashFlow: calculateMetrics(scenario.assumptions).cashFlow,
    }));
    const values = data.map((item) => item.cashFlow);
    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(0, ...values);
    const paddingBase = Math.max(Math.abs(minValue), Math.abs(maxValue), 1) * 0.15;
    return {
      scenarioComparisonData: data,
      scenarioComparisonDomain: [minValue - paddingBase, maxValue + paddingBase] as [number, number],
    };
  }, [scenarios]);
  const currentMarketRentCity = selectedMarketCity || marketRentData[0]?.city || '';
  const selectedMarketRentRow = marketRentData.find((row) => row.city === currentMarketRentCity);

  useEffect(() => {
    let isMounted = true;
    const fetchScenarios = async () => {
      setIsLoadingScenarios(true);
      try {
        const response = await fetch(buildScenarioUrl('/api/scenarios'));
        const payload = (await response.json().catch(() => ({}))) as { scenarios?: unknown; message?: string };
        if (!response.ok) {
          throw new Error(payload?.message ?? 'Unable to load scenarios');
        }
        const parsedScenarios: SavedScenario[] = Array.isArray(payload.scenarios)
          ? payload.scenarios
              .map((entry: unknown) => parseScenarioFromApi(entry))
              .filter((entry): entry is SavedScenario => entry != null)
          : [];
        if (isMounted) {
          setScenarios(parsedScenarios);
        }
      } catch (error) {
        if (isMounted) {
          setScenarioError(error instanceof Error ? error.message : 'Unable to load scenarios');
        }
      } finally {
        if (isMounted) {
          setIsLoadingScenarios(false);
        }
      }
    };

    fetchScenarios();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const handleBrokerFeeChange = (value: number) => {
    setAssumptions((prev) => {
      const ratio = (prev.loanToValue ?? 1 - (prev.depositPct ?? 0)) || 0.75;
      const totalCost = prev.purchasePrice + value;
      return {
        ...prev,
        brokerFee: value,
        loanAmount: totalCost * ratio,
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
  const operatingExpenseEntries = useMemo(() => {
    const expenses = Object.entries(assumptions.operatingExpenses ?? {});
    if (!expenses.length) {
      return expenses;
    }
    const managementIndex = expenses.findIndex(
      ([label]) => normalizeExpenseLabel(label) === 'management & salaries',
    );
    const vacancyIndex = expenses.findIndex(
      ([label]) => normalizeExpenseLabel(label) === 'vacancy and bad debt',
    );
    if (managementIndex === -1 || vacancyIndex === -1) {
      return expenses;
    }
    if (managementIndex === vacancyIndex + 1) {
      return expenses;
    }
    const [managementEntry] = expenses.splice(managementIndex, 1);
    const updatedVacancyIndex = expenses.findIndex(
      ([label]) => normalizeExpenseLabel(label) === 'vacancy and bad debt',
    );
    if (updatedVacancyIndex === -1) {
      expenses.push(managementEntry);
      return expenses;
    }
    expenses.splice(updatedVacancyIndex + 1, 0, managementEntry);
    return expenses;
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

  const handleAddOperatingExpense = () => {
    const trimmedLabel = newExpenseLabel.trim();
    if (!trimmedLabel) {
      setNewExpenseError('Enter an expense name.');
      return;
    }
    const normalizedLabel = normalizeExpenseLabel(trimmedLabel);
    const existingKey = Object.keys(assumptions.operatingExpenses ?? {}).find(
      (key) => normalizeExpenseLabel(key) === normalizedLabel,
    );
    if (existingKey) {
      setNewExpenseError('This expense already exists.');
      return;
    }
    const amountValue = parseCurrencyInputValue(newExpenseValue);
    setAssumptions((prev) => {
      const updated = { ...(prev.operatingExpenses ?? {}) };
      updated[trimmedLabel] = amountValue;
      return {
        ...prev,
        operatingExpenses: updated,
        operatingExpenseTotal: Object.values(updated).reduce((sum, val) => sum + val, 0),
      };
    });
    setNewExpenseLabel('');
    setNewExpenseValue('');
    setNewExpenseError(null);
  };

  const updateUnitMixEntry = (unitIndex: number, updates: Partial<UnitAssumption>) => {
    setAssumptions((prev) => {
      const currentUnitMix = prev.unitMix ?? [];
      const updatedUnits = currentUnitMix.map((unit, index) => (index === unitIndex ? { ...unit, ...updates } : unit));
      return {
        ...prev,
        unitMix: updatedUnits,
      };
    });
  };

  const handleUnitRentChange = (unitIndex: number, rent: number) => {
    const sanitizedRent = Number.isFinite(rent) ? Math.max(0, rent) : 0;
    updateUnitMixEntry(unitIndex, { rent: sanitizedRent });
  };

  const handleUnitCountChange = (unitIndex: number, units: number) => {
    const sanitizedUnits = Number.isFinite(units) ? Math.max(0, Math.round(units)) : 0;
    updateUnitMixEntry(unitIndex, { units: sanitizedUnits });
  };

  const handleUnitBedroomChange = (unitIndex: number, bedrooms: number) => {
    const sanitizedBedrooms = Number.isFinite(bedrooms) ? Math.max(0, Math.round(bedrooms)) : 0;
    updateUnitMixEntry(unitIndex, { bedrooms: sanitizedBedrooms });
  };

  const handleUnitNameChange = (unitIndex: number, name: string) => {
    updateUnitMixEntry(unitIndex, { name });
  };

  const handleAddUnitType = () => {
    setAssumptions((prev) => {
      const currentUnitMix = prev.unitMix ?? [];
      const nextIndex = currentUnitMix.length + 1;
      const newUnit: UnitAssumption = {
        name: `Unit Type ${nextIndex}`,
        units: 0,
        rent: 0,
        bedrooms: 0,
      };
      return {
        ...prev,
        unitMix: [...currentUnitMix, newUnit],
      };
    });
  };

  const handleRemoveUnitType = (unitIndex: number) => {
    setAssumptions((prev) => {
      const currentUnitMix = prev.unitMix ?? [];
      if (currentUnitMix.length <= 1) {
        return prev;
      }
      const updatedUnits = currentUnitMix.filter((_, index) => index !== unitIndex);
      return {
        ...prev,
        unitMix: updatedUnits,
      };
    });
  };

  const handleScenarioSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSaveScenario();
  };

  const handleScenarioSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const scenarioId = event.target.value;
    if (!scenarioId) {
      setActiveScenarioId(null);
      return;
    }
    const scenario = scenarios.find((entry) => entry.id === scenarioId);
    if (scenario) {
      handleApplyScenario(scenario);
    }
  };

  const handleSaveScenario = async (): Promise<void> => {
    const trimmedName = scenarioName.trim();
    if (!trimmedName) {
      setScenarioError('Please provide a scenario name.');
      return;
    }
    setIsSavingScenario(true);
    setScenarioError(null);
    try {
      const response = await fetch(buildScenarioUrl('/api/scenarios'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: trimmedName, assumptions: deepClone(assumptions) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { scenario?: unknown; message?: string };
      if (!response.ok) {
        throw new Error(payload?.message ?? 'Unable to save scenario');
      }
      const savedScenario = parseScenarioFromApi(payload.scenario);
      if (!savedScenario) {
        throw new Error('Received malformed scenario payload');
      }
      setScenarios((prev) => [savedScenario, ...prev.filter((scenario) => scenario.id !== savedScenario.id)]);
      setScenarioName('');
      setActiveScenarioId(savedScenario.id);
    } catch (error) {
      setScenarioError(error instanceof Error ? error.message : 'Unable to save scenario');
    } finally {
      setIsSavingScenario(false);
    }
  };

  const handleApplyScenario = (scenario: SavedScenario) => {
    const nextAssumptions = deepClone(scenario.assumptions);
    setAssumptions(nextAssumptions);
    setPercentExpenseValues(derivePercentExpenseValues(nextAssumptions));
    setActiveScenarioId(scenario.id);
    setScenarioError(null);
  };

  const handleDeleteScenario = async (scenarioId: string): Promise<void> => {
    try {
      setScenarioError(null);
      const response = await fetch(buildScenarioUrl(`/api/scenarios/${scenarioId}`), { method: 'DELETE' });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload?.message ?? 'Unable to delete scenario');
      }
      setScenarios((prev) => prev.filter((scenario) => scenario.id !== scenarioId));
      if (activeScenarioId === scenarioId) {
        setActiveScenarioId(null);
      }
    } catch (error) {
      setScenarioError(error instanceof Error ? error.message : 'Unable to delete scenario');
    }
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
    {
      label: 'NOI',
      value: metrics.noi,
      format: currencyFormatter.format,
      tooltip: {
        title: 'NOI',
        description: 'Net Operating Income. Rental income minus operating expenses, before debt service and taxes.',
      },
    },
    {
      label: 'Annual CF',
      value: metrics.cashFlow,
      format: currencyFormatter.format,
      tooltip: {
        title: 'ANNUAL CASH FLOW',
        description: 'Total cash received from the property in a year after all expenses and debt payments.',
      },
    },
    {
      label: 'Cash-on-Cash',
      value: metrics.cashOnCash,
      format: percentFormatter.format,
      tooltip: {
        title: 'CASH-ON-CASH RETURN',
        description: 'Annual pre-tax cash flow divided by the total cash you invested in the deal.',
      },
    },
    {
      label: 'DSCR',
      value: metrics.dscr,
      format: percentFormatter.format,
      tooltip: {
        title: 'DSCR',
        description:
          'Debt Service Coverage Ratio. NOI divided by annual loan payments, showing how easily the property covers its debt.',
      },
    },
    {
      label: 'Cap Rate',
      value: metrics.capRate,
      format: percentFormatter.format,
      tooltip: {
        title: 'CAP RATE',
        description:
          'Capitalization Rate. NOI divided by the purchase price or property value, expressed as a percentage.',
      },
    },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-top">
          <div className="header-branding">
            <img src={headerLogo} alt="MLI Calc" className="app-logo" />
          </div>
          <div className="baseline-chip">
            Baseline NOI: {currencyFormatter.format(baselineMetrics.noi)}
          </div>
        </div>
        <div className="header-metrics">
          {metricCards.map((card) => (
            <MetricCardView key={card.label} card={card} />
          ))}
        </div>
      </header>

      <section className="panel-sections">
        <div className="panel-grid">
          <div className="panel scenario-panel">
            <div className="panel-header">
              <h2>Scenario Library</h2>
              <p>Save and share assumptions so anyone can load them later.</p>
            </div>
            <form className="scenario-form" onSubmit={handleScenarioSubmit}>
              <label htmlFor="scenarioName">Scenario Name</label>
              <div className="scenario-input-row">
                <input
                  id="scenarioName"
                  type="text"
                  value={scenarioName}
                  placeholder="e.g. Optimistic Lease-Up"
                  onChange={(event) => {
                    setScenarioName(event.target.value);
                    if (scenarioError) {
                      setScenarioError(null);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={isSavingScenario || !scenarioName.trim()}
                  aria-label="Save scenario"
                  title="Save scenario"
                >
                  {isSavingScenario ? (
                    'Saving...'
                  ) : (
                    <img src={diskIcon} alt="" aria-hidden="true" className="scenario-save-icon" />
                  )}
                </button>
              </div>
            </form>
            {scenarioError && <p className="scenario-error">{scenarioError}</p>}
            <div className="scenario-picker">
              {isLoadingScenarios ? (
                <p className="scenario-muted">Loading scenarios...</p>
              ) : scenarios.length === 0 ? (
                <p className="scenario-muted">No saved scenarios yet.</p>
              ) : (
                <>
                  <label htmlFor="scenarioSelect">Saved scenarios</label>
                  <div className="scenario-picker-row">
                    <select
                      id="scenarioSelect"
                      value={activeScenarioId ?? ''}
                      onChange={handleScenarioSelectChange}
                    >
                      <option value="">Select a scenario</option>
                      {scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.name} ({formatScenarioTimestamp(scenario.createdAt)})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="scenario-delete-button"
                      onClick={() => {
                        if (activeScenarioId) {
                          void handleDeleteScenario(activeScenarioId);
                        }
                      }}
                      disabled={!activeScenarioId}
                    >
                      Delete
                    </button>
                  </div>
                  <p className="scenario-picker-hint">Selecting a scenario loads its assumptions.</p>
                </>
              )}
            </div>
          </div>
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
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInputValue(assumptions.purchasePrice)}
                    onChange={(event) => handlePurchasePriceChange(parseCurrencyInputValue(event.target.value))}
                  />
                </div>
              </div>
            </div>
            <div className="input-control">
              <label htmlFor="brokerFee">Broker Fee</label>
              <div className="currency-input">
                <span className="prefix">$</span>
                <input
                  id="brokerFee"
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInputValue(assumptions.brokerFee)}
                  onChange={(event) => handleBrokerFeeChange(parseCurrencyInputValue(event.target.value))}
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
                <div className="percent-input">
                  <input
                    type="number"
                    value={Math.round((assumptions.loanToValue ?? 0) * 100)}
                    onChange={(event) => handleLoanToValueChange(Number(event.target.value))}
                  />
                  <span className="suffix">%</span>
                </div>
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
                  <div className="percent-input">
                    <input
                      type="number"
                      value={Number(((assumptions.interestRate ?? 0) * 100).toFixed(2))}
                      onChange={(event) => handleInterestChange(Number(event.target.value) / 100)}
                    />
                    <span className="suffix">%</span>
                  </div>
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
                  <div className="number-input">
                    <input
                      type="number"
                      value={assumptions.amortYears}
                      onChange={(event) => handleAmortChange(Number(event.target.value))}
                    />
                  </div>
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
        </div>

        <div className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Rents & Income</h2>
              <p>Update the rent roll and other monthly revenue streams.</p>
            </div>
            <div className="unit-grid">
              {assumptions.unitMix.map((unit: UnitAssumption, index: number) => (
                <div key={`${unit.name}-${index}`} className="unit-card">
                  <div className="unit-card-header">
                    <label className="unit-label-input">
                      Unit Label
                      <input
                        type="text"
                        value={unit.name}
                        onChange={(event) => handleUnitNameChange(index, event.target.value)}
                        placeholder="e.g. 2 Bed Lower"
                      />
                    </label>
                    <button
                      type="button"
                      className="unit-remove-button"
                      onClick={() => handleRemoveUnitType(index)}
                      disabled={(assumptions.unitMix?.length ?? 0) <= 1}
                      aria-label="Remove unit type"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="unit-fields">
                    <label>
                      # of Units
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={unit.units}
                        onChange={(event) => handleUnitCountChange(index, Number(event.target.value))}
                      />
                    </label>
                    <label>
                      # of Bedrooms
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={unit.bedrooms ?? 0}
                        onChange={(event) => handleUnitBedroomChange(index, Number(event.target.value))}
                      />
                    </label>
                    <label className="unit-rent-field">
                      Monthly Rent
                      <div className="currency-input">
                        <span className="prefix">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInputValue(unit.rent)}
                          onChange={(event) => handleUnitRentChange(index, parseCurrencyInputValue(event.target.value))}
                        />
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="add-unit-button" onClick={handleAddUnitType}>
              + Add unit type
            </button>
            <div className="other-income">
              {assumptions.otherIncomeItems.map((item, index) => (
                <div key={item.name} className="unit-card">
                  <p className="unit-label">{item.name}</p>
                  <label>
                    Monthly Amount
                    <div className="currency-input">
                      <span className="prefix">$</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInputValue(item.monthlyAmount)}
                        onChange={(event) => {
                          const value = parseCurrencyInputValue(event.target.value);
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

          <div className="panel market-rent-panel">
            <div className="panel-header">
              <h2>Market Rent Data</h2>
              <p>Select a city to review market rent benchmarks.</p>
            </div>
            {marketRentData.length === 0 ? (
              <p className="muted">Market rent data is unavailable.</p>
            ) : (
              <>
                <div className="market-rent-controls">
                  <label htmlFor="marketRentCity">
                    City
                    <select
                      id="marketRentCity"
                      value={currentMarketRentCity}
                      onChange={(event) => setSelectedMarketCity(event.target.value)}
                    >
                      {marketRentData.map((row) => (
                        <option key={row.city} value={row.city}>
                          {row.city}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selectedMarketRentRow ? (
                  <table className="market-rent-table">
                    <thead>
                      <tr>
                        <th scope="col">Unit Type</th>
                        <th scope="col">Average Rent</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row">Bachelor</th>
                        <td>{currencyFormatter.format(selectedMarketRentRow.bachelor)}</td>
                      </tr>
                      <tr>
                        <th scope="row">1 Bedroom</th>
                        <td>{currencyFormatter.format(selectedMarketRentRow.oneBedroom)}</td>
                      </tr>
                      <tr>
                        <th scope="row">2 Bedroom</th>
                        <td>{currencyFormatter.format(selectedMarketRentRow.twoBedroom)}</td>
                      </tr>
                      <tr>
                        <th scope="row">3 Bedroom</th>
                        <td>{currencyFormatter.format(selectedMarketRentRow.threeBedroom)}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="muted">Select a city to view rent data.</p>
                )}
              </>
            )}
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
              {operatingExpenseEntries.map(([label, value]) => {
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
                            type="text"
                            inputMode="numeric"
                            value={formatCurrencyInputValue(value)}
                            onChange={(event) =>
                              handleOperatingExpenseChange(label, parseCurrencyInputValue(event.target.value))
                            }
                          />
                        </div>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="expense-add">
              <p className="expense-add-title">Add operating expense</p>
              <div className="expense-add-fields">
                <label>
                  Expense Name
                  <input
                    type="text"
                    value={newExpenseLabel}
                    onChange={(event) => {
                      setNewExpenseLabel(event.target.value);
                      if (newExpenseError) {
                        setNewExpenseError(null);
                      }
                    }}
                    placeholder="e.g. Landscaping"
                  />
                </label>
                <label>
                  Annual Amount
                  <div className="currency-input">
                    <span className="prefix">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newExpenseValue}
                      onChange={(event) => {
                        setNewExpenseValue(event.target.value);
                        if (newExpenseError) {
                          setNewExpenseError(null);
                        }
                      }}
                      placeholder="0"
                    />
                  </div>
                </label>
              </div>
              <button type="button" className="add-unit-button" onClick={handleAddOperatingExpense}>
                + Add expense
              </button>
              {newExpenseError && <p className="scenario-error">{newExpenseError}</p>}
            </div>
          </div>
        </div>
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
        <div className="chart-card">
          <div className="chart-header">
            <h3>Scenario Net Cash Flow</h3>
            <p>Compare annual net cash flow for saved cases.</p>
          </div>
          {scenarioComparisonData.length === 0 ? (
            <p className="chart-empty">Save scenarios to compare their net cash flow.</p>
          ) : (
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={scenarioComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d3e1ff" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#475569', fontSize: 12 }}
                  height={60}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis domain={scenarioComparisonDomain} hide />
                <Tooltip content={<ScenarioComparisonTooltip />} cursor={{ fill: 'rgba(22,163,74,0.08)' }} />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                <Bar dataKey="cashFlow" radius={[10, 10, 10, 10]}>
                  {scenarioComparisonData.map((entry) => (
                    <Cell key={entry.id} fill={entry.cashFlow >= 0 ? '#16a34a' : '#dc2626'} />
                  ))}
                  <LabelList dataKey="cashFlow" content={<WaterfallLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;
