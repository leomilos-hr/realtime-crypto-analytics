import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Cache exchange rates for 1 hour
let cached: { rates: Record<string, number>; ts: number } | null = null;
const TTL = 60 * 60 * 1000;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cached && Date.now() - cached.ts < TTL) {
    return NextResponse.json(cached.rates);
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("Exchange rate API error");
    const data = await res.json();
    const rates: Record<string, number> = {
      USD: 1,
      EUR: data.rates?.EUR || 0.92,
      GBP: data.rates?.GBP || 0.79,
    };
    cached = { rates, ts: Date.now() };
    return NextResponse.json(rates);
  } catch {
    // Fallback rates if API is down
    const fallback = { USD: 1, EUR: 0.92, GBP: 0.79 };
    return NextResponse.json(fallback);
  }
}
