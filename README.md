# Transport Data Visualisation

Compare public transport vs private car commute **time** and **cost** across Sydney, NSW.

## Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11+, FastAPI, Pandas, SQLite |
| Frontend | Vue 3 (Composition API), MapLibre GL JS, ECharts, TailwindCSS |
| APIs | TfNSW Trip Planner (multimodal), MapTiler Cloud (maps + driving routes), NSW FuelCheck |

## Project structure

```
backend/     FastAPI app, ETL pipeline, cost engine, SQLite
frontend/    Vue 3 SPA with map and scatterplot
scripts/     Dev helpers
```

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example .env   # add your API keys
uvicorn app.main:app --reload --port 8000
```

Health check: http://localhost:8000/api/v1/health

### Frontend

```bash
cd frontend
npm install
cp ../.env.example .env   # add VITE_ vars
npm run dev
```

App: http://localhost:5173

## Vehicle profiles

Car cost uses configurable fuel consumption (L/100 km) per category:

| Category | Default (L/100 km) |
|----------|-------------------|
| Small Car | 6.5 |
| Medium Car | 8.0 |
| SUV | 11.0 |
| Ute/Van | 12.5 |

Users can override consumption in the UI; defaults are served from the API.

## Phase status

- [x] Phase 1: Planning & scaffolding
- [ ] Phase 2: ETL, cost engine, API, UI (in progress)

## License

MIT — see [LICENSE](LICENSE).
