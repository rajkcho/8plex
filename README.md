## 8-Plex Investment Dashboard (React + Vite)

A static underwriting dashboard that mirrors the `8plexmodel.xlsx` workbook. All assumptions, metrics, and chart data originate from the Excel file, are extracted via SheetJS, and are reproduced in a React + TypeScript single-page app that can be hosted on GitHub Pages.

### Getting Started

```bash
npm install
# regenerate src/model/baseline.json whenever 8plexmodel.xlsx changes
npm run extract-model
npm run server    # start the scenario API (port 4000)
npm run dev
```

Open `http://localhost:5173` to explore the dashboard. The SPA lets you adjust purchase price, rent roll, operating expenses, interest rate, and loan terms while the NOI, cash flow, DSCR, cap rate, and charts recalculate in real time.

### Scenario Library & Persistence

- `npm run server` starts the Node API. In local development (when no Supabase credentials are provided) it falls back to `data/scenarios.json`, so you can experiment offline.
- For production hosting, create a Supabase project (free tier works), add a `scenarios` table, and drop the credentials into the server as environment variables:
  ```sql
  create table if not exists public.scenarios (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now(),
    assumptions jsonb not null
  );
  ```
  Required env vars: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service role key lives under Project Settings → API in Supabase and allows the server to read/write the table.
- Point the SPA at the hosted API by setting `VITE_SCENARIO_API_URL` (e.g., `https://your-api.onrender.com`). When it’s omitted, the app continues to call the relative `/api` path so the Vite proxy handles local dev.
- Add `VITE_PEXELS_API_KEY` to `.env` (or your hosting provider’s environment variables) so the vacancy-rate panel can request skyline overlays from the Pexels API without hardcoding the credential.
- Use the Scenario Library panel to name the current assumptions, save with the automatic `MM-DD-YY 1:23PM` timestamp, load any shared scenario, or delete one with the `X` action.

### Market Data Panel

- The `/api/market-data/demographics` route sits on the same Node server and now geocodes postal codes via OpenStreetMap's Nominatim service before querying CensusMapper (2021 dataset) and the StatsCan crime table.
- The SPA continues to call the relative `/api` path in dev (Vite proxy) and uses `VITE_SCENARIO_API_URL` in production, so hosting the Node server exposes the demographics and CMHC vacancy endpoints alongside the scenario routes.

### Deploying the API to Vercel

1. Push the repo (with `vercel.json` and `api/[[...path]].ts`) to GitHub.
2. In Vercel, import the repo, leave the root directory at `/`, and use the default **Build Command** (`npm install` is enough—the API lives under `api/`).
3. After the first deploy, copy the Vercel URL (e.g., `https://eightplex.vercel.app`) and set `VITE_SCENARIO_API_URL` in `.env.production` so the SPA points at the hosted API when rebuilt.
4. Optional: add `CANCENSUS_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` as Vercel Environment Variables if you need to override the defaults.

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
