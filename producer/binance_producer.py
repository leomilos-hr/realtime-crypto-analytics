"""
Binance WebSocket → Kafka Producer

Connects to the Binance WebSocket API and streams real-time ticker data
for configured crypto pairs into a Kafka topic.

Each message contains: symbol, price, volume, timestamp, and trade metadata.
"""

import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone

import websocket
from confluent_kafka import Producer
from confluent_kafka.admin import AdminClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "raw-prices")
SYMBOLS = os.getenv("SYMBOLS", "btcusdt,ethusdt,solusdt").lower().split(",")

# Binance combined stream URL for multiple symbols
BINANCE_WS_URL = (
    "wss://stream.binance.com:9443/stream?streams="
    + "/".join(f"{s.strip()}@ticker" for s in SYMBOLS)
)

shutdown_requested = False


def signal_handler(sig, frame):
    global shutdown_requested
    logger.info("Shutdown signal received, closing gracefully...")
    shutdown_requested = True


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def wait_for_kafka(bootstrap_servers: str, max_retries: int = 30, delay: int = 5):
    """Block until Kafka is reachable."""
    client = AdminClient({"bootstrap.servers": bootstrap_servers})
    for attempt in range(1, max_retries + 1):
        try:
            metadata = client.list_topics(timeout=5)
            if metadata.brokers:
                logger.info(
                    "Kafka is ready (%d broker(s) found).", len(metadata.brokers)
                )
                return
        except Exception:
            pass
        logger.warning(
            "Kafka not ready (attempt %d/%d), retrying in %ds...",
            attempt,
            max_retries,
            delay,
        )
        time.sleep(delay)
    logger.error("Could not connect to Kafka after %d attempts. Exiting.", max_retries)
    sys.exit(1)


def create_producer() -> Producer:
    """Create and return a Kafka producer."""
    conf = {
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "client.id": "binance-producer",
        "acks": "all",
        "linger.ms": 50,
        "batch.num.messages": 100,
        "compression.type": "snappy",
        "retries": 5,
        "retry.backoff.ms": 500,
    }
    return Producer(conf)


def delivery_callback(err, msg):
    """Called once for each message produced to indicate delivery result."""
    if err is not None:
        logger.error("Message delivery failed for %s: %s", msg.key(), err)
    else:
        logger.debug(
            "Delivered to %s [%d] @ offset %d",
            msg.topic(),
            msg.partition(),
            msg.offset(),
        )


def parse_ticker(data: dict) -> dict | None:
    """Parse a Binance 24hr ticker message into our standardized format."""
    try:
        return {
            "symbol": data["s"].upper(),
            "price": float(data["c"]),  # Last price
            "open": float(data["o"]),  # Open price (24h)
            "high": float(data["h"]),  # High price (24h)
            "low": float(data["l"]),  # Low price (24h)
            "volume": float(data["v"]),  # Total traded base asset volume
            "quote_volume": float(data["q"]),  # Total traded quote asset volume
            "price_change_pct": float(data["P"]),  # Price change percent (24h)
            "trades": int(data["n"]),  # Number of trades (24h)
            "event_time": int(data["E"]),  # Event time (ms epoch)
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except (KeyError, ValueError, TypeError) as e:
        logger.warning("Failed to parse ticker data: %s — %s", e, data)
        return None


def run():
    """Main loop: connect to Binance WS and produce to Kafka."""
    wait_for_kafka(KAFKA_BOOTSTRAP_SERVERS)
    producer = create_producer()

    message_count = 0
    last_log_time = time.time()

    def on_message(ws, raw_message):
        nonlocal message_count, last_log_time

        if shutdown_requested:
            ws.close()
            return

        try:
            envelope = json.loads(raw_message)
            data = envelope.get("data", envelope)
        except json.JSONDecodeError as e:
            logger.warning("Invalid JSON from WebSocket: %s", e)
            return

        parsed = parse_ticker(data)
        if parsed is None:
            return

        key = parsed["symbol"]
        value = json.dumps(parsed)

        producer.produce(
            topic=KAFKA_TOPIC,
            key=key.encode("utf-8"),
            value=value.encode("utf-8"),
            callback=delivery_callback,
        )
        producer.poll(0)
        message_count += 1

        # Log throughput every 30 seconds
        now = time.time()
        if now - last_log_time >= 30:
            logger.info(
                "Produced %d messages in last 30s. Latest: %s @ $%.2f",
                message_count,
                parsed["symbol"],
                parsed["price"],
            )
            message_count = 0
            last_log_time = now

    def on_error(ws, error):
        logger.error("WebSocket error: %s", error)

    def on_close(ws, close_status_code, close_msg):
        logger.info("WebSocket closed: %s %s", close_status_code, close_msg)
        producer.flush(timeout=10)

    def on_open(ws):
        logger.info("Connected to Binance WebSocket")
        logger.info("Streaming symbols: %s", ", ".join(s.upper() for s in SYMBOLS))

    while not shutdown_requested:
        logger.info("Connecting to %s", BINANCE_WS_URL)
        ws = websocket.WebSocketApp(
            BINANCE_WS_URL,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
            on_open=on_open,
        )
        ws.run_forever(ping_interval=30, ping_timeout=10)

        if not shutdown_requested:
            logger.warning("Connection lost. Reconnecting in 5s...")
            time.sleep(5)

    producer.flush(timeout=30)
    logger.info("Producer shut down cleanly.")


if __name__ == "__main__":
    run()
