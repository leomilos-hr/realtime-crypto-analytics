"""
Flink OHLC Aggregator

Reads raw price ticks from Kafka and computes 1-min, 5-min, and 15-min
OHLC (Open, High, Low, Close) candles using tumbling time windows.

Also computes VWAP (Volume-Weighted Average Price) per window.

Results are written to InfluxDB for Grafana visualization.
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from pyflink.common import Row, Types, WatermarkStrategy, Time
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
    AggregateFunction,
    ProcessWindowFunction,
)
from pyflink.datastream.window import TumblingEventTimeWindows

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


class PriceTimestampAssigner(TimestampAssigner):
    """Extract event_time from the raw price tick for watermarking."""

    def extract_timestamp(self, value, record_timestamp):
        try:
            data = json.loads(value)
            return int(data["event_time"])
        except (json.JSONDecodeError, KeyError, TypeError):
            return record_timestamp


class OHLCAggregate(AggregateFunction):
    """
    Aggregate function for computing OHLC + VWAP over a window.

    Accumulator format:
    (symbol, open_price, high, low, close, total_volume, vwap_numerator,
     first_event_time, last_event_time, trade_count)
    """

    def create_accumulator(self):
        return (
            "",     # symbol
            0.0,    # open
            0.0,    # high
            float("inf"),  # low
            0.0,    # close
            0.0,    # volume
            0.0,    # vwap_numerator (sum of price * volume)
            0,      # first_event_time
            0,      # last_event_time
            0,      # trade_count
        )

    def add(self, value, accumulator):
        try:
            data = json.loads(value)
            symbol = data["symbol"]
            price = float(data["price"])
            volume = float(data["volume"])
            event_time = int(data["event_time"])
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            return accumulator

        s, o, h, l, c, v, vn, ft, lt, tc = accumulator

        # First tick in window
        if tc == 0:
            return (symbol, price, price, price, price, volume,
                    price * volume, event_time, event_time, 1)

        new_high = max(h, price)
        new_low = min(l, price)

        # Open = price of first event, Close = price of last event
        if event_time < ft:
            new_open = price
            new_first = event_time
        else:
            new_open = o
            new_first = ft

        if event_time >= lt:
            new_close = price
            new_last = event_time
        else:
            new_close = c
            new_last = lt

        return (
            symbol, new_open, new_high, new_low, new_close,
            v + volume, vn + price * volume,
            new_first, new_last, tc + 1,
        )

    def get_result(self, accumulator):
        s, o, h, l, c, v, vn, ft, lt, tc = accumulator
        vwap = vn / v if v > 0 else 0.0
        return json.dumps({
            "symbol": s,
            "open": round(o, 8),
            "high": round(h, 8),
            "low": round(l, 8),
            "close": round(c, 8),
            "volume": round(v, 4),
            "vwap": round(vwap, 8),
            "trade_count": tc,
            "window_start": ft,
            "window_end": lt,
        })

    def merge(self, a, b):
        s1, o1, h1, l1, c1, v1, vn1, ft1, lt1, tc1 = a
        s2, o2, h2, l2, c2, v2, vn2, ft2, lt2, tc2 = b

        if tc1 == 0:
            return b
        if tc2 == 0:
            return a

        symbol = s1 or s2
        new_open = o1 if ft1 <= ft2 else o2
        new_close = c1 if lt1 >= lt2 else c2

        return (
            symbol,
            new_open,
            max(h1, h2),
            min(l1, l2),
            new_close,
            v1 + v2,
            vn1 + vn2,
            min(ft1, ft2),
            max(lt1, lt2),
            tc1 + tc2,
        )


class InfluxDBSinkFunction:
    """Write OHLC candles to InfluxDB."""

    def __init__(self, measurement: str):
        self.measurement = measurement
        self._client = None
        self._write_api = None

    def _get_writer(self):
        if self._client is None:
            self._client = InfluxDBClient(
                url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG
            )
            self._write_api = self._client.write_api(write_options=SYNCHRONOUS)
        return self._write_api

    def write(self, value: str):
        try:
            data = json.loads(value)
            writer = self._get_writer()

            point = (
                Point(self.measurement)
                .tag("symbol", data["symbol"])
                .field("open", data["open"])
                .field("high", data["high"])
                .field("low", data["low"])
                .field("close", data["close"])
                .field("volume", data["volume"])
                .field("vwap", data["vwap"])
                .field("trade_count", data["trade_count"])
                .time(
                    datetime.fromtimestamp(
                        data["window_start"] / 1000, tz=timezone.utc
                    ),
                    WritePrecision.MS,
                )
            )
            writer.write(bucket=INFLUXDB_BUCKET, record=point)
        except Exception as e:
            logger.error("Failed to write to InfluxDB: %s", e)


def build_ohlc_pipeline(
    env: StreamExecutionEnvironment,
    source_stream,
    window_size: Time,
    window_label: str,
    kafka_output_topic: str,
):
    """
    Build an OHLC pipeline for a given window size.

    Reads from a shared source, keys by symbol, applies tumbling windows,
    and sinks to both Kafka and InfluxDB.
    """
    influx_sink = InfluxDBSinkFunction(measurement=f"ohlc_{window_label}")

    # Key by symbol, apply tumbling window, aggregate to OHLC
    ohlc_stream = (
        source_stream
        .key_by(lambda x: json.loads(x).get("symbol", "UNKNOWN") if x else "UNKNOWN")
        .window(TumblingEventTimeWindows.of(window_size))
        .aggregate(OHLCAggregate(), output_type=Types.STRING())
    )

    # Sink to Kafka
    kafka_sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP_SERVERS)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic(kafka_output_topic)
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )
    ohlc_stream.sink_to(kafka_sink).name(f"Kafka Sink ({window_label})")

    # Sink to InfluxDB via map
    ohlc_stream.map(
        lambda x: (influx_sink.write(x), x)[1],
        output_type=Types.STRING()
    ).name(f"InfluxDB Sink ({window_label})")

    return ohlc_stream


def main():
    logger.info("Starting OHLC Aggregator Flink job...")

    env = StreamExecutionEnvironment.get_execution_environment()
    env.set_parallelism(2)

    # Add Kafka connector JAR
    env.add_jars(
        "file:///opt/flink/lib/flink-sql-connector-kafka-3.0.2-1.18.jar"
    )

    # Configure watermarks: allow up to 5 seconds of out-of-order events
    # Set idle timeout so partitions without data don't block watermark progress
    watermark_strategy = (
        WatermarkStrategy
        .for_bounded_out_of_orderness(Duration.of_seconds(5))
        .with_timestamp_assigner(PriceTimestampAssigner())
        .with_idleness(Duration.of_seconds(10))
    )

    # Kafka source for raw prices
    kafka_source = (
        KafkaSource.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP_SERVERS)
        .set_topics("raw-prices")
        .set_group_id("ohlc-aggregator")
        .set_starting_offsets(KafkaOffsetsInitializer.latest())
        .set_value_only_deserializer(SimpleStringSchema())
        .build()
    )

    source_stream = env.from_source(
        kafka_source, watermark_strategy, "Kafka Source (raw-prices)"
    )

    # Build 5 OHLC pipelines: 1m, 5m, 15m, 30m, 1h
    build_ohlc_pipeline(
        env, source_stream,
        Time.minutes(1), "1m", "ohlc-1m"
    )
    build_ohlc_pipeline(
        env, source_stream,
        Time.minutes(5), "5m", "ohlc-5m"
    )
    build_ohlc_pipeline(
        env, source_stream,
        Time.minutes(15), "15m", "ohlc-15m"
    )
    build_ohlc_pipeline(
        env, source_stream,
        Time.minutes(30), "30m", "ohlc-30m"
    )
    build_ohlc_pipeline(
        env, source_stream,
        Time.hours(1), "1h", "ohlc-1h"
    )

    # Also compute and sink VWAP to a dedicated topic
    vwap_sink = (
        KafkaSink.builder()
        .set_bootstrap_servers(KAFKA_BOOTSTRAP_SERVERS)
        .set_record_serializer(
            KafkaRecordSerializationSchema.builder()
            .set_topic("vwap")
            .set_value_serialization_schema(SimpleStringSchema())
            .build()
        )
        .build()
    )

    # 1-minute VWAP extractions (re-use OHLC data)
    def extract_vwap(x):
        d = json.loads(x)
        return json.dumps({
            "symbol": d["symbol"],
            "vwap": d["vwap"],
            "volume": d["volume"],
            "window_start": d["window_start"],
        })

    vwap_stream = (
        source_stream
        .key_by(lambda x: json.loads(x).get("symbol", "UNKNOWN") if x else "UNKNOWN")
        .window(TumblingEventTimeWindows.of(Time.minutes(1)))
        .aggregate(OHLCAggregate(), output_type=Types.STRING())
        .map(extract_vwap, output_type=Types.STRING())
    )
    vwap_stream.sink_to(vwap_sink).name("Kafka Sink (VWAP)")

    # Write VWAP to InfluxDB
    vwap_influx = InfluxDBSinkFunction(measurement="vwap")

    def write_vwap(value):
        try:
            data = json.loads(value)
            writer = vwap_influx._get_writer()
            point = (
                Point("vwap")
                .tag("symbol", data["symbol"])
                .field("vwap", data["vwap"])
                .field("volume", data["volume"])
                .time(
                    datetime.fromtimestamp(
                        data["window_start"] / 1000, tz=timezone.utc
                    ),
                    WritePrecision.MS,
                )
            )
            writer.write(bucket=INFLUXDB_BUCKET, record=point)
        except Exception as e:
            logger.error("Failed to write VWAP to InfluxDB: %s", e)
        return value

    vwap_stream.map(write_vwap, output_type=Types.STRING()).name("InfluxDB Sink (VWAP)")

    env.execute("OHLC Aggregator")


if __name__ == "__main__":
    main()
