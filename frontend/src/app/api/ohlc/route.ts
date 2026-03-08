import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryInflux, bucket } from "@/lib/influxdb";
import { INTERVALS, SYMBOLS } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol") || "BTCUSDT";
  const interval = searchParams.get("interval") || "1m";
  const from = searchParams.get("from") || "-24h";
  const to = searchParams.get("to") || "now()";

  if (!SYMBOLS.includes(symbol as any)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }
  if (!INTERVALS.includes(interval as any)) {
    return NextResponse.json({ error: "Invalid interval" }, { status: 400 });
  }

  const measurement = `ohlc_${interval}`;
  const rangeStart = from.startsWith("-") ? from : `${from}`;
  const rangeStop = to === "now()" ? "now()" : `${to}`;

  const query = `
    from(bucket: "${bucket}")
      |> range(start: ${rangeStart}, stop: ${rangeStop})
      |> filter(fn: (r) => r._measurement == "${measurement}")
      |> filter(fn: (r) => r.symbol == "${symbol}")
      |> filter(fn: (r) => r._field == "open" or r._field == "high" or r._field == "low" or r._field == "close" or r._field == "volume" or r._field == "vwap")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;

  try {
    const rows = await queryInflux<any>(query);
    const data = rows.map((r: any) => ({
      time: Math.floor(new Date(r._time).getTime() / 1000),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      vwap: r.vwap,
    }));
    return NextResponse.json(data);
  } catch (error) {
    console.error("OHLC query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
