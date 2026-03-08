# Real-Time Crypto Analytics

Full-stack streaming analytics platform for cryptocurrency markets with a custom web dashboard, user authentication, and 5 years of historical data.

## Architecture

```
Binance WebSocket API
        |
        v
  Python Producer --> Kafka [raw-prices]
                            |
                            v
                      Apache Flink (PyFlink)
                      +---------+---------+
                      |                   |
              OHLC Aggregator     Price Alert Detector
           (1m, 5m, 15m, 30m, 1h)  (RSI + SMA + alerts)
                      |                   |
                      v                   v
              Kafka [ohlc-*]      Kafka [price-alerts]
                      |                   |
                      +--------+----------+
                               v
                           InfluxDB
                               |
                               v
                    Next.js Dashboard
               (TradingView Charts + Auth)
                               |
                               v
                      Nginx Reverse Proxy
```

## Features

- **7 cryptocurrencies**: BTC, ETH, SOL, ADA, DOT, BCH, QNT
- **Professional charts**: TradingView lightweight-charts with candlesticks, volume, SMA overlays
- **5 timeframes**: 1m, 5m, 15m, 30m, 1h with dropdown selector
- **Technical indicators**: RSI (14-period), SMA (7/14), VWAP
- **Historical data**: Up to 5 years of hourly candles backfilled from Binance REST API
- **Live updates**: Real-time price ticker via Server-Sent Events
- **User auth**: Email/password registration and login (NextAuth.js + SQLite)
- **Price alerts**: Automatic detection of significant price moves and RSI extremes
- **Production-ready**: Nginx reverse proxy, secrets via env vars, rate limiting, security headers

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Data Source | Binance WebSocket API | Free real-time crypto price feed |
| Message Broker | Apache Kafka (Confluent) | Decoupled, durable message transport |
| Stream Processor | Apache Flink (PyFlink) | Windowed aggregations, stateful processing |
| Time-Series DB | InfluxDB 2.7 | Optimized storage for time-series queries |
| Frontend | Next.js 14 + TradingView Charts | Custom dashboard with auth |
| Auth | NextAuth.js + SQLite (Prisma) | User registration and login |
| Reverse Proxy | Nginx | Rate limiting, security headers, SSL-ready |
| Orchestration | Docker Compose | One-command deployment |

## Quick Start

### Prerequisites
- Docker and Docker Compose

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

# Watch the logs
docker compose logs -f producer        # See raw price data flowing
docker compose logs -f flink-jobmanager # See Flink job status
docker compose logs -f frontend        # See frontend startup
```

### Access

| Service | URL | Notes |
|---|---|---|
| **Dashboard** | http://localhost:3000 | Register an account to access |
| **Grafana** (admin) | http://localhost:3001 | Credentials from .env |

The historical backfill runs automatically on first startup, loading up to 5 years of candlestick data from Binance.

### Stop

```bash
docker compose down           # Stop services (keep data)
docker compose down -v        # Stop services and delete volumes
```

## Project Structure

```
├── docker-compose.yml              # Full stack orchestration (14 services)
├── .env.example                    # Environment variable reference
├── frontend/                       # Next.js custom dashboard
│   ├── Dockerfile
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/page.tsx  # Main dashboard with charts
│   │   │   ├── login/page.tsx      # Login page
│   │   │   ├── register/page.tsx   # Registration page
│   │   │   └── api/               # API routes (ohlc, rsi, sma, alerts, live)
│   │   ├── components/
│   │   │   ├── CandlestickChart.tsx # TradingView chart wrapper
│   │   │   ├── RSIChart.tsx        # RSI indicator chart
│   │   │   ├── LiveTicker.tsx      # Live price bar (SSE)
│   │   │   └── AlertsFeed.tsx      # Price alert panel
│   │   └── lib/
│   │       ├── influxdb.ts         # InfluxDB query client
│   │       └── auth.ts             # NextAuth configuration
│   └── prisma/
│       └── schema.prisma           # User model (SQLite)
├── producer/
│   └── binance_producer.py         # WebSocket → Kafka producer
├── flink_jobs/
│   ├── ohlc_aggregator.py          # OHLC candles (1m/5m/15m/30m/1h) + VWAP
│   └── price_alert.py              # RSI, SMA, price alerts
├── backfill/
│   └── historical_backfill.py      # Binance REST API → InfluxDB backfill
├── grafana/
│   ├── dashboard.json              # Auto-provisioned Grafana dashboard
│   └── provisioning/               # Datasource config
└── nginx/
    └── nginx.conf                  # Reverse proxy with security headers
```

## Configuration

Copy `.env.example` and modify as needed:

```bash
cp .env.example .env
```

Key settings:

| Variable | Default | Description |
|---|---|---|
| `SYMBOLS` | `btcusdt,ethusdt,...,qntusdt` | Crypto pairs to track (7 symbols) |
| `INFLUXDB_TOKEN` | — | InfluxDB admin token (generate with `openssl rand -hex 32`) |
| `GRAFANA_ADMIN_PASSWORD` | — | Grafana admin password |
| `NEXTAUTH_SECRET` | — | NextAuth JWT secret (generate with `openssl rand -hex 32`) |
| `ALERT_THRESHOLD_5M` | `2.0` | % change threshold for 5-min alerts |
| `RSI_PERIOD` | `14` | RSI calculation period |

## Kafka Topics

| Topic | Description |
|---|---|
| `raw-prices` | Raw ticker data from Binance (partitioned by symbol) |
| `ohlc-1m/5m/15m/30m/1h` | OHLC candles at each interval |
| `vwap` | Volume-weighted average prices |
| `price-alerts` | Price movement and RSI alerts |
| `dead-letter-queue` | Malformed or unprocessable messages |

## License

MIT
