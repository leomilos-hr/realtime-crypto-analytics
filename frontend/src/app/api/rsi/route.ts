import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryInflux, bucket } from "@/lib/influxdb";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const range = searchParams.get("range") || "-24h";

  const query = `
    from(bucket: "${bucket}")
      |> range(start: ${range})
      |> filter(fn: (r) => r._measurement == "rsi")
      |> filter(fn: (r) => r.symbol == "${symbol}")
      |> filter(fn: (r) => r._field == "rsi")
      |> sort(columns: ["_time"])
  `;

  try {
    const rows = await queryInflux<any>(query);
    const data = rows.map((r: any) => ({
      time: Math.floor(new Date(r._time).getTime() / 1000),
      value: r._value,
    }));
    return NextResponse.json(data);
  } catch (error) {
    console.error("RSI query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RSI data" },
      { status: 500 }
    );
  }
}
