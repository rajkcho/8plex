## 8-Plex Investment Dashboard (React + Vite)

A static underwriting dashboard that mirrors the `8plexmodel.xlsx` workbook. All assumptions, metrics, and chart data originate from the Excel file, are extracted via SheetJS, and are reproduced in a React + TypeScript single-page app that can be hosted on GitHub Pages.

### Getting Started

```bash
npm install
# regenerate src/model/baseline.json whenever 8plexmodel.xlsx changes
npm run extract-model
npm run dev
```

Open `http://localhost:5173` to explore the dashboard. The SPA lets you adjust purchase price, rent roll, operating expenses, interest rate, and loan terms while the NOI, cash flow, DSCR, cap rate, and charts recalculate in real time.

### Model Extraction

- `scripts/extractModel.ts` uses `xlsx` (SheetJS) to read `8plexmodel.xlsx`.
- It captures the baseline assumptions, KPIs, and a 12-month cash-flow series, then writes them to `src/model/baseline.json`.
- Run `npm run extract-model` any time the workbook is updated so the React model stays in sync.

### Testing

```bash
npm test
```

Vitest asserts that the JavaScript finance model reproduces the workbook outputs within a tight tolerance and that improved assumptions move the metrics in the expected direction. Monthly projections are also validated by comparing the sum of the monthly cash flows against the annual cash flow calculation.

### Production Build & GitHub Pages

```bash
npm run build
npm run preview   # optional local smoke test
```

The Vite build emits static assets in `dist/`, configured with the `/8plex/` base path so they can be served via GitHub Pages. Push the repo to `main`, enable Pages in GitHub’s settings, and select the `dist` folder on the `main` branch as the publishing source.

### Project Structure

- `src/model/financeModel.ts` – Pure functions for loading baseline assumptions, calculating NOI/cash flow/cap rate/etc., and projecting monthly cash flow.
- `scripts/extractModel.ts` – SheetJS-powered script that reads the Excel workbook and writes `src/model/baseline.json`.
- `src/App.tsx` – Responsive dashboard with assumption controls, KPI cards, and Recharts-based income vs. expense and cash-flow visualizations.
- `src/__tests__/financeModel.test.ts` – Vitest suite covering the baseline parity and directional scenario tests.
