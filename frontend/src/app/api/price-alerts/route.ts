import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface PriceAlert {
  id: string;
  coin: string;
  ticker: string;
  condition: "above" | "below";
  price: number;
  triggered?: boolean;
}

function getAlerts(settings: string | null): PriceAlert[] {
  if (!settings) return [];
  try {
    const parsed = JSON.parse(settings);
    return parsed.priceAlerts || [];
  } catch {
    return [];
  }
}

function mergeAlerts(settings: string | null, alerts: PriceAlert[]): string {
  let parsed: Record<string, unknown> = {};
  try {
    if (settings) parsed = JSON.parse(settings);
  } catch {}
  parsed.priceAlerts = alerts;
  return JSON.stringify(parsed);
}

// GET — load user's price alerts
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { settings: true },
  });

  return NextResponse.json(getAlerts(user?.settings || null));
}

// POST — add a new price alert
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const coin = typeof body.coin === "string" ? body.coin.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : "";
  const ticker = typeof body.ticker === "string" ? body.ticker.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) : "";
  const condition = body.condition as string;
  const price = typeof body.price === "number" ? body.price : 0;

  if (!coin || !ticker || !condition || !price || !["above", "below"].includes(condition) || price <= 0) {
    return NextResponse.json({ error: "Invalid alert data" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { settings: true },
  });

  const alerts = getAlerts(user?.settings || null);
  const newAlert: PriceAlert = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    coin,
    ticker,
    condition: condition as "above" | "below",
    price,
  };
  alerts.push(newAlert);

  await prisma.user.update({
    where: { email: session.user.email },
    data: { settings: mergeAlerts(user?.settings || null, alerts) },
  });

  return NextResponse.json(newAlert, { status: 201 });
}

// DELETE — remove a price alert
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Alert ID required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { settings: true },
  });

  const alerts = getAlerts(user?.settings || null).filter((a) => a.id !== id);

  await prisma.user.update({
    where: { email: session.user.email },
    data: { settings: mergeAlerts(user?.settings || null, alerts) },
  });

  return NextResponse.json({ ok: true });
}
