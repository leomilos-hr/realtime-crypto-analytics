import { NextRequest, NextResponse } from "next/server";
import { sanitizeSymbol } from "@/lib/validate";

// Cache sparkline data for 10 minutes
const cache = new Map<string, { data: number[]; ts: number }>();
const TTL = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const symbol = sanitizeSymbol(req.nextUrl.searchParams.get("symbol")) || "BTCUSDT";
  const cacheKey = symbol;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Fetch 7 days of 4-hour candles from Binance (42 data points)
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=4h&limit=42`
    );
    if (!res.ok) throw new Error("Binance API error");
    const klines = await res.json();
    // Extract close prices
    const prices: number[] = klines.map((k: unknown[]) => parseFloat(k[4] as string));
    cache.set(cacheKey, { data: prices, ts: Date.now() });
    return NextResponse.json(prices);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
