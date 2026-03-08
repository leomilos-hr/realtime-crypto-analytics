import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CRYPTOPANIC_TOKEN = process.env.CRYPTOPANIC_API_TOKEN || "";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let cache: { data: any; ts: number } | null = null;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const currency = searchParams.get("currency") || "";
  const filter = searchParams.get("filter") || "hot";

  // Check cache
  const cacheKey = `${currency}:${filter}`;
  if (cache && cache.ts > Date.now() - CACHE_TTL && cache.data?._key === cacheKey) {
    return NextResponse.json(cache.data.results);
  }

  if (!CRYPTOPANIC_TOKEN) {
    return NextResponse.json([]);
  }

  try {
    const params = new URLSearchParams({
      auth_token: CRYPTOPANIC_TOKEN,
      public: "true",
      filter,
    });
    if (currency) params.set("currencies", currency);

    const res = await fetch(
      `https://cryptopanic.com/api/free/v1/posts/?${params.toString()}`,
      { next: { revalidate: 300 } }
    );

    if (!res.ok) {
      console.error("CryptoPanic API error:", res.status);
      return NextResponse.json([]);
    }

    const json = await res.json();
    const results = (json.results || []).slice(0, 20).map((item: any) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      source: item.source?.title || "Unknown",
      published: item.published_at,
      currencies: (item.currencies || []).map((c: any) => c.code),
      kind: item.kind,
      votes: item.votes || {},
    }));

    cache = { data: { _key: cacheKey, results }, ts: Date.now() };
    return NextResponse.json(results);
  } catch (err) {
    console.error("CryptoPanic fetch error:", err);
    return NextResponse.json([]);
  }
}
