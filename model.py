from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, TypedDict

import re

import pandas as pd
from openpyxl import load_workbook

WORKBOOK_PATH = Path(__file__).resolve().with_name("8plexmodel.xlsx")
_WORKBOOK = load_workbook(WORKBOOK_PATH, data_only=True)

CELL_MAP: Dict[str, tuple[str, str]] = {
    "purchase_price": ("UofA", "C4"),
    "broker_fee": ("UofA", "C5"),
    "deposit_pct": ("UofA", "C7"),
    "deposit_amount": ("UofA", "C8"),
    "closing_rebate": ("UofA", "C9"),
    "total_operating_expenses": ("UofA", "C32"),
    "noi": ("UofA", "C34"),
    "loan_amount": ("UofA", "C36"),
    "cmhc_premium_amount": ("UofA", "C37"),
    "interest_rate_cell": ("UofA", "E36"),
    "amort_years": ("UofA", "G36"),
    "mortgage_monthly_payment": ("UofA", "H36"),
    "premium_monthly_payment": ("UofA", "H37"),
}

OUTPUT_CELL_MAP: Dict[str, tuple[str, str]] = {
    "noi": ("UofA", "C34"),
    "cash_flow": ("UofA", "I39"),
    "cash_on_cash": ("UofA", "I40"),
    "dscr": ("UofA", "I41"),
    "cap_rate": ("UofA", "I42"),
}

UNIT_ROW_MAP = {
    "three_bed_upper": {"label": ("UofA", "B12"), "units": ("UofA", "C12"), "rent": ("UofA", "D12")},
    "two_bed_lower": {"label": ("UofA", "B13"), "units": ("UofA", "C13"), "rent": ("UofA", "D13")},
}

OTHER_INCOME_ROW_MAP = {
    "other_income": {
        "label": ("UofA", "B17"),
        "units": ("UofA", "C17"),
        "usage": ("UofA", "D17"),
        "monthly_amount": ("UofA", "E17"),
    },
    "pet_income": {
        "label": ("UofA", "B18"),
        "units": ("UofA", "C18"),
        "usage": ("UofA", "D18"),
        "monthly_amount": ("UofA", "E18"),
    },
}

OPERATING_EXPENSE_ROW_MAP = {
    "property_taxes": {"label": ("UofA", "B23"), "value": ("UofA", "C23")},
    "insurance": {"label": ("UofA", "B24"), "value": ("UofA", "C24")},
    "utilities": {"label": ("UofA", "B25"), "value": ("UofA", "C25")},
    "repairs_and_maintenance": {"label": ("UofA", "B26"), "value": ("UofA", "C26")},
    "management_salary": {"label": ("UofA", "B27"), "value": ("UofA", "C27")},
    "other_costs": {"label": ("UofA", "B28"), "value": ("UofA", "C28")},
    "replacement_reserve": {"label": ("UofA", "B29"), "value": ("UofA", "C29")},
    "vacancy_bad_debt": {"label": ("UofA", "B30"), "value": ("UofA", "C30")},
}


class UnitAssumption(TypedDict):
    name: str
    units: float
    rent: float
    bedrooms: float


class OtherIncomeAssumption(TypedDict):
    name: str
    units: float
    usage: float
    monthly_amount: float


class Assumptions(TypedDict, total=False):
    purchase_price: float
    broker_fee: float
    deposit_pct: float
    deposit_amount: float
    closing_rebate: float
    interest_rate: float
    amort_years: int
    loan_amount: float
    cmhc_premium_rate: float
    loan_to_value: float
    operating_expense_total: float
    operating_expenses: Dict[str, float]
    unit_mix: List[UnitAssumption]
    other_income_items: List[OtherIncomeAssumption]


def _read_cell(sheet: str, cell: str) -> Any:
    return _WORKBOOK[sheet][cell].value


def _pmt(rate: float, periods: int, principal: float) -> float:
    if periods <= 0 or principal <= 0:
        return 0.0
    if rate == 0:
        return principal / periods
    factor = (1 + rate) ** periods
    return principal * rate * factor / (factor - 1)


def _infer_interest_rate(monthly_payment: float, principal: float, amort_years: int) -> float:
    periods = amort_years * 12
    if monthly_payment <= 0 or principal <= 0 or periods <= 0:
        return float(_read_cell(*CELL_MAP["interest_rate_cell"]) or 0.0)
    low = 1e-6
    high = 0.2
    for _ in range(100):
        mid = (low + high) / 2
        payment = _pmt(mid / 12, periods, principal)
        if payment > monthly_payment:
            high = mid
        else:
            low = mid
    return (low + high) / 2


def _infer_bedrooms(label: str) -> float:
    match = re.search(r"(\d+)\s*bed", label, re.IGNORECASE)
    if not match:
        return 0.0
    try:
        return float(match.group(1))
    except (TypeError, ValueError):
        return 0.0


def _build_baseline_assumptions() -> Assumptions:
    purchase_price = float(_read_cell(*CELL_MAP["purchase_price"]))
    broker_fee = float(_read_cell(*CELL_MAP["broker_fee"]))
    deposit_pct = float(_read_cell(*CELL_MAP["deposit_pct"]))
    deposit_amount = float(_read_cell(*CELL_MAP["deposit_amount"]))
    closing_rebate = float(_read_cell(*CELL_MAP["closing_rebate"]))
    operating_expense_total = float(_read_cell(*CELL_MAP["total_operating_expenses"]))
    loan_amount = float(_read_cell(*CELL_MAP["loan_amount"]))
    cmhc_premium_amount = float(_read_cell(*CELL_MAP["cmhc_premium_amount"]))
    amort_years = int(_read_cell(*CELL_MAP["amort_years"]))
    base_monthly_payment = float(_read_cell(*CELL_MAP["mortgage_monthly_payment"]) or 0.0)
    premium_monthly_payment = float(_read_cell(*CELL_MAP["premium_monthly_payment"]) or 0.0)
    monthly_payment = base_monthly_payment + premium_monthly_payment
    total_loan = loan_amount + cmhc_premium_amount
    inferred_interest_rate = _infer_interest_rate(monthly_payment, total_loan, amort_years)
    cmhc_premium_rate = cmhc_premium_amount / loan_amount if loan_amount else 0.0

    unit_mix: List[UnitAssumption] = []
    for data in UNIT_ROW_MAP.values():
        label = str(_read_cell(*data["label"]))
        unit_mix.append(
            {
                "name": label,
                "units": float(_read_cell(*data["units"])),
                "rent": float(_read_cell(*data["rent"])),
                "bedrooms": _infer_bedrooms(label),
            }
        )

    other_income_items: List[OtherIncomeAssumption] = []
    for data in OTHER_INCOME_ROW_MAP.values():
        other_income_items.append(
            {
                "name": str(_read_cell(*data["label"])),
                "units": float(_read_cell(*data["units"])),
                "usage": float(_read_cell(*data["usage"])),
                "monthly_amount": float(_read_cell(*data["monthly_amount"])),
            }
        )

    operating_expenses: Dict[str, float] = {}
    for data in OPERATING_EXPENSE_ROW_MAP.values():
        label = str(_read_cell(*data["label"]))
        operating_expenses[label] = float(_read_cell(*data["value"]))

    return Assumptions(
        purchase_price=purchase_price,
        broker_fee=broker_fee,
        deposit_pct=deposit_pct,
        deposit_amount=deposit_amount,
        closing_rebate=closing_rebate,
        operating_expense_total=operating_expense_total,
        operating_expenses=operating_expenses,
        unit_mix=unit_mix,
        other_income_items=other_income_items,
        interest_rate=inferred_interest_rate,
        amort_years=amort_years,
        loan_amount=loan_amount,
        cmhc_premium_rate=cmhc_premium_rate,
        loan_to_value=1 - deposit_pct,
    )


_BASELINE_ASSUMPTIONS = _build_baseline_assumptions()


def load_baseline_assumptions() -> Assumptions:
    return deepcopy(_BASELINE_ASSUMPTIONS)


def calculate_metrics(assumptions: Assumptions) -> Dict[str, float]:
    purchase_price = float(assumptions.get("purchase_price", 0.0))
    broker_fee = float(assumptions.get("broker_fee", 0.0))
    deposit_pct = float(assumptions.get("deposit_pct", 0.0))
    loan_to_value = float(assumptions.get("loan_to_value", 1 - deposit_pct))
    deposit_pct = max(0.0, min(1.0, deposit_pct or (1 - loan_to_value)))

    unit_mix = assumptions.get("unit_mix", [])
    gross_rent_monthly = sum(unit["units"] * unit["rent"] for unit in unit_mix)
    gross_rent_annual = gross_rent_monthly * 12

    other_income_items = assumptions.get("other_income_items", [])
    other_income_monthly = sum(item["units"] * item["usage"] * item["monthly_amount"] for item in other_income_items)
    other_income_annual = other_income_monthly * 12

    total_income_annual = gross_rent_annual + other_income_annual

    operating_expenses = assumptions.get("operating_expenses", {})
    operating_expense_total = float(assumptions.get("operating_expense_total") or sum(operating_expenses.values()))
    if operating_expense_total <= 0 and operating_expenses:
        operating_expense_total = sum(operating_expenses.values())

    noi = total_income_annual - operating_expense_total

    equity_required = (purchase_price + broker_fee) * deposit_pct
    loan_principal = purchase_price + broker_fee - equity_required
    cmhc_premium_rate = float(assumptions.get("cmhc_premium_rate", 0.0))
    total_loan = loan_principal * (1 + cmhc_premium_rate)

    interest_rate = float(assumptions.get("interest_rate", 0.0))
    amort_years = int(assumptions.get("amort_years", 0))
    periods = amort_years * 12
    monthly_rate = interest_rate / 12
    monthly_debt_service = _pmt(monthly_rate, periods, total_loan)
    annual_debt_service = monthly_debt_service * 12

    cash_flow = noi - annual_debt_service
    cash_on_cash = cash_flow / equity_required if equity_required else 0.0
    dscr = noi / annual_debt_service if annual_debt_service else 0.0
    cap_rate = noi / purchase_price if purchase_price else 0.0

    return {
        "noi": noi,
        "cash_flow": cash_flow,
        "cash_on_cash": cash_on_cash,
        "dscr": dscr,
        "cap_rate": cap_rate,
        "gross_rent_annual": gross_rent_annual,
        "other_income_annual": other_income_annual,
        "operating_expenses_annual": operating_expense_total,
        "total_income_annual": total_income_annual,
        "debt_service_annual": annual_debt_service,
        "monthly_debt_service": monthly_debt_service,
        "equity_required": equity_required,
        "total_loan": total_loan,
    }


def project_monthly_cash_flows(assumptions: Assumptions) -> pd.DataFrame:
    metrics = calculate_metrics(assumptions)
    rent_monthly = metrics["gross_rent_annual"] / 12
    other_income_monthly = metrics["other_income_annual"] / 12
    opex_monthly = metrics["operating_expenses_annual"] / 12
    debt_monthly = metrics["debt_service_annual"] / 12

    rows = []
    for month in range(1, 13):
        total_income = rent_monthly + other_income_monthly
        net_cash_flow = total_income - opex_monthly - debt_monthly
        rows.append(
            {
                "Month": month,
                "Gross Rent": rent_monthly,
                "Other Income": other_income_monthly,
                "Operating Expenses": opex_monthly,
                "Debt Service": debt_monthly,
                "Net Cash Flow": net_cash_flow,
            }
        )

    return pd.DataFrame(rows)
