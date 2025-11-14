from __future__ import annotations

from pathlib import Path

import pytest
from openpyxl import load_workbook

import model

WORKBOOK = load_workbook(Path(__file__).resolve().parents[1] / "8plexmodel.xlsx", data_only=True)
TOLERANCE = 1e-6


def test_baseline_metrics_match_workbook():
    assumptions = model.load_baseline_assumptions()
    metrics = model.calculate_metrics(assumptions)

    for key, (sheet, cell) in model.OUTPUT_CELL_MAP.items():
        expected = WORKBOOK[sheet][cell].value
        assert expected is not None
        assert metrics[key] == pytest.approx(expected, rel=1e-4, abs=1e-2)


def test_richer_rent_and_lower_rate_improves_metrics():
    assumptions = model.load_baseline_assumptions()
    baseline_metrics = model.calculate_metrics(assumptions)

    improved_assumptions = model.load_baseline_assumptions()
    for unit in improved_assumptions["unit_mix"]:
        unit["rent"] *= 1.05
    improved_assumptions["interest_rate"] = max(improved_assumptions["interest_rate"] - 0.005, 0.001)

    improved_metrics = model.calculate_metrics(improved_assumptions)

    assert improved_metrics["noi"] > baseline_metrics["noi"]
    assert improved_metrics["cash_flow"] > baseline_metrics["cash_flow"]
    assert improved_metrics["dscr"] > baseline_metrics["dscr"]


def test_monthly_projection_aligns_with_annual_cash_flow():
    assumptions = model.load_baseline_assumptions()
    monthly_projection = model.project_monthly_cash_flows(assumptions)
    metrics = model.calculate_metrics(assumptions)

    assert len(monthly_projection) == 12
    assert set(["Month", "Gross Rent", "Net Cash Flow"]).issubset(monthly_projection.columns)
    assert pytest.approx(monthly_projection["Net Cash Flow"].sum(), rel=1e-4) == metrics["cash_flow"]
