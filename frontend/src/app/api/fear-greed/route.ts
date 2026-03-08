import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let cache: { data: any; ts: number } | null = null;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (cache && cache.ts > Date.now() - CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=30");
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    const data = (json.data || []).map((d: any) => ({
      value: parseInt(d.value),
      label: d.value_classification,
      timestamp: parseInt(d.timestamp) * 1000,
    }));
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
