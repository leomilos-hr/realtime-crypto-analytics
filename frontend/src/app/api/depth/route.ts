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
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`
    );
    if (!res.ok) throw new Error("Binance API error");
    const data = await res.json();

    // Transform: [[price, qty], ...] -> cumulative depth
    const bids: [number, number][] = [];
    const asks: [number, number][] = [];
    let cumBid = 0;
    let cumAsk = 0;

    // Bids: highest price first (already sorted by Binance)
    for (const [price, qty] of data.bids) {
      cumBid += parseFloat(qty);
      bids.push([parseFloat(price), cumBid]);
    }

    // Asks: lowest price first (already sorted by Binance)
    for (const [price, qty] of data.asks) {
      cumAsk += parseFloat(qty);
      asks.push([parseFloat(price), cumAsk]);
    }

    return NextResponse.json({ bids, asks });
  } catch {
    return NextResponse.json({ bids: [], asks: [] });
  }
}
