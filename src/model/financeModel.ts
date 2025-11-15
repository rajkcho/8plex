import baselineFile from './baseline.json';

export type UnitAssumption = {
  name: string;
  units: number;
  rent: number;
  bedrooms: number;
};

export type OtherIncomeItem = {
  name: string;
  units: number;
  usage: number;
  monthlyAmount: number;
};

export type Assumptions = {
  purchasePrice: number;
  brokerFee: number;
  depositPct?: number;
  depositAmount?: number;
  closingRebate: number;
  operatingExpenseTotal?: number;
  operatingExpenses?: Record<string, number>;
  unitMix: UnitAssumption[];
  otherIncomeItems: OtherIncomeItem[];
  interestRate: number;
  amortYears: number;
  loanAmount?: number;
  cmhcPremiumRate: number;
  loanToValue?: number;
};

export type FinanceMetrics = {
  noi: number;
  cashFlow: number;
  cashOnCash: number;
  dscr: number;
  capRate: number;
  grossRentAnnual: number;
  otherIncomeAnnual: number;
  operatingExpensesAnnual: number;
  totalIncomeAnnual: number;
  debtServiceAnnual: number;
  monthlyDebtService: number;
  equityRequired: number;
  loanAmountEffective: number;
};

export type MonthlyCashFlowPoint = {
  monthIndex: number;
  cashFlow: number;
};

type BaselineFile = {
  assumptions: Assumptions;
  outputs: Record<string, number>;
  monthlyCashFlow: MonthlyCashFlowPoint[];
};

const baselineData = baselineFile as BaselineFile;

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const pmt = (rate: number, periods: number, principal: number): number => {
  if (periods <= 0 || principal <= 0) {
    return 0;
  }
  if (rate === 0) {
    return principal / periods;
  }
  const factor = (1 + rate) ** periods;
  return (principal * rate * factor) / (factor - 1);
};

const sumOperatingExpenses = (expenses?: Record<string, number>): number => {
  if (!expenses) {
    return 0;
  }
  return Object.values(expenses).reduce((sum, value) => sum + value, 0);
};

export const loadBaselineAssumptions = (): Assumptions => deepClone(baselineData.assumptions);

export const calculateMetrics = (assumptions: Assumptions): FinanceMetrics => {
  const purchasePrice = assumptions.purchasePrice ?? 0;
  const brokerFee = assumptions.brokerFee ?? 0;
  const loanToValueRaw = assumptions.loanToValue ?? 1 - (assumptions.depositPct ?? 0);
  const loanToValue = clamp(loanToValueRaw, 0, 1);
  const depositPct = clamp(assumptions.depositPct ?? 1 - loanToValue, 0, 1);

  const unitMix = assumptions.unitMix ?? [];
  const otherIncomeItems = assumptions.otherIncomeItems ?? [];
  const operatingExpenses = assumptions.operatingExpenses ?? {};

  const grossRentMonthly = unitMix.reduce((sum, unit) => sum + unit.units * unit.rent, 0);
  const otherIncomeMonthly = otherIncomeItems.reduce((sum, item) => sum + item.units * item.usage * item.monthlyAmount, 0);
  const totalIncomeAnnual = (grossRentMonthly + otherIncomeMonthly) * 12;

  const operatingExpenseTotal = assumptions.operatingExpenseTotal ?? sumOperatingExpenses(operatingExpenses);
  const operatingExpensesAnnual = operatingExpenseTotal > 0 ? operatingExpenseTotal : sumOperatingExpenses(operatingExpenses);

  const noi = totalIncomeAnnual - operatingExpensesAnnual;

  const equityRequired = (purchasePrice + brokerFee) * depositPct;
  const inferredLoanAmount = assumptions.loanAmount ?? purchasePrice + brokerFee - equityRequired;
  const loanAmountEffective = Math.max(inferredLoanAmount, 0);

  const interestRate = assumptions.interestRate ?? 0;
  const amortYears = assumptions.amortYears ?? 0;
  const periods = amortYears * 12;
  const monthlyRate = interestRate / 12;
  const principalWithPremium = loanAmountEffective * (1 + (assumptions.cmhcPremiumRate ?? 0));
  const monthlyDebtService = pmt(monthlyRate, periods, principalWithPremium);
  const debtServiceAnnual = monthlyDebtService * 12;

  const cashFlow = noi - debtServiceAnnual;
  const cashOnCash = equityRequired > 0 ? cashFlow / equityRequired : 0;
  const dscr = debtServiceAnnual > 0 ? noi / debtServiceAnnual : 0;
  const capRate = purchasePrice > 0 ? noi / purchasePrice : 0;

  return {
    noi,
    cashFlow,
    cashOnCash,
    dscr,
    capRate,
    grossRentAnnual: grossRentMonthly * 12,
    otherIncomeAnnual: otherIncomeMonthly * 12,
    operatingExpensesAnnual,
    totalIncomeAnnual,
    debtServiceAnnual,
    monthlyDebtService,
    equityRequired,
    loanAmountEffective,
  };
};

export const projectMonthlyCashFlows = (assumptions: Assumptions): MonthlyCashFlowPoint[] => {
  const metrics = calculateMetrics(assumptions);
  const rentMonthly = metrics.grossRentAnnual / 12;
  const otherIncomeMonthly = metrics.otherIncomeAnnual / 12;
  const opexMonthly = metrics.operatingExpensesAnnual / 12;
  const debtMonthly = metrics.debtServiceAnnual / 12;

  const cashFlowMonthly = rentMonthly + otherIncomeMonthly - opexMonthly - debtMonthly;

  return Array.from({ length: 12 }, (_, index) => ({
    monthIndex: index + 1,
    cashFlow: cashFlowMonthly,
  }));
};

export const loadBaselineOutputs = () => deepClone(baselineData.outputs);
export const loadBaselineMonthlyCashFlow = (): MonthlyCashFlowPoint[] => deepClone(baselineData.monthlyCashFlow);
