"""
Historical OHLC Backfill — Binance REST API → InfluxDB

Fetches historical klines from Binance and writes them directly to InfluxDB
in the exact same format that Flink produces, so Grafana dashboards show
continuous history from day one.

Tiered strategy:
  1m  → 7 days      5m  → 30 days     15m → 90 days
  30m → 6 months    1h  → 5 years
"""

import os
import sys
import time
import requests
from datetime import datetime, timedelta, timezone
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

# ── Config from environment ──────────────────────────────────────────────────
INFLUXDB_URL = os.environ.get("INFLUXDB_URL", "http://influxdb:8086")
INFLUXDB_TOKEN = os.environ["INFLUXDB_TOKEN"]
INFLUXDB_ORG = os.environ.get("INFLUXDB_ORG", "crypto-analytics")
INFLUXDB_BUCKET = os.environ.get("INFLUXDB_BUCKET", "crypto")
SYMBOLS = [s.strip().upper() for s in os.environ.get("SYMBOLS", "btcusdt,ethusdt,solusdt,adausdt,dotusdt,bchusdt,qntusdt").split(",")]

BINANCE_BASE_URL = "https://api.binance.com/api/v3/klines"

# Tiered history: (binance_interval, measurement_name, days_back)
TIERS = [
    ("1m",  "ohlc_1m",  7),
    ("5m",  "ohlc_5m",  30),
    ("15m", "ohlc_15m", 90),
    ("30m", "ohlc_30m", 180),
    ("1h",  "ohlc_1h",  1825),  # ~5 years
]

BATCH_SIZE = 500


def check_existing_data(client, measurement, symbol):
    """Check if backfill data already exists for this measurement+symbol."""
    query_api = client.query_api()
    query = f'''
    from(bucket: "{INFLUXDB_BUCKET}")
      |> range(start: -5y)
      |> filter(fn: (r) => r._measurement == "{measurement}")
      |> filter(fn: (r) => r.symbol == "{symbol}")
      |> filter(fn: (r) => r._field == "close")
      |> count()
      |> yield(name: "count")
    '''
    try:
        tables = query_api.query(query, org=INFLUXDB_ORG)
        for table in tables:
            for record in table.records:
                if record.get_value() > 100:
                    return True
    except Exception:
        pass
    return False


def fetch_klines(symbol, interval, start_ms, end_ms):
    """Fetch up to 1000 klines from Binance REST API."""
    params = {
        "symbol": symbol,
        "interval": interval,
        "startTime": start_ms,
        "endTime": end_ms,
        "limit": 1000,
    }
    resp = requests.get(BINANCE_BASE_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def kline_to_point(kline, measurement, symbol):
    """
    Convert a Binance kline array to an InfluxDB Point.

    Binance kline format:
    [0]  open_time (ms)
    [1]  open
    [2]  high
    [3]  low
    [4]  close
    [5]  volume
    [6]  close_time (ms)
    [7]  quote_volume
    [8]  number_of_trades
    ...
    """
    open_time_ms = int(kline[0])
    open_price = float(kline[1])
    high_price = float(kline[2])
    low_price = float(kline[3])
    close_price = float(kline[4])
    volume = float(kline[5])
    quote_volume = float(kline[7])
    trade_count = int(kline[8])

    vwap = quote_volume / volume if volume > 0 else close_price

    return (
        Point(measurement)
        .tag("symbol", symbol)
        .field("open", round(open_price, 8))
        .field("high", round(high_price, 8))
        .field("low", round(low_price, 8))
        .field("close", round(close_price, 8))
        .field("volume", round(volume, 4))
        .field("vwap", round(vwap, 8))
        .field("trade_count", trade_count)
        .time(open_time_ms, WritePrecision.MS)
    )


def backfill_symbol_interval(write_api, symbol, binance_interval, measurement, days_back):
    """Fetch all historical klines for one symbol+interval and write to InfluxDB."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days_back)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    total_points = 0
    current_start = start_ms

    while current_start < end_ms:
        klines = fetch_klines(symbol, binance_interval, current_start, end_ms)
        if not klines:
            break

        points = [kline_to_point(k, measurement, symbol) for k in klines]

        # Write in batches
        for i in range(0, len(points), BATCH_SIZE):
            batch = points[i:i + BATCH_SIZE]
            write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=batch)

        total_points += len(points)

        # Move start to after the last kline's open_time
        last_open_time = int(klines[-1][0])
        if last_open_time <= current_start:
            break  # No progress, avoid infinite loop
        current_start = last_open_time + 1

        # Small delay to be respectful to Binance API
        time.sleep(0.1)

    return total_points


def wait_for_influxdb(client, max_retries=30, delay=5):
    """Wait until InfluxDB is ready."""
    for i in range(max_retries):
        try:
            health = client.health()
            if health.status == "pass":
                print("InfluxDB is ready.")
                return True
        except Exception as e:
            print(f"Waiting for InfluxDB... ({i+1}/{max_retries}): {e}")
        time.sleep(delay)
    print("ERROR: InfluxDB not ready after retries.")
    return False


def main():
    print("=" * 60)
    print("Historical OHLC Backfill")
    print(f"Symbols: {', '.join(SYMBOLS)}")
    print(f"InfluxDB: {INFLUXDB_URL}")
    print("=" * 60)

    client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)

    if not wait_for_influxdb(client):
        sys.exit(1)

    write_api = client.write_api(write_options=SYNCHRONOUS)

    total_start = time.time()
    grand_total = 0

    for symbol in SYMBOLS:
        for binance_interval, measurement, days_back in TIERS:
            # Check if data already exists
            if check_existing_data(client, measurement, symbol):
                print(f"  SKIP {symbol} {measurement} — data already exists")
                continue

            print(f"  Fetching {symbol} {binance_interval} ({days_back} days)...", end=" ", flush=True)
            try:
                count = backfill_symbol_interval(write_api, symbol, binance_interval, measurement, days_back)
                print(f"{count:,} candles written")
                grand_total += count
            except Exception as e:
                print(f"ERROR: {e}")

    elapsed = time.time() - total_start
    print("=" * 60)
    print(f"Backfill complete: {grand_total:,} total candles in {elapsed:.1f}s")
    print("=" * 60)

    client.close()


if __name__ == "__main__":
    main()
