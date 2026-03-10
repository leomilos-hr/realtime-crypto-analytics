import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cache: { data: any; ts: number; key: string } | null = null;

const CATEGORIES = ["World", "Business", "Technology", "Science", "Health", "Entertainment", "Sports", "US"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || "World";

  // Validate category
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json([]);
  }

  // Check cache (cache the full response, filter by category)
  if (cache && cache.ts > Date.now() - CACHE_TTL && cache.key === "all") {
    return NextResponse.json(cache.data[category] || []);
  }

  try {
    const res = await fetch("https://ok.surf/api/v1/cors/news-feed", {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      console.error("News API error:", res.status);
      return NextResponse.json([]);
    }

    const json = await res.json();
    cache = { data: json, ts: Date.now(), key: "all" };
    return NextResponse.json(json[category] || []);
  } catch (err) {
    console.error("News fetch error:", err);
    return NextResponse.json([]);
  }
}
