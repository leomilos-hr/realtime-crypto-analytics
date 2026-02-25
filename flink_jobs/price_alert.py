"""
Flink Price Alert Job

Detects significant price movements within sliding windows:
- >2% price change in a 5-minute window → alert
- >5% price change in a 15-minute window → high alert

Also computes rolling RSI (Relative Strength Index) and simple moving averages.

Alerts are written to a dedicated Kafka topic and InfluxDB.
"""

import json
import logging
import os
from datetime import datetime, timezone

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from pyflink.common import WatermarkStrategy
from pyflink.common.serialization import SimpleStringSchema
from pyflink.common.time import Duration
from pyflink.common.watermark_strategy import TimestampAssigner
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import (
    KafkaOffsetsInitializer,
    KafkaRecordSerializationSchema,
    KafkaSink,
    KafkaSource,
)
from pyflink.datastream.functions import (
    KeyedProcessFunction,
    RuntimeContext,
)
from pyflink.datastream.state import (
    ListStateDescriptor,
    ValueStateDescriptor,
)
from pyflink.common import Types

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://localhost:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN", "my-super-secret-token")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "crypto-analytics")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "crypto")

ALERT_THRESHOLD_5M = float(os.getenv("ALERT_THRESHOLD_5M", "2.0"))   # 2% in 5 min
ALERT_THRESHOLD_15M = float(os.getenv("ALERT_THRESHOLD_15M", "5.0"))  # 5% in 15 min
RSI_PERIOD = int(os.getenv("RSI_PERIOD", "14"))


class PriceTimestampAssigner(TimestampAssigner):
    def extract_timestamp(self, value, record_timestamp):
        try:
            data = json.loads(value)
            return int(data["event_time"])
        except (json.JSONDecodeError, KeyError, TypeError):
            return record_timestamp


class PriceAlertProcessor(KeyedProcessFunction):
    """
    Stateful processor that maintains a sliding window of prices and detects:
    1. Rapid price changes (>threshold% in N minutes)
    2. RSI overbought/oversold conditions
    3. Moving average crossovers
    """

    def open(self, runtime_context: RuntimeContext):
        # Store recent prices as a list: [(timestamp_ms, price), ...]
        self.price_history = runtime_context.get_list_state(
            ListStateDescriptor(
                "price_history",
                Types.STRING(),
            )
        )
        # Track last alert time to prevent alert flooding
        self.last_alert_time = runtime_context.get_state(
            ValueStateDescriptor("last_alert_time", Types.LONG())
        )
        # InfluxDB client (lazy init)
        self._influx_client = None
        self._write_api = None

    def _get_writer(self):
        if self._influx_client is None:
            self._influx_client = InfluxDBClient(
                url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG
            )
            self._write_api = self._influx_client.write_api(write_options=SYNCHRONOUS)
        return self._write_api

    def _prune_old_entries(self, current_time_ms, max_age_ms=15 * 60 * 1000):
        """Remove entries older than max_age_ms from state."""
        cutoff = current_time_ms - max_age_ms
        entries = list(self.price_history.get())
        fresh = [e for e in entries if json.loads(e)[0] >= cutoff]
        self.price_history.clear()
        for entry in fresh:
            self.price_history.add(entry)
        return [json.loads(e) for e in fresh]

    def _compute_rsi(self, prices):
        """Compute RSI from a list of prices."""
        if len(prices) < RSI_PERIOD + 1:
            return None

        # Use the last RSI_PERIOD+1 prices
        recent = [p for _, p in prices[-(RSI_PERIOD + 1):]]
        gains = []
        losses = []

        for i in range(1, len(recent)):
            change = recent[i] - recent[i - 1]
            if change > 0:
                gains.append(change)
                losses.append(0.0)
            else:
                gains.append(0.0)
                losses.append(abs(change))

        avg_gain = sum(gains) / len(gains) if gains else 0
        avg_loss = sum(losses) / len(losses) if losses else 0

        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return round(100.0 - (100.0 / (1.0 + rs)), 2)

    def _compute_sma(self, prices, period):
        """Compute Simple Moving Average."""
        if len(prices) < period:
            return None
        recent = [p for _, p in prices[-period:]]
        return round(sum(recent) / len(recent), 8)

    def _check_price_alert(self, symbol, prices, window_minutes, threshold_pct):
        """Check if price changed more than threshold within the window."""
        window_ms = window_minutes * 60 * 1000
        if not prices:
            return None

        latest_time, latest_price = prices[-1]
        cutoff = latest_time - window_ms
        window_prices = [(t, p) for t, p in prices if t >= cutoff]

        if len(window_prices) < 2:
            return None

        start_price = window_prices[0][1]
        if start_price == 0:
            return None

        pct_change = ((latest_price - start_price) / start_price) * 100

        if abs(pct_change) >= threshold_pct:
            direction = "UP" if pct_change > 0 else "DOWN"
            severity = "HIGH" if abs(pct_change) >= threshold_pct * 2 else "MEDIUM"
            return {
                "type": "PRICE_ALERT",
                "symbol": symbol,
                "direction": direction,
                "severity": severity,
                "pct_change": round(pct_change, 4),
                "threshold": threshold_pct,
                "window_minutes": window_minutes,
                "start_price": round(start_price, 8),
                "current_price": round(latest_price, 8),
                "timestamp": datetime.fromtimestamp(
                    latest_time / 1000, tz=timezone.utc
                ).isoformat(),
                "event_time": latest_time,
            }
        return None

    def process_element(self, value, ctx):
        try:
            data = json.loads(value)
            symbol = data["symbol"]
            price = float(data["price"])
            event_time = int(data["event_time"])
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            return

        # Add to price history
        self.price_history.add(json.dumps([event_time, price]))

        # Prune old entries (keep 15 min window)
        history = self._prune_old_entries(event_time)

        # Only emit analytics every 5 seconds to avoid flooding
        last_alert = self.last_alert_time.value()
        if last_alert is not None and (event_time - last_alert) < 5000:
            return

        alerts = []

        # Check 5-minute price alert
        alert_5m = self._check_price_alert(
            symbol, history, 5, ALERT_THRESHOLD_5M
        )
        if alert_5m:
            alerts.append(alert_5m)

        # Check 15-minute price alert
        alert_15m = self._check_price_alert(
            symbol, history, 15, ALERT_THRESHOLD_15M
        )
        if alert_15m:
            alerts.append(alert_15m)

        # Compute RSI
        rsi = self._compute_rsi(history)
        if rsi is not None:
            # RSI alerts: overbought (>70) or oversold (<30)
            if rsi > 70 or rsi < 30:
                condition = "OVERBOUGHT" if rsi > 70 else "OVERSOLD"
                alerts.append({
                    "type": "RSI_ALERT",
                    "symbol": symbol,
                    "condition": condition,
                    "rsi": rsi,
                    "severity": "HIGH" if (rsi > 80 or rsi < 20) else "MEDIUM",
                    "current_price": round(price, 8),
                    "timestamp": datetime.fromtimestamp(
                        event_time / 1000, tz=timezone.utc
                    ).isoformat(),
                    "event_time": event_time,
                })

            # Write RSI to InfluxDB regardless of alert
            try:
                writer = self._get_writer()
                point = (
                    Point("rsi")
                    .tag("symbol", symbol)
                    .field("rsi", rsi)
                    .field("price", price)
                    .time(
                        datetime.fromtimestamp(event_time / 1000, tz=timezone.utc),
                        WritePrecision.MS,
                    )
                )
                writer.write(bucket=INFLUXDB_BUCKET, record=point)
            except Exception as e:
                logger.error("Failed to write RSI to InfluxDB: %s", e)

        # Compute SMAs and write to InfluxDB
        sma_7 = self._compute_sma(history, 7)
        sma_14 = self._compute_sma(history, 14)
        if sma_7 is not None and sma_14 is not None:
            try:
                writer = self._get_writer()
                point = (
                    Point("moving_averages")
                    .tag("symbol", symbol)
                    .field("sma_7", sma_7)
                    .field("sma_14", sma_14)
                    .field("price", price)
                    .time(
                        datetime.fromtimestamp(event_time / 1000, tz=timezone.utc),
                        WritePrecision.MS,
                    )
                )
                writer.write(bucket=INFLUXDB_BUCKET, record=point)
            except Exception as e:
                logger.error("Failed to write SMA to InfluxDB: %s", e)

        # Emit alerts
        if alerts:
            self.last_alert_time.update(event_time)
            for alert in alerts:
                yield json.dumps(alert)

                # Write alert to InfluxDB
                try:
                    writer = self._get_writer()
                    point = (
                        Point("alerts")
                        .tag("symbol", alert["symbol"])
                        .tag("type", alert["type"])
                        .tag("severity", alert.get("severity", "MEDIUM"))
                        .field("message", json.dumps(alert))
                        .field("price", alert.get("current_price", 0.0))
                    )
                    if "pct_change" in alert:
                        point = point.field("pct_change", alert["pct_change"])
                    if "rsi" in alert:
                        point = point.field("rsi", alert["rsi"])
                    point = point.time(
                        datetime.fromtimestamp(
                            alert["event_time"] / 1000, tz=timezone.utc
                        ),
                        WritePrecision.MS,
                    )
                    writer.write(bucket=INFLUXDB_BUCKET, record=point)
                except Exception as e:
                    logger.error("Failed to write alert to InfluxDB: %s", e)


def main():
    logger.info("Starting Price Alert Flink job...")

    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(2)

    env.add_jars(
        "file:///opt/flink/lib/flink-sql-connector-kafka-3.0.2-1.18.jar"
    )

    watermark_strategy = (
        WatermarkStrategy
        .for_bounded_out_of_orderness(Duration.of_seconds(5))
        .with_timestamp_assigner(PriceTimestampAssigner())
    )

    kafka_source = (
        KafkaSource.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP_SERVERS)
        .set_topics("raw-prices")
        .set_group_id("price-alert-processor")
        .set_starting_offsets(KafkaOffsetsInitializer.latest())
        .set_value_only_deserializer(SimpleStringSchema())
        .build()
    )

    source_stream = env.from_source(
        kafka_source, watermark_strategy, "Kafka Source (raw-prices)"
    )

    # Process each symbol independently
    alert_stream = (
        source_stream
        .key_by(lambda x: json.loads(x).get("symbol", "UNKNOWN") if x else "UNKNOWN")
        .process(PriceAlertProcessor(), output_type=Types.STRING())
    )

    # Sink alerts to Kafka topic
    kafka_sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP_SERVERS)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic("price-alerts")
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )
    alert_stream.sink_to(kafka_sink).name("Kafka Sink (price-alerts)")

    # Log alerts to stdout
    alert_stream.map(
        lambda x: logger.info("ALERT: %s", x) or x
    ).name("Alert Logger")

    env.execute("Price Alert Detector")


if __name__ == "__main__":
    main()
