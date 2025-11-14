import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { read, WorkSheet } from 'xlsx/xlsx.mjs';

type UnitAssumption = {
  name: string;
  units: number;
  rent: number;
};

type OtherIncomeAssumption = {
  name: string;
  units: number;
  usage: number;
  monthlyAmount: number;
};

type BaselineJson = {
  assumptions: Record<string, unknown>;
  outputs: Record<string, number>;
  monthlyCashFlow: { monthIndex: number; cashFlow: number }[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workbookPath = path.resolve(rootDir, '8plexmodel.xlsx');

const workbookBuffer = readFileSync(workbookPath);
const workbook = read(workbookBuffer, {
  type: 'buffer',
  cellNF: false,
  cellDates: false,
  cellFormula: false,
});
const sheet = workbook.Sheets['UofA'];

if (!sheet) {
  throw new Error('Unable to locate the "UofA" worksheet in 8plexmodel.xlsx');
}

const readNumber = (ws: WorkSheet, cell: string): number => {
  const value = ws[cell]?.v;
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const readString = (ws: WorkSheet, cell: string): string => {
  const value = ws[cell]?.v;
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const unitRows: UnitAssumption[] = [
  {
    name: readString(sheet, 'B12'),
    units: readNumber(sheet, 'C12'),
    rent: readNumber(sheet, 'D12'),
  },
  {
    name: readString(sheet, 'B13'),
    units: readNumber(sheet, 'C13'),
    rent: readNumber(sheet, 'D13'),
  },
];

const otherIncomeRows: OtherIncomeAssumption[] = [
  {
    name: readString(sheet, 'B17'),
    units: readNumber(sheet, 'C17'),
    usage: readNumber(sheet, 'D17'),
    monthlyAmount: readNumber(sheet, 'E17'),
  },
  {
    name: readString(sheet, 'B18'),
    units: readNumber(sheet, 'C18'),
    usage: readNumber(sheet, 'D18'),
    monthlyAmount: readNumber(sheet, 'E18'),
  },
];

const operatingExpenseCells = [
  { labelCell: 'B23', valueCell: 'C23' },
  { labelCell: 'B24', valueCell: 'C24' },
  { labelCell: 'B25', valueCell: 'C25' },
  { labelCell: 'B26', valueCell: 'C26' },
  { labelCell: 'B27', valueCell: 'C27' },
  { labelCell: 'B28', valueCell: 'C28' },
  { labelCell: 'B29', valueCell: 'C29' },
  { labelCell: 'B30', valueCell: 'C30' },
];

const purchasePrice = readNumber(sheet, 'C4');
const brokerFee = readNumber(sheet, 'C5');
const depositPct = readNumber(sheet, 'C7');
const depositAmount = readNumber(sheet, 'C8');
const closingRebate = readNumber(sheet, 'C9');
const totalOperatingExpenses = readNumber(sheet, 'C32');
const loanAmount = readNumber(sheet, 'C36');
const cmhcPremiumAmount = readNumber(sheet, 'C37');
const amortYears = Math.round(readNumber(sheet, 'G36'));
const baseMonthlyPayment = readNumber(sheet, 'H36');
const premiumMonthlyPayment = readNumber(sheet, 'H37');

const interestRateCell = readNumber(sheet, 'E36');

const totalLoan = loanAmount + cmhcPremiumAmount;
const monthlyPayment = baseMonthlyPayment + premiumMonthlyPayment;

const inferInterestRate = (monthly: number, principal: number, years: number, fallback = 0.05): number => {
  const periods = years * 12;
  if (monthly <= 0 || principal <= 0 || periods <= 0) {
    return fallback;
  }
  let low = 1e-6;
  let high = 0.2;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    const payment = pmt(mid / 12, periods, principal);
    if (payment > monthly) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return (low + high) / 2;
};

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

const inferredInterestRate = inferInterestRate(monthlyPayment, totalLoan, amortYears, interestRateCell || 0.05);
const cmhcPremiumRate = loanAmount ? cmhcPremiumAmount / loanAmount : 0;

const operatingExpenses: Record<string, number> = {};
operatingExpenseCells.forEach(({ labelCell, valueCell }) => {
  const label = readString(sheet, labelCell);
  if (label) {
    operatingExpenses[label] = readNumber(sheet, valueCell);
  }
});

const assumptions = {
  purchasePrice,
  brokerFee,
  depositPct,
  depositAmount,
  closingRebate,
  operatingExpenseTotal: totalOperatingExpenses,
  operatingExpenses,
  unitMix: unitRows,
  otherIncomeItems: otherIncomeRows,
  interestRate: inferredInterestRate,
  amortYears,
  loanAmount,
  cmhcPremiumRate,
  loanToValue: 1 - depositPct,
};

const outputCells: Record<string, string> = {
  noi: 'C34',
  cash_flow: 'I39',
  cash_on_cash: 'I40',
  dscr: 'I41',
  cap_rate: 'I42',
};

const outputs: Record<string, number> = {};
Object.entries(outputCells).forEach(([key, cell]) => {
  outputs[key] = readNumber(sheet, cell);
});

const monthlyCashFlow = (() => {
  const grossRentMonthly = unitRows.reduce((sum, unit) => sum + unit.units * unit.rent, 0);
  const otherIncomeMonthly = otherIncomeRows.reduce((sum, item) => sum + item.units * item.usage * item.monthlyAmount, 0);
  const opexMonthly = totalOperatingExpenses / 12;
  const equityRequired = (purchasePrice + brokerFee) * depositPct;
  const principal = purchasePrice + brokerFee - equityRequired;
  const totalLoanWithPremium = principal * (1 + cmhcPremiumRate);
  const monthlyRate = inferredInterestRate / 12;
  const periods = amortYears * 12;
  const monthlyDebtService = pmt(monthlyRate, periods, totalLoanWithPremium);
  const netMonthly = grossRentMonthly + otherIncomeMonthly - opexMonthly - monthlyDebtService;

  return Array.from({ length: 12 }, (_, idx) => ({
    monthIndex: idx + 1,
    cashFlow: netMonthly,
  }));
})();

const baseline: BaselineJson = {
  assumptions,
  outputs,
  monthlyCashFlow,
};

const baselinePath = path.resolve(rootDir, 'src', 'model', 'baseline.json');
mkdirSync(path.dirname(baselinePath), { recursive: true });
writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8');

console.log(`Baseline data extracted to ${path.relative(rootDir, baselinePath)}`);
