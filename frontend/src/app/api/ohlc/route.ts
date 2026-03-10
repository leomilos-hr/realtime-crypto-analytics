import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { INTERVALS } from "@/lib/types";
import { sanitizeSymbol, isValidRange } from "@/lib/validate";

// Simple in-memory cache for Binance responses
const cache = new Map<string, { data: unknown[]; ts: number }>();

// Cache TTL per interval — shorter for fast-moving intervals
const CACHE_TTL: Record<string, number> = {
  "1m": 10 * 1000,        // 10 sec
  "5m": 30 * 1000,        // 30 sec
  "15m": 60 * 1000,       // 1 min
  "30m": 2 * 60 * 1000,   // 2 min
  "1h": 3 * 60 * 1000,    // 3 min
  "4h": 5 * 60 * 1000,    // 5 min
  "1d": 15 * 60 * 1000,   // 15 min
  "1w": 60 * 60 * 1000,   // 1 hour
};

// Map range strings to ms durations for Binance startTime
const RANGE_MS: Record<string, number> = {
  "-24h": 24 * 60 * 60 * 1000,
  "-7d": 7 * 24 * 60 * 60 * 1000,
  "-30d": 30 * 24 * 60 * 60 * 1000,
  "-90d": 90 * 24 * 60 * 60 * 1000,
  "-365d": 365 * 24 * 60 * 60 * 1000,
  "-730d": 730 * 24 * 60 * 60 * 1000,
};

async function fetchFromBinance(symbol: string, interval: string, from: string) {
  const cacheKey = `${symbol}_${interval}_${from}`;
  const cached = cache.get(cacheKey);
  const ttl = CACHE_TTL[interval] || 60 * 1000;
  if (cached && Date.now() - cached.ts < ttl) {
    return cached.data;
  }

  const rangeMs = RANGE_MS[from] || 24 * 60 * 60 * 1000;
  const startTime = Date.now() - rangeMs;

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${startTime}&limit=1000`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance API error: ${res.status}`);
  }

  const klines: unknown[][] = await res.json();
  const data = klines.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));

  cache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const symbol = sanitizeSymbol(searchParams.get("symbol")) || "BTCUSDT";
  const interval = searchParams.get("interval") || "1m";
  const from = searchParams.get("from") || "-24h";

  if (!INTERVALS.includes(interval as any)) {
    return NextResponse.json({ error: "Invalid interval" }, { status: 400 });
  }

  if (!isValidRange(from)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  try {
    const data = await fetchFromBinance(symbol, interval, from);
    return NextResponse.json(data);
  } catch (error) {
    console.error("OHLC query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
