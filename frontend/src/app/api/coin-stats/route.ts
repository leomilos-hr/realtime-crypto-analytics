import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "BTCUSDT";

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
    );
    if (!res.ok) throw new Error("Binance API error");
    const d = await res.json();

    return NextResponse.json({
      symbol: d.symbol,
      price: parseFloat(d.lastPrice),
      high24h: parseFloat(d.highPrice),
      low24h: parseFloat(d.lowPrice),
      volume: parseFloat(d.volume),
      quoteVolume: parseFloat(d.quoteVolume),
      priceChange: parseFloat(d.priceChange),
      priceChangePct: parseFloat(d.priceChangePercent),
      weightedAvgPrice: parseFloat(d.weightedAvgPrice),
      openPrice: parseFloat(d.openPrice),
      trades: parseInt(d.count),
    });
  } catch {
    return NextResponse.json(null);
  }
}
