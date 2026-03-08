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
      |> filter(fn: (r) => r._measurement == "moving_averages")
      |> filter(fn: (r) => r.symbol == "${symbol}")
      |> filter(fn: (r) => r._field == "sma_7" or r._field == "sma_14" or r._field == "price")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
  `;

  try {
    const rows = await queryInflux<any>(query);
    const data = rows.map((r: any) => ({
      time: Math.floor(new Date(r._time).getTime() / 1000),
      price: r.price,
      sma_7: r.sma_7,
      sma_14: r.sma_14,
    }));
    return NextResponse.json(data);
  } catch (error) {
    console.error("SMA query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch SMA data" },
      { status: 500 }
    );
  }
}
