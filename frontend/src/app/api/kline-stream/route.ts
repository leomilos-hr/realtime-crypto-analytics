import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sanitizeSymbol } from "@/lib/validate";
import { INTERVALS } from "@/lib/types";
import WebSocket from "ws";

/**
 * SSE endpoint that proxies Binance kline WebSocket data.
 * Hides the upstream Binance URL from clients and allows
 * server-side caching/transformation in the future.
 *
 * Usage: GET /api/kline-stream?symbol=BTCUSDT&interval=1m
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const symbol = sanitizeSymbol(req.nextUrl.searchParams.get("symbol"));
  const interval = req.nextUrl.searchParams.get("interval") || "1m";

  if (!symbol) {
    return new Response("Invalid symbol", { status: 400 });
  }
  if (!INTERVALS.includes(interval as any)) {
    return new Response("Invalid interval", { status: 400 });
  }

  // Map 5s to 1s stream (client aggregates)
  const wsInterval = interval === "5s" ? "1s" : interval;
  const streamName = `${symbol.toLowerCase()}@kline_${wsInterval}`;

  let ws: WebSocket | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        closed = true;
        if (ws) {
          try { ws.close(); } catch {}
          ws = null;
        }
      };

      const connect = () => {
        if (closed) return;
        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);

        ws.on("message", (raw: Buffer) => {
          if (closed) return;
          send(raw.toString());
        });

        ws.on("error", () => {});

        ws.on("close", () => {
          if (!closed) {
            setTimeout(connect, 3000);
          }
        });
      };

      connect();

      // Send keepalive every 15 seconds
      const keepalive = setInterval(() => {
        if (closed) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
          cleanup();
        }
      }, 15000);
    },
    cancel() {
      closed = true;
      if (ws) {
        try { ws.close(); } catch {}
        ws = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
