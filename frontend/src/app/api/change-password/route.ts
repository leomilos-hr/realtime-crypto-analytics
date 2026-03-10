import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidPassword } from "@/lib/validate";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 password change attempts per 15 minutes per user
  const rl = checkRateLimit(`change-pw:${session.user.email}`, { limit: 5, windowSec: 900 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const body = await req.json();
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  const pwCheck = isValidPassword(newPassword);
  if (!pwCheck.valid) {
    return NextResponse.json({ error: pwCheck.error }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { password: true, provider: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Google-only users don't have a password — they can set one
  if (user.password) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email: session.user.email },
    data: { password: hashed },
  });

  return NextResponse.json({ ok: true });
}
