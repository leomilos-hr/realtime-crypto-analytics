import { NextResponse } from "next/server";
import { queryInflux, bucket } from "@/lib/influxdb";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendPrices = async () => {
        try {
          const query = `
            from(bucket: "${bucket}")
              |> range(start: -5m)
              |> filter(fn: (r) => r._measurement == "ohlc_1m")
              |> filter(fn: (r) => r._field == "close" or r._field == "open")
              |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
              |> group(columns: ["symbol"])
              |> last(column: "_time")
          `;

          const rows = await queryInflux<any>(query);
          const prices = rows.map((r: any) => ({
            symbol: r.symbol,
            price: r.close,
            open: r.open,
            time: Math.floor(new Date(r._time).getTime() / 1000),
          }));

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(prices)}\n\n`)
          );
        } catch (error) {
          console.error("SSE error:", error);
        }
      };

      await sendPrices();
      const interval = setInterval(sendPrices, 3000);

      // Clean up on close
      const cleanup = () => clearInterval(interval);
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Keep alive ping
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(keepAlive);
          cleanup();
        }
      }, 15000);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
