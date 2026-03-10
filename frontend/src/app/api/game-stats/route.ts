import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface GameStats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
}

function getStats(settings: string | null): GameStats {
  const empty = { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0 };
  if (!settings) return empty;
  try {
    const parsed = JSON.parse(settings);
    return parsed.gameStats || empty;
  } catch {
    return empty;
  }
}

// GET — load game stats
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { settings: true },
  });

  return NextResponse.json(getStats(user?.settings || null));
}

// PUT — update game stats
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const stats: GameStats = {
    wins: typeof body.wins === "number" ? Math.max(0, Math.floor(body.wins)) : 0,
    losses: typeof body.losses === "number" ? Math.max(0, Math.floor(body.losses)) : 0,
    draws: typeof body.draws === "number" ? Math.max(0, Math.floor(body.draws)) : 0,
    streak: typeof body.streak === "number" ? Math.max(0, Math.floor(body.streak)) : 0,
    bestStreak: typeof body.bestStreak === "number" ? Math.max(0, Math.floor(body.bestStreak)) : 0,
  };

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { settings: true },
  });

  let parsed: Record<string, unknown> = {};
  try {
    if (user?.settings) parsed = JSON.parse(user.settings);
  } catch {}
  parsed.gameStats = stats;

  await prisma.user.update({
    where: { email: session.user.email },
    data: { settings: JSON.stringify(parsed) },
  });

  return NextResponse.json({ ok: true });
}
