import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sanitizeSymbol, isValidRange } from "@/lib/validate";

// Cache for computed RSI
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

// Map range to appropriate Binance interval for RSI source data
const RANGE_TO_INTERVAL: Record<string, string> = {
  "-1h": "1m",
  "-24h": "1m",
  "-7d": "5m",
  "-30d": "15m",
  "-90d": "1h",
  "-365d": "4h",
  "-730d": "1d",
};

function computeRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  if (closes.length < period + 1) return rsi;

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI value
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));

  // Subsequent RSI values using smoothed averages
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const newRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + newRs));
  }

  return rsi;
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

  const cacheKey = `rsi_${symbol}_${range}`;
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

    const rsiValues = computeRSI(closes, 14);

    // RSI values start at index `period` (14)
    const data = rsiValues.map((value, i) => ({
      time: times[i + 14],
      value: Math.round(value * 100) / 100,
    }));

    cache.set(cacheKey, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error("RSI compute error:", error);
    return NextResponse.json(
      { error: "Failed to compute RSI" },
      { status: 500 }
    );
  }
}
