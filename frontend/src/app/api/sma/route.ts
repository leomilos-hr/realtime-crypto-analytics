import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sanitizeSymbol, isValidRange } from "@/lib/validate";

// Cache for computed SMA
const cache = new Map<string, { data: unknown[]; ts: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

// Map range strings to ms durations
const RANGE_MS: Record<string, number> = {
  "-1h": 60 * 60 * 1000,
  "-24h": 24 * 60 * 60 * 1000,
  "-7d": 7 * 24 * 60 * 60 * 1000,
  "-30d": 30 * 24 * 60 * 60 * 1000,
  "-90d": 90 * 24 * 60 * 60 * 1000,
  "-365d": 365 * 24 * 60 * 60 * 1000,
  "-730d": 730 * 24 * 60 * 60 * 1000,
};

// Map range to appropriate Binance interval for SMA source data
const RANGE_TO_INTERVAL: Record<string, string> = {
  "-1h": "1m",
  "-24h": "1m",
  "-7d": "5m",
  "-30d": "15m",
  "-90d": "1h",
  "-365d": "4h",
  "-730d": "1d",
};

function computeSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const symbol = sanitizeSymbol(searchParams.get("symbol")) || "BTCUSDT";
  const range = searchParams.get("range") || "-24h";

  if (!isValidRange(range)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  const cacheKey = `sma_${symbol}_${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const rangeMs = RANGE_MS[range] || 24 * 60 * 60 * 1000;
    const startTime = Date.now() - rangeMs;
    const interval = RANGE_TO_INTERVAL[range] || "1m";

    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${startTime}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance API error: ${res.status}`);

    const klines: unknown[][] = await res.json();
    const times = klines.map((k) => Math.floor((k[0] as number) / 1000));
    const closes = klines.map((k) => parseFloat(k[4] as string));

    const sma7 = computeSMA(closes, 7);
    const sma14 = computeSMA(closes, 14);

    const data = times.map((time, i) => ({
      time,
      sma_7: sma7[i] !== null ? Math.round(sma7[i]! * 100) / 100 : null,
      sma_14: sma14[i] !== null ? Math.round(sma14[i]! * 100) / 100 : null,
    })).filter((d) => d.sma_7 !== null || d.sma_14 !== null);

    cache.set(cacheKey, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error("SMA compute error:", error);
    return NextResponse.json(
      { error: "Failed to compute SMA" },
      { status: 500 }
    );
  }
}
