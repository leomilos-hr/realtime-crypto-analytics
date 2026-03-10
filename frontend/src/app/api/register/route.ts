import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidEmail, isValidPassword, sanitizeString } from "@/lib/validate";

export async function POST(req: Request) {
  // Rate limit: 5 registration attempts per 15 minutes per IP
  const ip = getClientIp(req);
  const rl = checkRateLimit(`register:${ip}`, { limit: 5, windowSec: 900 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? sanitizeString(body.name, 100) : null;

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const pwCheck = isValidPassword(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.error }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const defaultCoins = JSON.stringify([
      { pair: "BTCUSDT", ticker: "BTC", name: "Bitcoin" },
      { pair: "ETHUSDT", ticker: "ETH", name: "Ethereum" },
      { pair: "LTCUSDT", ticker: "LTC", name: "Litecoin" },
    ]);
    await prisma.user.create({
      data: { email, password: hashed, name: name || null, dashboardCoins: defaultCoins },
    });

    return NextResponse.json({ message: "Account created" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
