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
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const query = `
    from(bucket: "${bucket}")
      |> range(start: -24h)
      |> filter(fn: (r) => r._measurement == "alerts")
      |> filter(fn: (r) => r._field == "message" or r._field == "price" or r._field == "pct_change" or r._field == "rsi")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: ${limit})
  `;

  try {
    const rows = await queryInflux<any>(query);
    const data = rows.map((r: any) => ({
      time: Math.floor(new Date(r._time).getTime() / 1000),
      symbol: r.symbol,
      type: r.type,
      severity: r.severity,
      message: r.message,
      price: r.price,
      pct_change: r.pct_change,
      rsi: r.rsi,
    }));
    return NextResponse.json(data);
  } catch (error) {
    console.error("Alerts query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}
