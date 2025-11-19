import baselineFile from './baseline.json';

export type UnitAssumption = {
  name: string;
  units: number;
  rent: number;
  bedrooms: number;
  usage?: string;
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
  contingencyPct?: number;
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
  noiYear1: number;
  cashFlow: number;
  cashOnCash: number;
  dscr: number;
  capRate: number;
  grossRentAnnual: number;
  otherIncomeAnnual: number;
  operatingExpensesAnnual: number;
  operatingExpensesYear1: number;
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
  const grossRentAnnual = grossRentMonthly * 12;

  const otherIncomeMonthly = otherIncomeItems.reduce((sum, item) => sum + item.units * item.usage * item.monthlyAmount, 0);
  const totalIncomeAnnual = grossRentAnnual + (otherIncomeMonthly * 12);

  const operatingExpensesCopy = { ...operatingExpenses };
  
  // Handle Vacancy calculation (percentage of Gross Rent only, excluding Other Income)
  const vacancyLabel = Object.keys(operatingExpensesCopy).find(k => k.toLowerCase().includes('vacancy'));
  if (vacancyLabel && operatingExpensesCopy[vacancyLabel] < 1) { // Assuming if < 1 it's a raw decimal like 0.03
      operatingExpensesCopy[vacancyLabel] = operatingExpensesCopy[vacancyLabel] * grossRentAnnual;
  }

  // const operatingExpenseTotal = assumptions.operatingExpenseTotal ?? sumOperatingExpenses(operatingExpenses);
  // Total Opex (Year 1) excludes Management & Salaries for some definitions, but here we want standard NOI logic
  // The prompt asks for "Total Opex (Year 1)" to *not* include Management & Salaries, and "Total Opex (On-going)" to include it.
  
  const totalOpexOngoing = sumOperatingExpenses(operatingExpenses);
  
  // Identify Management to exclude for Year 1
  let managementAmount = 0;
  const managementKey = Object.keys(operatingExpenses).find(k => {
      const norm = k.toLowerCase();
      return norm.includes('management') || norm.includes('salaries');
  });
  if (managementKey) {
      managementAmount = operatingExpenses[managementKey];
  }

  // "Total Opex (Year 1) should not include Management & Salaries"
  const totalOpexYear1 = totalOpexOngoing - managementAmount;

  // "On static KPI panel, NOI should be based off of Total Opex (Year 1)."
  const noiYear1 = totalIncomeAnnual - totalOpexYear1;

  // "Total Opex (On-going)" implies the full load including management
  // Unused currently as KPIs use Year 1 base
  const noiOngoing = totalIncomeAnnual - totalOpexOngoing;

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

  const cashFlow = noiOngoing - debtServiceAnnual; // Use On-going NOI per request
  const cashOnCash = equityRequired > 0 ? cashFlow / equityRequired : 0;
  const dscr = debtServiceAnnual > 0 ? noiOngoing / debtServiceAnnual : 0; // Use On-going NOI per request
  
  // Cap Rate uses Year 1 NOI (Excluding Management) per request
  const capRate = purchasePrice > 0 ? noiYear1 / purchasePrice : 0;

  // If user provided an explicit operatingExpenseTotal (override from OCR), we need to decide which one it represents.
  // Assuming the OCR "Total Operating Expenses" usually maps to the full on-going amount unless specified otherwise.
  // But strict compliance with the prompt:
  
  // Let's trust the individual items summation for these distinct calculations unless override is forced.
  // If override exists, we might lose the distinction unless we try to back-calculate.
  // For now, let's stick to summation logic as OCR now provides breakdown.

  return {
    noi: noiYear1, // Standard NOI usually implies stabilized/ongoing, but user explicitly requested: "On static KPI panel, NOI be based on Total Opex (Year 1)"
    noiYear1, // Exporting this for internal use if needed, or just keeping noi as is
    cashFlow,
    cashOnCash,
    dscr,
    capRate,
    grossRentAnnual,
    otherIncomeAnnual: otherIncomeMonthly * 12,
    operatingExpensesAnnual: totalOpexOngoing,
    operatingExpensesYear1: totalOpexYear1,
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
