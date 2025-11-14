## 8-Plex Investment Dashboard

A Plotly Dash application that mirrors the `8plexmodel.xlsx` underwriting workbook. The dashboard keeps the spreadsheet as the source of truth, exposes the key underwriting assumptions, and recalculates metrics (NOI, cash flow, cash-on-cash, DSCR, cap rate) and charts in real time.

### Prerequisites

- Python 3.9+ and the existing `.venv` in this repository.
- `8plexmodel.xlsx` must remain in the project root because the model layer reads assumptions directly from it.

### Setup

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### Running the Dashboard

```bash
python app.py
```

The app launches on `http://127.0.0.1:8050/`. Adjust the purchase price, rents, operating expenses, interest rate, and loan-to-value to see live updates to the performance cards plus the income/expense and monthly cash-flow charts.

### Tests

```bash
python -m pytest
```

The tests read values straight from `8plexmodel.xlsx`, run the Python calculations, and assert that the metrics match the spreadsheet within a tight tolerance. An additional scenario test ensures the model responds in the expected direction when assumptions change.

### Repository Layout

- `model.py` – Loads spreadsheet assumptions once, exposes helper functions, and reproduces the workbook logic.
- `app.py` – Dash UI with responsive controls, metric cards, and Plotly charts.
- `assets/style.css` – Styling for the dashboard layout and theme.
- `tests/test_model.py` – Pytest suite validating calculations.
- `requirements.txt` – Runtime and test dependencies.
