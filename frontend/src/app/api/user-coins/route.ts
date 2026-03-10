import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — load user's saved coins
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { dashboardCoins: true },
  });

  if (!user?.dashboardCoins) {
    return NextResponse.json(null);
  }

  try {
    return NextResponse.json(JSON.parse(user.dashboardCoins));
  } catch {
    return NextResponse.json(null);
  }
}

// PUT — save user's coins
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const coins = await req.json();
  if (!Array.isArray(coins)) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: { dashboardCoins: JSON.stringify(coins) },
  });

  return NextResponse.json({ ok: true });
}
