import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface UserSettings {
  defaultInterval?: string;
  currency?: string;
  chartStyle?: string;
  theme?: string;
  compactMode?: boolean;
  numberFormat?: { decimals: string; grouping: string };
  notifications?: boolean;
  priceAlerts?: unknown[];
}

// GET — load user settings
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { settings: true, name: true, email: true, provider: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let settings: UserSettings = {};
  try {
    if (user.settings) settings = JSON.parse(user.settings);
  } catch {}

  return NextResponse.json({
    name: user.name,
    email: user.email,
    provider: user.provider,
    settings,
  });
}

// PUT — update user settings (merges with existing)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, settings } = body as { name?: string; settings?: Partial<UserSettings> };

  const updateData: Record<string, string | null> = {};
  if (name !== undefined) updateData.name = name || null;

  if (settings !== undefined) {
    // Merge with existing settings to preserve priceAlerts etc.
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { settings: true },
    });
    let existing: UserSettings = {};
    try {
      if (user?.settings) existing = JSON.parse(user.settings);
    } catch {}
    const merged = { ...existing, ...settings };
    updateData.settings = JSON.stringify(merged);
  }

  await prisma.user.update({
    where: { email: session.user.email },
    data: updateData,
  });

  return NextResponse.json({ ok: true });
}
