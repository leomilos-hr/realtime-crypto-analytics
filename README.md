# Real-Time Crypto Analytics Dashboard

A production-grade streaming analytics pipeline that processes real-time cryptocurrency data from Binance, computes technical indicators using Apache Flink, and visualizes everything on a live Grafana dashboard.

## Architecture

```
Binance WebSocket API (free, no auth)
        │
        ▼
  Python Producer ──→ Kafka [raw-prices]
                            │
                            ▼
                      Apache Flink (PyFlink)
                      ┌─────────┴─────────┐
                      │                    │
              OHLC Aggregator      Price Alert Detector
              (1m, 5m, 15m)       (CEP + RSI + SMA)
                      │                    │
                      ▼                    ▼
              Kafka [ohlc-*]       Kafka [price-alerts]
                      │                    │
                      └────────┬───────────┘
                               ▼
                           InfluxDB
                               │
                               ▼
                      Grafana Dashboard
                       (live refresh)
```

## Features

### Core Pipeline
- **Real-time ingestion** from Binance WebSocket API (BTC, ETH, SOL, ADA, DOT)
- **OHLC candlesticks** computed via Flink tumbling windows (1-min, 5-min, 15-min)
- **VWAP** (Volume-Weighted Average Price) as a streaming aggregation
- **Live Grafana dashboard** with candlestick charts, price overlays, and volume bars

### Analytics & Alerts
- **Price change alerts**: >2% movement in 5 minutes, >5% in 15 minutes
- **RSI** (Relative Strength Index) with overbought/oversold detection
- **Simple Moving Averages** (SMA-7 and SMA-14) with crossover tracking
- **Dead letter queue** for malformed messages

### Technical Highlights
- Flink **event-time processing** with watermarks for out-of-order data
- **Stateful stream processing** via Flink's `KeyedProcessFunction`
- **Exactly-once semantics** with Kafka acknowledgments
- Snappy compression and batching for high-throughput Kafka producing
- Graceful shutdown handling in the producer

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Data Source | Binance WebSocket API | Free real-time crypto price feed |
| Message Broker | Apache Kafka (Confluent) | Decoupled, durable message transport |
| Stream Processor | Apache Flink (PyFlink) | Windowed aggregations, stateful CEP |
| Time-Series DB | InfluxDB 2.7 | Optimized storage for Grafana queries |
| Visualization | Grafana 10.2 | Live-updating dashboards |
| Orchestration | Docker Compose | One-command local deployment |

## Quick Start

### Prerequisites
- Docker and Docker Compose

### Run

```bash
# Clone the repository
git clone https://github.com/yourusername/realtime-crypto-analytics.git
cd realtime-crypto-analytics

# Start all services
docker compose up -d

# Watch the logs
docker compose logs -f producer        # See raw price data flowing
docker compose logs -f flink-jobmanager # See Flink job status
```

### Access the UIs

| Service | URL | Credentials |
|---|---|---|
| **Grafana Dashboard** | http://localhost:3000 | admin / admin |
| **Flink Web UI** | http://localhost:8081 | — |
| **InfluxDB UI** | http://localhost:8086 | admin / adminpassword |

The Grafana dashboard is **auto-provisioned** — open it and you'll see live candlestick charts within 1-2 minutes of starting the pipeline.

### Stop

```bash
docker compose down           # Stop services (keep data)
docker compose down -v        # Stop services and delete volumes
```

## Project Structure

```
├── docker-compose.yml                  # Full stack orchestration
├── producer/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── binance_producer.py             # WebSocket → Kafka producer
├── flink_jobs/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── ohlc_aggregator.py              # Tumbling window OHLC + VWAP
│   └── price_alert.py                  # Anomaly detection + RSI + SMA
├── grafana/
│   ├── dashboard.json                  # Auto-provisioned dashboard
│   └── provisioning/
│       ├── dashboards/default.yml
│       └── datasources/influxdb.yml
├── .env.example                        # Environment variable reference
└── .gitignore
```

## Configuration

Copy `.env.example` and modify as needed:

```bash
cp .env.example .env
```

Key settings:

| Variable | Default | Description |
|---|---|---|
| `SYMBOLS` | `btcusdt,ethusdt,solusdt,adausdt,dotusdt` | Crypto pairs to track |
| `ALERT_THRESHOLD_5M` | `2.0` | % change threshold for 5-min alerts |
| `ALERT_THRESHOLD_15M` | `5.0` | % change threshold for 15-min alerts |
| `RSI_PERIOD` | `14` | RSI calculation period |

## Kafka Topics

| Topic | Description |
|---|---|
| `raw-prices` | Raw ticker data from Binance (partitioned by symbol) |
| `ohlc-1m` | 1-minute OHLC candles |
| `ohlc-5m` | 5-minute OHLC candles |
| `ohlc-15m` | 15-minute OHLC candles |
| `vwap` | Volume-weighted average prices |
| `price-alerts` | Price movement and RSI alerts |
| `dead-letter-queue` | Malformed or unprocessable messages |

## Flink Jobs

### OHLC Aggregator (`ohlc_aggregator.py`)
Reads from `raw-prices` and computes OHLC candles using **tumbling event-time windows**. Each window emits:
- Open, High, Low, Close prices
- Total volume
- VWAP (Volume-Weighted Average Price)
- Trade count

### Price Alert Detector (`price_alert.py`)
Stateful processor using `KeyedProcessFunction` that maintains a sliding price history per symbol and computes:
- **Price change detection** with configurable thresholds
- **RSI (14-period)** with overbought (>70) / oversold (<30) alerts
- **SMA-7 and SMA-14** moving averages

## Grafana Dashboard Panels

1. **BTC/USDT Candlestick** — 1-minute candles
2. **ETH/USDT Candlestick** — 1-minute candles
3. **Live Prices** — All symbols overlaid on one time-series chart
4. **VWAP vs Close Price** — BTC volume-weighted average vs closing price
5. **RSI (14-period)** — With overbought/oversold threshold lines
6. **Trading Volume** — Bar chart of 1-minute volume windows
7. **Moving Averages** — SMA-7 vs SMA-14 vs price
8. **Price Alerts Table** — Recent alerts with severity highlighting
9. **System Stats** — Aggregate trade counts

## License

MIT
