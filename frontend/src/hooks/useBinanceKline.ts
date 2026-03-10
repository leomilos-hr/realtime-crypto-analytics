"use client";

import { useState, useEffect, useRef } from "react";
import type { Interval } from "@/lib/types";
import { subscribe } from "@/lib/ws-manager";

export interface OHLCData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const RANGE_MS: Record<string, number> = {
  "1m": 24 * 60 * 60 * 1000,
  "5m": 7 * 24 * 60 * 60 * 1000,
  "15m": 30 * 24 * 60 * 60 * 1000,
  "30m": 90 * 24 * 60 * 60 * 1000,
  "1h": 365 * 24 * 60 * 60 * 1000,
  "4h": 90 * 24 * 60 * 60 * 1000,
  "1d": 365 * 24 * 60 * 60 * 1000,
  "1w": 730 * 24 * 60 * 60 * 1000,
};

const WS_INTERVAL: Record<Interval, string> = {
  "1s": "1s",
  "5s": "1s",
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

const MAX_SUB_MINUTE_CANDLES = 3600;

async function fetchHistoricalCandles(
  symbol: string,
  interval: Interval
): Promise<OHLCData[]> {
  if (interval === "1s" || interval === "5s") return [];

  const now = Date.now();
  const rangeMs = RANGE_MS[interval] || 24 * 60 * 60 * 1000;
  const startTime = now - rangeMs;

  const limit = 1000;
  const allCandles: OHLCData[] = [];
  let fetchStart = startTime;

  while (fetchStart < now) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${fetchStart}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const raw: unknown[][] = await res.json();
    if (raw.length === 0) break;

    for (const k of raw) {
      allCandles.push({
        time: Math.floor((k[0] as number) / 1000),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      });
    }

    const lastTime = raw[raw.length - 1][0] as number;
    if (lastTime <= fetchStart) break;
    fetchStart = lastTime + 1;
    if (raw.length < limit) break;
  }

  return allCandles;
}

function floorToInterval(timeSec: number, intervalSec: number): number {
  return Math.floor(timeSec / intervalSec) * intervalSec;
}

/**
 * Hook that fetches historical candles from Binance REST, then streams
 * live updates via the shared WebSocket manager (SharedWorker when
 * available, direct WebSocket as fallback).
 */
export function useBinanceKline(symbol: string | null, interval: Interval) {
  const [data, setData] = useState<OHLCData[]>([]);
  const [loading, setLoading] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!symbol) {
      setData([]);
      return;
    }

    // Clean up previous subscription
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    let cancelled = false;
    setLoading(true);

    const wsInterval = WS_INTERVAL[interval];
    const is5s = interval === "5s";
    const isSub1m = interval === "1s" || interval === "5s";
    const streamName = `${symbol.toLowerCase()}@kline_${wsInterval}`;

    const handleMessage = (raw: string) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(raw);
        if (msg.e !== "kline") return;
        const k = msg.k;

        const rawTime = Math.floor(k.t / 1000);
        const price = parseFloat(k.c);
        const open = parseFloat(k.o);
        const high = parseFloat(k.h);
        const low = parseFloat(k.l);
        const volume = parseFloat(k.v);

        if (is5s) {
          const bucketTime = floorToInterval(rawTime, 5);
          setData((prev) => {
            const arr = [...prev];
            const lastIdx = arr.length - 1;
            if (lastIdx >= 0 && arr[lastIdx].time === bucketTime) {
              arr[lastIdx] = {
                ...arr[lastIdx],
                high: Math.max(arr[lastIdx].high, high),
                low: Math.min(arr[lastIdx].low, low),
                close: price,
                volume: arr[lastIdx].volume + volume,
              };
            } else {
              arr.push({ time: bucketTime, open, high, low, close: price, volume });
              if (arr.length > MAX_SUB_MINUTE_CANDLES / 5) {
                arr.splice(0, arr.length - MAX_SUB_MINUTE_CANDLES / 5);
              }
            }
            return arr;
          });
        } else {
          const candle: OHLCData = { time: rawTime, open, high, low, close: price, volume };
          setData((prev) => {
            const arr = [...prev];
            const lastIdx = arr.length - 1;
            if (lastIdx >= 0 && arr[lastIdx].time === candle.time) {
              arr[lastIdx] = candle;
            } else if (lastIdx < 0 || candle.time > arr[lastIdx].time) {
              arr.push(candle);
              if (isSub1m && arr.length > MAX_SUB_MINUTE_CANDLES) {
                arr.splice(0, arr.length - MAX_SUB_MINUTE_CANDLES);
              }
            }
            return arr;
          });
        }
      } catch {}
    };

    const connectStream = () => {
      if (cancelled) return;
      unsubRef.current = subscribe(streamName, handleMessage);
    };

    if (isSub1m) {
      setData([]);
      setLoading(false);
      connectStream();
    } else {
      fetchHistoricalCandles(symbol, interval).then((candles) => {
        if (cancelled) return;
        setData(candles);
        setLoading(false);
        connectStream();
      });
    }

    return () => {
      cancelled = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [symbol, interval]);

  return { data, loading };
}
