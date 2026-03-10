# Real-Time Crypto Analytics

Full-stack streaming analytics platform for cryptocurrency markets. Binance WebSocket data flows through Kafka and Apache Flink into InfluxDB, powering a custom Next.js dashboard with TradingView-style charts, live prices, and 5 years of historical data.

![Architecture](https://img.shields.io/badge/Kafka-Stream_Processing-blue?style=flat-square)
![Frontend](https://img.shields.io/badge/Next.js_14-Dashboard-black?style=flat-square)
![Data](https://img.shields.io/badge/InfluxDB-Time_Series-purple?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## Architecture

```
Binance WebSocket API
        │
        ▼
  Python Producer ──► Kafka [raw-prices]
                            │
                            ▼
                      Apache Flink (PyFlink)
                      ┌─────────┬─────────┐
                      │                   │
              OHLC Aggregator     Price Alert Detector
           (1m/5m/15m/30m/1h)    (RSI + SMA + Alerts)
                      │                   │
                      ▼                   ▼
              Kafka [ohlc-*]      Kafka [price-alerts]
                      │                   │
                      └────────┬──────────┘
                               ▼
                           InfluxDB
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     Next.js Dashboard    Grafana (Admin)    Backfill Service
     (Charts + Auth)      (port 3001)       (5yr history)
              │
              ▼
       Nginx Reverse Proxy
```

## Screenshots

After starting the app, visit `http://localhost:3000` to see:

- **Dashboard** — Coin cards with live prices, sparklines, and 24h change badges
- **Chart View** — TradingView candlestick charts with volume, RSI, and SMA overlays
- **Widgets** — Draggable panels for news feed, Fear & Greed gauge, alerts, and price predictor game

## Features

### Dashboard
- **7 cryptocurrencies** tracked in real-time: BTC, ETH, SOL, ADA, DOT, BCH, QNT
- **Live coin cards** with price flash animations, 7-day sparklines, and P/L badges
- **Drag-and-drop** card reordering and custom coin management
- **Dynamic browser tab** showing live price (e.g. `BTC $83,421 ▲0.5% | CryptoAnalytics`)
- **Dark / Light theme** with full CSS variable system

### Charts
- **TradingView lightweight-charts** with candlestick, line, and area styles
- **10 timeframes**: 1s, 5s, 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
- **Live WebSocket updates** — chart updates tick-by-tick via Binance WebSocket
- **Technical indicators**: RSI (14-period), SMA (7/14), volume histogram
- **Order book depth chart** with bid/ask visualization
- **5 years of historical data** backfilled from Binance REST API

### Widgets (draggable grid)
- **News Feed** — Crypto news from CryptoPanic API
- **Fear & Greed Index** — Animated gauge with market sentiment
- **Price Alerts** — Configurable above/below alerts with browser notifications
- **Price Predictor** — Mini-game: predict if price goes up or down in 30 seconds

### User Experience
- **Email/password authentication** with NextAuth.js + SQLite
- **User settings** saved to database: theme, chart style, currency, number format
- **Multi-currency support**: USD, EUR, GBP with live exchange rates
- **Compact mode** for high-density coin grids
- **SharedWorker WebSocket** — shares connections across browser tabs
- **Keyboard-friendly** with responsive design (mobile to 4K)

### Security
- **Rate limiting** on authentication endpoints (register, login, password change)
- **Input validation** across all API routes (symbol whitelist, range validation)
- **Nginx reverse proxy** with security headers, rate limiting (10 req/s per IP)
- **Password hashing** with bcrypt, JWT sessions
- **SSL-ready** nginx configuration

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Data Source | Binance WebSocket API | Free real-time crypto price feed |
| Message Broker | Apache Kafka (Confluent 7.5.0) | Decoupled, durable message transport |
| Stream Processor | Apache Flink 1.18.1 (PyFlink) | Windowed OHLC aggregation, RSI, SMA |
| Time-Series DB | InfluxDB 2.7 | Optimized storage for candle/indicator queries |
| Frontend | Next.js 14 + React 18 + TypeScript | Custom dashboard with SSR |
| Charts | TradingView lightweight-charts | Professional candlestick/volume charts |
| Auth | NextAuth.js + Prisma + SQLite | User registration, login, JWT sessions |
| Styling | Tailwind CSS + Inter font | Responsive design with dark/light themes |
| Real-time | SSE + WebSocket + SharedWorker | Live prices, chart updates, multi-tab sync |
| Reverse Proxy | Nginx (Alpine) | Rate limiting, security headers, SSL |
| Orchestration | Docker Compose (14 services) | One-command deployment |

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/realtime-crypto-analytics.git
cd realtime-crypto-analytics

# Copy and configure environment variables
cp .env.example .env
# Edit .env to set your secrets (or use the generated defaults)

# Start all services
docker compose up -d
```

First startup takes a few minutes as it downloads images, builds the frontend, and backfills historical data.

### Access

| Service | URL | Notes |
|---|---|---|
| **Dashboard** | http://localhost:3000 | Register an account, then explore |
| **Grafana** | http://localhost:3001 | Admin dashboard (credentials from `.env`) |
| **Flink UI** | http://localhost:8081 | Flink job monitoring |
| **InfluxDB** | http://localhost:8086 | Time-series database UI |

### Verify Data Flow

```bash
# Watch raw prices from Binance
docker compose logs -f producer

# Check Flink jobs are running
docker compose logs -f flink-jobmanager

# See frontend startup
docker compose logs -f frontend

# Monitor backfill progress
docker compose logs -f backfill
```

### Stop

```bash
docker compose down           # Stop services (keep data)
docker compose down -v        # Stop and delete all volumes
```

## Project Structure

```
realtime-crypto-analytics/
├── docker-compose.yml                 # Full stack orchestration (14 services)
├── .env.example                       # Environment variable reference
│
├── frontend/                          # Next.js 14 custom dashboard
│   ├── Dockerfile                     # Multi-stage build (standalone output)
│   ├── prisma/schema.prisma           # User model (SQLite)
│   ├── public/
│   │   ├── favicon.svg                # App icon
│   │   └── ws-shared-worker.js        # SharedWorker for multi-tab WS
│   └── src/
│       ├── app/
│       │   ├── layout.tsx             # Root layout (Inter font, metadata)
│       │   ├── dashboard/page.tsx     # Main dashboard page
│       │   ├── login/page.tsx         # Login page
│       │   ├── register/page.tsx      # Registration page
│       │   └── api/                   # 20+ API routes
│       │       ├── ohlc/              # OHLC candle data from InfluxDB
│       │       ├── rsi/               # RSI indicator data
│       │       ├── sma/               # SMA indicator data
│       │       ├── live/              # SSE live price stream
│       │       ├── kline-stream/      # SSE proxy for Binance kline WS
│       │       ├── depth/             # Order book depth
│       │       ├── news/              # Crypto news feed
│       │       ├── sparkline/         # 7-day sparkline data
│       │       ├── coin-stats/        # 24h statistics
│       │       ├── fear-greed/        # Fear & Greed index
│       │       ├── price-alerts/      # User price alert CRUD
│       │       ├── game-stats/        # Price predictor stats
│       │       ├── settings/          # User preferences
│       │       ├── user-coins/        # Custom coin list
│       │       ├── exchange-rates/    # Currency conversion
│       │       ├── register/          # Account registration
│       │       ├── change-password/   # Password update
│       │       └── delete-account/    # Account deletion
│       ├── components/
│       │   ├── CandlestickChart.tsx   # TradingView chart (candle/line/area)
│       │   ├── CryptoCard.tsx         # Coin card with flip animation
│       │   ├── RSIChart.tsx           # RSI indicator chart
│       │   ├── DepthChart.tsx         # Order book depth visualization
│       │   ├── LiveTicker.tsx         # Scrolling live price bar
│       │   ├── NewsFeed.tsx           # Crypto news panel
│       │   ├── AlertsFeed.tsx         # Price alert panel
│       │   ├── DashboardGrid.tsx      # Draggable widget grid
│       │   ├── FearGreedGauge.tsx     # Animated sentiment gauge
│       │   ├── PricePredictor.tsx     # Price prediction mini-game
│       │   ├── PriceAlertManager.tsx  # Alert configuration modal
│       │   ├── SettingsModal.tsx      # User settings modal
│       │   └── AddCoinModal.tsx       # Coin search and add modal
│       ├── hooks/
│       │   └── useBinanceKline.ts     # Live chart data hook (REST + WS)
│       └── lib/
│           ├── auth.ts                # NextAuth config + rate limiting
│           ├── influxdb.ts            # InfluxDB Flux query client
│           ├── prisma.ts              # Prisma client singleton
│           ├── theme.tsx              # Dark/light theme provider
│           ├── types.ts               # TypeScript types and constants
│           ├── ws-manager.ts          # SharedWorker WS connection manager
│           ├── rate-limit.ts          # Sliding window rate limiter
│           └── validate.ts            # Input validation helpers
│
├── producer/
│   ├── Dockerfile
│   └── binance_producer.py            # Binance WebSocket → Kafka producer
│
├── flink_jobs/
│   ├── ohlc_aggregator.py             # OHLC candles (tumbling windows) + VWAP
│   └── price_alert.py                 # RSI, SMA, price change alerts
│
├── backfill/
│   ├── Dockerfile
│   └── historical_backfill.py         # Binance REST → InfluxDB (up to 5 years)
│
├── grafana/
│   ├── dashboard.json                 # Auto-provisioned 9-panel dashboard
│   └── provisioning/                  # Datasource and dashboard config
│
└── nginx/
    └── nginx.conf                     # Reverse proxy, rate limiting, security headers
```

## Configuration

Copy `.env.example` and modify as needed:

```bash
cp .env.example .env
```

### Key Settings

| Variable | Default | Description |
|---|---|---|
| `SYMBOLS` | `btcusdt,ethusdt,...,qntusdt` | Crypto pairs to track |
| `INFLUXDB_TOKEN` | — | InfluxDB admin token |
| `GRAFANA_ADMIN_PASSWORD` | — | Grafana admin password |
| `NEXTAUTH_SECRET` | — | JWT signing secret |
| `GOOGLE_CLIENT_ID` | *(optional)* | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | *(optional)* | Google OAuth client secret |
| `CRYPTOPANIC_API_KEY` | *(optional)* | CryptoPanic news API key |
| `ALERT_THRESHOLD_5M` | `2.0` | % change threshold for 5-min alerts |
| `ALERT_THRESHOLD_15M` | `5.0` | % change threshold for 15-min alerts |
| `RSI_PERIOD` | `14` | RSI calculation period |

Generate secrets:
```bash
openssl rand -hex 32    # Use for INFLUXDB_TOKEN and NEXTAUTH_SECRET
```

## Kafka Topics

| Topic | Partitions | Description |
|---|---|---|
| `raw-prices` | 7 | Raw ticker data from Binance (partitioned by symbol) |
| `ohlc-1m` | 7 | 1-minute OHLC candles |
| `ohlc-5m` | 7 | 5-minute OHLC candles |
| `ohlc-15m` | 7 | 15-minute OHLC candles |
| `ohlc-30m` | 7 | 30-minute OHLC candles |
| `ohlc-1h` | 7 | 1-hour OHLC candles |
| `vwap` | 7 | Volume-weighted average prices |
| `price-alerts` | 7 | Price movement and RSI alerts |
| `dead-letter-queue` | 1 | Malformed or unprocessable messages |

## Data Flow

1. **Producer** connects to Binance WebSocket, receives trade data, publishes to `raw-prices` Kafka topic
2. **Flink OHLC Aggregator** consumes `raw-prices`, computes tumbling-window OHLC candles (1m through 1h) with VWAP, writes to both Kafka topics and InfluxDB
3. **Flink Price Alert Detector** computes RSI-14 and SMA-7/14 using keyed process functions, detects significant price moves, writes alerts to Kafka and InfluxDB
4. **Backfill Service** loads historical candles (up to 5 years) from Binance REST API into InfluxDB on first startup
5. **Next.js Dashboard** queries InfluxDB for historical data, streams live updates via Binance WebSocket (SharedWorker) and SSE, renders TradingView charts

## Development

### Frontend Only (local dev)

```bash
cd frontend
npm install
npx prisma generate
npm run dev
```

Requires InfluxDB running (for chart data) and the env vars set in `.env`.

### Rebuild Frontend

```bash
docker compose build frontend
docker compose up -d frontend
```

### View Logs

```bash
docker compose logs -f <service>    # producer, frontend, flink-jobmanager, etc.
```

## License

MIT
