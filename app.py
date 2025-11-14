from __future__ import annotations

from copy import deepcopy
from typing import List

import dash
from dash import Dash, Input, Output, dcc, html
import plotly.express as px
import plotly.graph_objects as go

import model

baseline_assumptions = model.load_baseline_assumptions()
baseline_opex = baseline_assumptions["operating_expense_total"]

app: Dash = dash.Dash(__name__)
app.title = "8-Plex Investment Dashboard"
server = app.server


def format_currency(value: float) -> str:
    return f"${value:,.0f}"


def format_percentage(value: float) -> str:
    return f"{value * 100:,.2f}%"


def build_metric_cards(metrics: dict) -> List[html.Div]:
    card_definitions = [
        ("NOI", format_currency(metrics["noi"])),
        ("Cash Flow", format_currency(metrics["cash_flow"])),
        ("Cash on Cash", format_percentage(metrics["cash_on_cash"])),
        ("DSCR", f"{metrics['dscr']:.2f}x"),
        ("Cap Rate", format_percentage(metrics["cap_rate"])),
    ]
    return [html.Div([html.P(label), html.H3(value)], className="metric-card") for label, value in card_definitions]


app.layout = html.Div(
    className="page-container",
    children=[
        html.Header(
            [
                html.H1("8-Plex Real Estate Dashboard"),
                html.P("Adjust key assumptions and review the updated performance metrics in real time."),
            ]
        ),
        html.Section(
            className="controls-grid",
            children=[
                html.Div(
                    className="control-card",
                    children=[
                        html.Label("Purchase Price"),
                        dcc.Input(
                            id="purchase-price-input",
                            type="number",
                            value=baseline_assumptions["purchase_price"],
                            min=500000,
                            step=1000,
                        ),
                    ],
                ),
                html.Div(
                    className="control-card",
                    children=[
                        html.Label("3 Bed Upper Rent"),
                        dcc.Slider(
                            id="upper-rent-slider",
                            min=2000,
                            max=3500,
                            step=50,
                            value=baseline_assumptions["unit_mix"][0]["rent"],
                            tooltip={"always_visible": True, "placement": "bottom"},
                        ),
                    ],
                ),
                html.Div(
                    className="control-card",
                    children=[
                        html.Label("2 Bed Lower Rent"),
                        dcc.Slider(
                            id="lower-rent-slider",
                            min=1000,
                            max=2500,
                            step=25,
                            value=baseline_assumptions["unit_mix"][1]["rent"],
                            tooltip={"always_visible": True, "placement": "bottom"},
                        ),
                    ],
                ),
                html.Div(
                    className="control-card",
                    children=[
                        html.Label("Operating Expenses (annual)"),
                        dcc.Slider(
                            id="opex-slider",
                            min=30000,
                            max=120000,
                            step=1000,
                            value=baseline_assumptions["operating_expense_total"],
                            tooltip={"always_visible": True, "placement": "bottom"},
                        ),
                    ],
                ),
                html.Div(
                    className="control-card",
                    children=[
                        html.Label("Interest Rate"),
                        dcc.Slider(
                            id="interest-slider",
                            min=2.0,
                            max=7.0,
                            step=0.05,
                            value=baseline_assumptions["interest_rate"] * 100,
                            tooltip={"always_visible": True, "placement": "bottom"},
                        ),
                    ],
                ),
                html.Div(
                    className="control-card",
                    children=[
                        html.Label("Loan to Value"),
                        dcc.Slider(
                            id="ltv-slider",
                            min=60,
                            max=95,
                            step=1,
                            value=baseline_assumptions["loan_to_value"] * 100,
                            tooltip={"always_visible": True, "placement": "bottom"},
                        ),
                    ],
                ),
            ],
        ),
        html.Section(id="metrics-container", className="metrics-grid", children=build_metric_cards(model.calculate_metrics(baseline_assumptions))),
        html.Section(
            className="charts-grid",
            children=[
                dcc.Graph(id="income-breakdown"),
                dcc.Graph(id="cashflow-projection"),
            ],
        ),
    ],
)


@app.callback(
    Output("metrics-container", "children"),
    Output("income-breakdown", "figure"),
    Output("cashflow-projection", "figure"),
    Input("purchase-price-input", "value"),
    Input("upper-rent-slider", "value"),
    Input("lower-rent-slider", "value"),
    Input("opex-slider", "value"),
    Input("interest-slider", "value"),
    Input("ltv-slider", "value"),
)
def update_dashboard(purchase_price, upper_rent, lower_rent, operating_expenses, interest_rate_pct, ltv_pct):
    assumptions = model.load_baseline_assumptions()
    if purchase_price:
        assumptions["purchase_price"] = purchase_price
    if upper_rent:
        assumptions["unit_mix"][0]["rent"] = upper_rent
    if lower_rent:
        assumptions["unit_mix"][1]["rent"] = lower_rent
    if operating_expenses:
        assumptions["operating_expense_total"] = operating_expenses
        scale = operating_expenses / baseline_opex if baseline_opex else 1
        assumptions["operating_expenses"] = {
            name: value * scale for name, value in assumptions["operating_expenses"].items()
        }
    if interest_rate_pct is not None:
        assumptions["interest_rate"] = interest_rate_pct / 100
    if ltv_pct is not None:
        assumptions["loan_to_value"] = ltv_pct / 100
        assumptions["deposit_pct"] = 1 - assumptions["loan_to_value"]

    metrics = model.calculate_metrics(assumptions)
    cash_flows = model.project_monthly_cash_flows(assumptions)

    metric_cards = build_metric_cards(metrics)

    breakdown = go.Figure(
        data=[
            go.Bar(
                x=["Gross Rent", "Other Income", "Operating Expenses", "Debt Service"],
                y=[
                    metrics["gross_rent_annual"],
                    metrics["other_income_annual"],
                    -metrics["operating_expenses_annual"],
                    -metrics["debt_service_annual"],
                ],
                marker_color=["#0b5fff", "#19a974", "#ff8c42", "#e63946"],
            )
        ]
    )
    breakdown.update_layout(
        title="Income vs Expense Breakdown (Annual)",
        yaxis_title="USD",
        template="plotly_white",
    )

    cashflow_fig = px.line(
        cash_flows,
        x="Month",
        y="Net Cash Flow",
        markers=True,
        title="Monthly Cash Flow Projection",
    )
    cashflow_fig.update_traces(line=dict(color="#0b5fff", width=3))
    cashflow_fig.update_layout(template="plotly_white", yaxis_title="USD per Month")

    return metric_cards, breakdown, cashflow_fig


if __name__ == "__main__":
    app.run_server(debug=True)
